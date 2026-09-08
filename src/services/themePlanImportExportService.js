const ExcelJS = require('exceljs');
const refService = require('./refService');
const themePlanParameterService = require('./themePlanParameterService');
const {
  ID_COLUMN, norm, resolveColumnPositions, readRowTexts,
  interpretIdCell, decorateIdColumn, resolveKeyConflicts, summarize
} = require('./importSheetUtils');

// Tema Plan (theme-category) Excel şablonu. Prensip diğer şablonlarla aynı:
// kullanıcı İSİM girer, tabloya ID yazılır.
//
// İki özel kolon:
//   - "Tema": PLM Theme.Name'dir (örn. "SS 27_IPK_B_SCT1") ve theme_id'ye
//     çözümlenir. Boş bırakılabilir — tema henüz açılmamış plan satırları için.
//   - "Tema Kısa Ad": PLM'de karşılığı olmayan, raporlarda görünen kısa addır
//     (örn. "B-SCT1"). Serbest metindir; boş bırakılırsa seçilen temanın daha
//     önce kaydedilmiş kısa adı (ref_theme.kisa_ad) kullanılır.
const SHEET_NAME = 'TemaPlan';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500;

const COLUMN_DEFS = [
  ID_COLUMN,
  { key: 'marka', header: 'Marka', width: 18, kind: 'lookup', refKey: 'marka', idKey: 'id', idField: 'brand_id', nameField: 'marka', required: true },
  { key: 'sezon', header: 'Sezon', width: 16, kind: 'lookup', refKey: 'sezon', idKey: 'id', idField: 'season_id', nameField: null, required: true },
  { key: 'altSezon', header: 'Alt Sezon', width: 14, kind: 'text-list', listKey: 'altSezon', field: 'alt_sezon' },
  { key: 'tema', header: 'Tema', width: 32, kind: 'lookup', refKey: 'theme', idKey: 'id', idField: 'theme_id', nameField: null },
  { key: 'temaKisaAd', header: 'Tema Kısa Ad', width: 20, kind: 'text', field: 'tema_adi' },
  { key: 'kategori', header: 'Kategori', width: 18, kind: 'lookup', refKey: 'kategori', idKey: 'id', idField: 'sub_category_id', nameField: 'kategori', required: true },
  { key: 'optSay', header: 'Opt Say', width: 12, kind: 'integer', field: 'opt_say', min: 0, max: 100000 },
  { key: 'faz', header: 'Faz', width: 12, kind: 'text', field: 'free_field_three' }
];

// keyOf: ID kolonu boş satırlarda hangi kaydın güncelleneceğini belirler; bu
// yüzden themePlanParameterService.findByKey ile BİREBİR aynı normalizasyonu
// kullanmak zorunda (o da IS NOT DISTINCT FROM ile karşılaştırır).
const n = (v) => (v == null || v === '') ? 'null' : String(v).trim();
const keyOf = (r) => [
  n(r.theme_id), n(r.sub_category_id), n(r.season_id), n(r.alt_sezon)
].join('_');

const mapRef = (rows, idCol) => (rows || []).map((r) => ({ id: r[idCol], ad: r.ad }));

async function loadContext() {
  const [marka, kategori, sezon, altSezon, theme] = await Promise.all([
    refService.listMarka(),
    refService.listKategori(),
    refService.listSezon(),
    refService.listAltSezon(),
    refService.listTheme()
  ]);

  // Tema kısa adı, tema ile 1:1'dir; şablonu doldururken ve boş bırakılan
  // "Tema Kısa Ad" hücrelerini tamamlarken buradan okunur.
  const kisaAdByThemeId = new Map((theme || []).map((t) => [String(t.theme_id), t.kisa_ad || '']));

  return {
    refs: {
      marka: mapRef(marka, 'marka_id'),
      kategori: mapRef(kategori, 'kategori_id'),
      sezon: mapRef(sezon, 'sezon_id'),
      theme: mapRef(theme, 'theme_id')
    },
    kisaAdByThemeId,
    lists: {
      altSezon: mapRef(altSezon, 'alt_sezon_code').map((x) => x.ad)
    }
  };
}

function buildIndex(list) {
  const map = new Map();
  for (const item of list || []) {
    const key = norm(item.ad);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function validationValues(ctx, col) {
  if (col.kind === 'lookup') return (ctx.refs[col.refKey] || []).map((x) => x.ad);
  if (col.kind === 'text-list') return ctx.lists[col.listKey] || [];
  return null;
}

function buildTemplateWorkbook(ctx, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ipekyol Costing DB';
  workbook.created = new Date();

  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME);
  lookupSheet.state = 'veryHidden';

  const namedRanges = {};
  COLUMN_DEFS.forEach((col, colIdx) => {
    const values = validationValues(ctx, col);
    if (!values) return;
    const colLetter = String.fromCharCode(65 + colIdx);
    lookupSheet.getCell(`${colLetter}1`).value = col.key;
    values.forEach((v, i) => { lookupSheet.getCell(`${colLetter}${i + 2}`).value = v; });
    const lastRow = Math.max(values.length + 1, 2);
    const name = `List_${col.key}`;
    workbook.definedNames.add(`${LOOKUP_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${lastRow}`, name);
    namedRanges[col.key] = name;
  });

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = COLUMN_DEFS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    const rowObj = {};
    COLUMN_DEFS.forEach((col) => {
      if (col.kind === 'id') rowObj[col.key] = r.id != null ? Number(r.id) : '';
      else if (col.kind === 'lookup') {
        if (col.nameField) rowObj[col.key] = r[col.nameField] || '';
        else {
          const src = (ctx.refs[col.refKey] || []).find((x) => String(x.id) === String(r[col.idField]));
          rowObj[col.key] = src ? src.ad : '';
        }
      } else if (col.kind === 'integer') rowObj[col.key] = r[col.field] != null ? Number(r[col.field]) : '';
      else rowObj[col.key] = r[col.field] || '';
    });
    sheet.addRow(rowObj);
  });

  const lastValidationRow = Math.max(rows.length + 1, 1) + MIN_VALIDATION_ROWS;
  for (let rowNum = 2; rowNum <= lastValidationRow; rowNum++) {
    COLUMN_DEFS.forEach((col, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      const cell = sheet.getCell(`${colLetter}${rowNum}`);
      if (col.kind === 'integer') {
        cell.dataValidation = {
          type: 'whole', operator: 'between', allowBlank: true, formulae: [col.min, col.max],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: `Geçersiz ${col.header}`,
          error: `${col.header} ${col.min} ile ${col.max} arasında tam sayı olmalıdır.`
        };
      } else if (namedRanges[col.key]) {
        cell.dataValidation = {
          type: 'list', allowBlank: true, formulae: [namedRanges[col.key]],
          showErrorMessage: true, errorStyle: 'stop', errorTitle: `Geçersiz ${col.header}`,
          error: `Lütfen listeden bir ${col.header} değeri seçin.`
        };
      }
    });
  }

  decorateIdColumn(sheet, 'A', lastValidationRow);

  return workbook;
}

function validateSheetRows(sheet, ctx, existingRows) {
  const lookupIdx = {};
  COLUMN_DEFS.filter((c) => c.kind === 'lookup').forEach((c) => { lookupIdx[c.key] = buildIndex(ctx.refs[c.refKey]); });
  const listIdx = {};
  COLUMN_DEFS.filter((c) => c.kind === 'text-list').forEach((c) => {
    const values = ctx.lists[c.listKey] || [];
    listIdx[c.key] = new Map(values.map((v) => [norm(v), v]));
  });

  // Kırılım -> sahibi kayıt id'si (ID kolonu boş satırlarda kullanılır).
  const existingKeyToId = new Map();
  const existingIds = new Set();
  for (const r of existingRows || []) {
    existingKeyToId.set(keyOf(r), r.id);
    existingIds.add(Number(r.id));
  }

  const positions = resolveColumnPositions(sheet, COLUMN_DEFS);
  const seenInFile = new Map();
  const seenIds = new Map();
  const results = [];

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const texts = readRowTexts(row, COLUMN_DEFS, positions);
    if (COLUMN_DEFS.every((col) => !texts[col.key])) return;

    const errors = [];
    const warnings = [];
    const resolved = {};
    const display = {};

    const idInfo = interpretIdCell(texts.id, existingIds, seenIds, rowNumber);
    display.id = texts.id;
    if (idInfo.error) errors.push(idInfo.error);
    if (idInfo.warning) warnings.push(idInfo.warning);

    COLUMN_DEFS.forEach((col) => {
      if (col.kind === 'id') return;
      const txt = texts[col.key];
      display[col.key] = txt;

      if (col.kind === 'lookup') {
        if (!txt) {
          if (col.required) errors.push(`${col.header} boş olamaz.`);
          resolved[col.idField] = null;
          if (col.nameField) resolved[col.nameField] = null;
          return;
        }
        const m = lookupIdx[col.key].get(norm(txt));
        if (!m || m.length === 0) errors.push(`${col.header} listede bulunamadı: "${txt}"`);
        else if (m.length > 1) errors.push(`${col.header} için birden fazla eşleşme bulundu: "${txt}"`);
        else { resolved[col.idField] = m[0][col.idKey]; if (col.nameField) resolved[col.nameField] = m[0].ad; }
      } else if (col.kind === 'integer') {
        // Excel'de boş "Opt Say" planlanmamış kırılım demektir -> 0.
        if (!txt) { resolved[col.field] = 0; return; }
        const num = Number(txt);
        if (Number.isNaN(num) || !Number.isInteger(num) || num < col.min || num > col.max) {
          errors.push(`${col.header} ${col.min}-${col.max} arası tam sayı olmalıdır.`);
        } else resolved[col.field] = num;
      } else if (col.kind === 'text') {
        resolved[col.field] = txt || null;
      } else { // text-list
        if (!txt) { resolved[col.field] = null; return; }
        const canonical = listIdx[col.key].get(norm(txt));
        if (canonical === undefined) errors.push(`${col.header} listede bulunamadı: "${txt}"`);
        else resolved[col.field] = canonical;
      }
    });

    // Tema Kısa Ad boş bırakıldıysa, seçilen temanın bilinen kısa adına düş.
    // (Kısa ad tema ile 1:1'dir; kullanıcıyı her satırda tekrar yazmaya zorlamayız.)
    if (!resolved.tema_adi && resolved.theme_id != null) {
      const bilinen = ctx.kisaAdByThemeId.get(String(resolved.theme_id));
      if (bilinen) resolved.tema_adi = bilinen;
    }

    // Hedef kayıt: önce ID kolonu, ID yoksa kırılım eşleşmesi.
    let targetId = idInfo.id;
    let conflictOwnerId = null;
    let fileKey = null;

    if (errors.length === 0) {
      fileKey = keyOf(resolved);
      if (seenInFile.has(fileKey)) {
        errors.push(`Bu kırılım şablonda ${seenInFile.get(fileKey)}. satırla tekrar ediyor.`);
      } else {
        seenInFile.set(fileKey, rowNumber);
        const keyOwnerId = existingKeyToId.get(fileKey);
        if (targetId == null) {
          if (keyOwnerId != null) targetId = keyOwnerId;
        } else if (keyOwnerId != null && Number(keyOwnerId) !== Number(targetId)) {
          // Kesin kararı ikinci geçiş verir (bkz. resolveKeyConflicts).
          conflictOwnerId = keyOwnerId;
        }
      }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    if (status === 'ok' && targetId != null) resolved.id = targetId;

    results.push({
      rowNumber,
      _fileKey: fileKey,
      _conflictOwnerId: conflictOwnerId,
      id: display.id,
      targetId: status === 'ok' ? (targetId != null ? targetId : null) : null,
      display,
      status,
      errors,
      warnings,
      action: status === 'ok' ? (targetId != null ? 'update' : 'insert') : null,
      resolved: status === 'ok' ? resolved : null
    });
  });

  return summarize(resolveKeyConflicts(results));
}

async function buildTemplateWorkbookFromDb() {
  const [ctx, rows] = await Promise.all([loadContext(), themePlanParameterService.listParameters()]);
  return buildTemplateWorkbook(ctx, rows);
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');
  const [ctx, existingRows] = await Promise.all([loadContext(), themePlanParameterService.listParameters()]);
  return validateSheetRows(sheet, ctx, existingRows);
}

module.exports = {
  buildTemplateWorkbook,
  buildTemplateWorkbookFromDb,
  validateSheetRows,
  parseAndValidateWorkbookBuffer,
  SHEET_NAME,
  COLUMN_DEFS
};
