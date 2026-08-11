const ExcelJS = require('exceljs');
const refService = require('./refService');
const onAdetParameterService = require('./onAdetParameterService');
const {
  ID_COLUMN, norm, resolveColumnPositions, readRowTexts,
  interpretIdCell, decorateIdColumn, resolveKeyConflicts, summarize
} = require('./importSheetUtils');

const SHEET_NAME = 'OnAdetParametreleri';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500;
const ADET_MIN = 0;
const ADET_MAX = 100000;

/**
 * decision_parameters (MU/Sarf) tablosunun Excel akışıyla aynı mantık; farkı 7'li
 * kırılım ve tek bir tam sayı değer alanı (Adet) olması. Bkz. importExportService.js.
 *
 * İlk kolon ID'dir (bkz. importSheetUtils): satır eşleştirmesi kırılıma göre
 * değil, birincil anahtara göre yapılır. Böylece Excel'den bir satırın kırılımı
 * da değiştirilebilir; kopya satır oluşmaz.
 */
const COLUMN_DEFS = [
  ID_COLUMN,
  { key: 'marka', header: 'Marka', width: 22, kind: 'lookup', refKey: 'marka', idKey: 'marka_id', displayField: 'marka_ad', resolvedKey: 'markaId', namedRange: 'ListMarka' },
  { key: 'bolum', header: 'Bölüm', width: 20, kind: 'lookup', refKey: 'bolum', idKey: 'bolum_id', displayField: 'bolum_ad', resolvedKey: 'bolumId', namedRange: 'ListBolum' },
  { key: 'kategori', header: 'Kategori', width: 22, kind: 'lookup', refKey: 'kategori', idKey: 'kategori_id', displayField: 'kategori_ad', resolvedKey: 'kategoriId', namedRange: 'ListKategori' },
  { key: 'altKategori', header: 'Alt Kategori', width: 24, kind: 'lookup', refKey: 'altKategori', idKey: 'alt_kategori_id', displayField: 'alt_kategori_ad', resolvedKey: 'altKategoriId', namedRange: 'ListAltKategori' },
  { key: 'cluster', header: 'Cluster', width: 14, kind: 'lookup', refKey: 'cluster', idKey: 'cluster_code', displayField: 'cluster_ad', resolvedKey: 'clusterCode', namedRange: 'ListCluster' },
  { key: 'lifestyleGrup', header: 'LifeStyle Grubu', width: 22, kind: 'lookup', refKey: 'lifestyleGrup', idKey: 'lifestyle_grup_id', displayField: 'lifestyle_grup_ad', resolvedKey: 'lifestyleGrupId', namedRange: 'ListLifestyleGrup' },
  { key: 'sezon', header: 'Sezon', width: 18, kind: 'lookup', refKey: 'sezon', idKey: 'sezon_id', displayField: 'sezon_ad', resolvedKey: 'sezonId', namedRange: 'ListSezon' },
  { key: 'altSezon', header: 'Alt Sezon', width: 16, kind: 'lookup', refKey: 'altSezon', idKey: 'alt_sezon_code', displayField: 'alt_sezon_ad', resolvedKey: 'altSezonCode', namedRange: 'ListAltSezon' },
  { key: 'adet', header: 'Adet', width: 12, kind: 'integer', resolvedKey: 'adet', min: ADET_MIN, max: ADET_MAX }
];

const LOOKUP_COLUMNS = COLUMN_DEFS.filter((c) => c.kind === 'lookup');

function buildTemplateWorkbook({ refs, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ipekyol Costing DB';
  workbook.created = new Date();

  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME);
  lookupSheet.state = 'veryHidden';

  LOOKUP_COLUMNS.forEach((col, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    const items = (refs[col.refKey] || []).map((item) => item.ad);
    lookupSheet.getCell(`${colLetter}1`).value = col.refKey;
    items.forEach((name, i) => {
      lookupSheet.getCell(`${colLetter}${i + 2}`).value = name;
    });
    const lastRow = Math.max(items.length + 1, 2);
    workbook.definedNames.add(`${LOOKUP_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${lastRow}`, col.namedRange);
  });

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = COLUMN_DEFS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    const rowObj = {};
    COLUMN_DEFS.forEach((col) => {
      if (col.kind === 'lookup') {
        rowObj[col.key] = r[col.displayField] || '';
      } else {
        rowObj[col.key] = r[col.key] != null ? Number(r[col.key]) : '';
      }
    });
    sheet.addRow(rowObj);
  });

  const lastValidationRow = Math.max(rows.length + 1, 1) + MIN_VALIDATION_ROWS;

  for (let rowNum = 2; rowNum <= lastValidationRow; rowNum++) {
    COLUMN_DEFS.forEach((col, colIdx) => {
      if (col.kind === 'id') return; // decorateIdColumn ile ayrıca işleniyor
      const colLetter = String.fromCharCode(65 + colIdx);
      const cell = sheet.getCell(`${colLetter}${rowNum}`);
      if (col.kind === 'lookup') {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [col.namedRange],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: `Geçersiz ${col.header}`,
          error: `Lütfen listeden bir ${col.header} değeri seçin.`
        };
      } else {
        cell.dataValidation = {
          type: 'whole',
          operator: 'between',
          allowBlank: true,
          formulae: [col.min, col.max],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: `Geçersiz ${col.header}`,
          error: `${col.header} ${col.min} ile ${col.max} arasında tam sayı olmalıdır.`
        };
      }
    });
  }

  decorateIdColumn(sheet, 'A', lastValidationRow);

  return workbook;
}

function buildLookupIndex(list, idKey) {
  const map = new Map();
  for (const item of list || []) {
    const key = norm(item.ad);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item[idKey]);
  }
  return map;
}

function validateSheetRows(sheet, refs, existingRows) {
  const lookupIndexes = {};
  LOOKUP_COLUMNS.forEach((col) => {
    lookupIndexes[col.key] = buildLookupIndex(refs[col.refKey], col.idKey);
  });

  // Kırılım -> o kırılımın sahibi kayıt id'si. ID kolonu boş satırlarda eski
  // (kırılım bazlı) eşleştirmeyi sürdürmek ve ID ile gelen bir satırın başka
  // bir kaydın kırılımına taşınmasını yakalamak için gerekli.
  const existingKeyToId = new Map();
  const existingIds = new Set();
  for (const r of existingRows || []) {
    existingKeyToId.set(LOOKUP_COLUMNS.map((col) => r[col.idKey]).join('~'), r.id);
    existingIds.add(Number(r.id));
  }

  const positions = resolveColumnPositions(sheet, COLUMN_DEFS);
  const seenInFile = new Map();
  const seenIds = new Map();
  const results = [];

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const texts = readRowTexts(row, COLUMN_DEFS, positions);

    const isEmpty = COLUMN_DEFS.every((col) => !texts[col.key]);
    if (isEmpty) return;

    const errors = [];
    const warnings = [];
    const resolved = {};
    const display = {};

    const idInfo = interpretIdCell(texts.id, existingIds, seenIds, rowNumber);
    display.id = texts.id;
    if (idInfo.error) errors.push(idInfo.error);
    if (idInfo.warning) warnings.push(idInfo.warning);

    LOOKUP_COLUMNS.forEach((col) => {
      const txt = texts[col.key];
      display[col.key] = txt;
      if (!txt) {
        errors.push(`${col.header} boş olamaz.`);
        resolved[col.resolvedKey] = null;
        return;
      }
      const matches = lookupIndexes[col.key].get(norm(txt));
      if (!matches || matches.length === 0) {
        errors.push(`${col.header} listede bulunamadı: "${txt}"`);
        resolved[col.resolvedKey] = null;
      } else if (matches.length > 1) {
        errors.push(`${col.header} için birden fazla eşleşme bulundu: "${txt}"`);
        resolved[col.resolvedKey] = null;
      } else {
        resolved[col.resolvedKey] = matches[0];
      }
    });

    const numberColumns = COLUMN_DEFS.filter((c) => c.kind === 'integer');
    numberColumns.forEach((col) => {
      const txt = texts[col.key];
      display[col.key] = txt;
      const num = Number(txt);
      if (!txt || Number.isNaN(num) || !Number.isInteger(num)) {
        errors.push(`${col.header} tam sayı olmalıdır.`);
        resolved[col.resolvedKey] = txt;
      } else if (num < col.min || num > col.max) {
        errors.push(`${col.header} ${col.min} ile ${col.max} arasında olmalıdır.`);
        resolved[col.resolvedKey] = num;
      } else {
        resolved[col.resolvedKey] = num;
      }
    });

    // Hedef kayıt: önce ID kolonu, ID yoksa kırılım eşleşmesi (eski davranış).
    let targetId = idInfo.id;
    let conflictOwnerId = null;

    let fileKey = null;
    const hasAllLookupIds = LOOKUP_COLUMNS.every((col) => resolved[col.resolvedKey] != null);
    if (hasAllLookupIds) {
      fileKey = LOOKUP_COLUMNS.map((col) => resolved[col.resolvedKey]).join('~');
      if (seenInFile.has(fileKey)) {
        errors.push(`Bu kırılım şablonda ${seenInFile.get(fileKey)}. satırla tekrar ediyor.`);
      } else {
        seenInFile.set(fileKey, rowNumber);
      }

      const keyOwnerId = existingKeyToId.get(fileKey);
      if (targetId == null) {
        if (keyOwnerId != null) targetId = keyOwnerId;
      } else if (keyOwnerId != null && Number(keyOwnerId) !== Number(targetId)) {
        // Çakışma olabilir; kesin kararı ikinci geçiş verir (sahibi kayıt aynı
        // dosyada başka bir kırılıma taşınıyorsa bu kırılım boşalıyor demektir).
        conflictOwnerId = keyOwnerId;
      }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    const action = status === 'ok' ? (targetId != null ? 'update' : 'insert') : null;
    if (status === 'ok' && targetId != null) resolved.id = targetId;

    results.push({
      rowNumber,
      _fileKey: fileKey,
      _conflictOwnerId: conflictOwnerId,
      id: display.id,
      targetId: status === 'ok' ? (targetId != null ? targetId : null) : null,
      marka: display.marka,
      bolum: display.bolum,
      kategori: display.kategori,
      altKategori: display.altKategori,
      cluster: display.cluster,
      lifestyleGrup: display.lifestyleGrup,
      sezon: display.sezon,
      altSezon: display.altSezon,
      adet: display.adet,
      status,
      errors,
      warnings,
      action,
      resolved: status === 'ok' ? resolved : null
    });
  });

  return summarize(resolveKeyConflicts(results));
}

async function fetchAllRefs() {
  const [marka, bolum, kategori, altKategori, cluster, lifestyleGrup, sezon, altSezon] = await Promise.all([
    refService.listMarka(),
    refService.listBolum(),
    refService.listKategori(),
    refService.listAltKategori(),
    refService.listCluster(),
    refService.listLifestyleGrup(),
    refService.listSezon(),
    refService.listAltSezon()
  ]);
  return { marka, bolum, kategori, altKategori, cluster, lifestyleGrup, sezon, altSezon };
}

async function buildTemplateWorkbookFromDb() {
  const [refs, rows] = await Promise.all([fetchAllRefs(), onAdetParameterService.listParameters()]);
  return buildTemplateWorkbook({ refs, rows });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');
  }

  const [refs, existingRows] = await Promise.all([fetchAllRefs(), onAdetParameterService.listParameters()]);

  return validateSheetRows(sheet, refs, existingRows);
}

module.exports = {
  buildTemplateWorkbook,
  buildTemplateWorkbookFromDb,
  validateSheetRows,
  parseAndValidateWorkbookBuffer,
  SHEET_NAME,
  COLUMN_DEFS
};
