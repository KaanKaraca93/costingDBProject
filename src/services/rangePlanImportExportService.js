const ExcelJS = require('exceljs');
const refService = require('./refService');
const rangePlanParameterService = require('./rangePlanParameterService');
const { RANGE_FIELDS, RANGE_TAGS, RANGE_LIFESTYLE_GROUPS } = require('../config/rangeFields');

// Range Plan (v7.2) Excel şablonu. Prensip: ön yüzde/şablonda İSİM kolonları,
// tabloda ID'ler. Özel iki kolon:
//   - "Range": PLM Extended Field'ın adıdır (Detay/Boy/... sabit 7); ExtFldId'ye
//     çözümlenir (RANGE_FIELDS).
//   - "Range Detayı": seçilen Range'in ExtendedFieldDropDown değerinin adıdır;
//     (ExtFldId + Name) çifti ile ExtFldDropDownId'ye (DropDownValue) çözümlenir.
//     Aynı Name farklı ExtFldId'lerde tekrar edebildiğinden çift zorunludur.
const SHEET_NAME = 'RangePlan';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500;

// Not: loadContext ref listelerini {id, ad} olarak normalize eder; idKey = 'id'.
const COLUMN_DEFS = [
  { key: 'marka', header: 'Marka', width: 18, kind: 'lookup', refKey: 'marka', idKey: 'id', idField: 'brand_id', nameField: 'marka', required: true },
  { key: 'urunGrubu', header: 'Ürün Gurbu', width: 18, kind: 'lookup', refKey: 'kategori', idKey: 'id', idField: 'sub_category_id', nameField: 'urun_grubu', required: true },
  { key: 'rangeTag', header: 'RangeTag', width: 12, kind: 'text-list', listKey: 'rangeTags', field: 'range_tag' },
  { key: 'range', header: 'Range', width: 14, kind: 'range', listKey: 'ranges' },
  { key: 'rangeDetayi', header: 'Range Detayı', width: 20, kind: 'range-detay', listKey: 'detayNames', required: true },
  { key: 'koleksiyonTipi', header: 'Koleksiyon Tipi', width: 18, kind: 'lookup', refKey: 'koleksiyonTipi', idKey: 'id', idField: 'cud5_id', nameField: null },
  { key: 'optionSay', header: 'Option Say', width: 12, kind: 'integer', field: 'option_say', min: 0, max: 100000 },
  { key: 'sezon', header: 'Sezon', width: 16, kind: 'lookup', refKey: 'sezon', idKey: 'id', idField: 'season_id', nameField: null, required: true },
  { key: 'altSezon', header: 'Alt Sezon', width: 14, kind: 'text-list', refKey: 'altSezon', listKey: 'altSezon', field: 'alt_sezon' },
  { key: 'lifeStyleGrup', header: 'Life Style Grup', width: 16, kind: 'text-list', listKey: 'lifeStyleGroups', field: 'life_style_grup' }
];

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

// keyOf: RangeSayac makeKey ile aynı normalizasyon (NULL güvenli).
const n = (v) => (v == null || v === '') ? 'null' : String(v).trim();
const na = (v) => (v == null || v === '') ? 'null' : String(v).trim().toUpperCase();
const ng = (v) => (v == null || String(v).trim() === '') ? 'Diğer' : String(v).trim();
const keyOf = (r) => [
  n(r.brand_id), n(r.sub_category_id), n(r.ext_fld_id), n(r.drop_down_value),
  n(r.cud5_id), n(r.season_id), na(r.alt_sezon), ng(r.life_style_grup)
].join('_');

function cellText(rawValue) {
  if (rawValue == null) return '';
  if (typeof rawValue === 'object') {
    if (rawValue.text != null) return String(rawValue.text).trim();
    if (rawValue.result != null) return String(rawValue.result).trim();
    if (Array.isArray(rawValue.richText)) return rawValue.richText.map((t) => t.text).join('').trim();
  }
  return String(rawValue).trim();
}

const mapRef = (rows, idCol) => (rows || []).map((r) => ({ id: r[idCol], ad: r.ad }));

async function loadContext() {
  const [marka, kategori, koleksiyonTipi, sezon, altSezon, extDropdown] = await Promise.all([
    refService.listMarka(),
    refService.listKategori(),
    refService.listKoleksiyonTipi(),
    refService.listSezon(),
    refService.listAltSezon(),
    refService.listExtFieldDropDown()
  ]);
  const detay = (extDropdown || []).map((r) => ({ id: r.ext_fld_dropdown_id, extFldId: r.ext_fld_id, ad: r.ad }));
  const distinctDetayNames = [...new Set(detay.map((d) => d.ad))].sort();
  return {
    refs: {
      marka: mapRef(marka, 'marka_id'),
      kategori: mapRef(kategori, 'kategori_id'),
      koleksiyonTipi: mapRef(koleksiyonTipi, 'id'),
      sezon: mapRef(sezon, 'sezon_id'),
      altSezon: mapRef(altSezon, 'alt_sezon_code')
    },
    detay,
    lists: {
      rangeTags: RANGE_TAGS,
      ranges: RANGE_FIELDS.map((r) => r.name),
      detayNames: distinctDetayNames,
      altSezon: mapRef(altSezon, 'alt_sezon_code').map((x) => x.ad),
      lifeStyleGroups: RANGE_LIFESTYLE_GROUPS
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
  if (col.kind === 'range') return ctx.lists.ranges;
  if (col.kind === 'range-detay') return ctx.lists.detayNames;
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
      if (col.kind === 'lookup') {
        if (col.nameField) rowObj[col.key] = r[col.nameField] || '';
        else {
          const src = (ctx.refs[col.refKey] || []).find((x) => String(x.id) === String(r[col.idField]));
          rowObj[col.key] = src ? src.ad : '';
        }
      } else if (col.kind === 'range') rowObj[col.key] = r.range_ad || '';
      else if (col.kind === 'range-detay') rowObj[col.key] = r.range_detayi || '';
      else if (col.kind === 'integer') rowObj[col.key] = r[col.field] != null ? Number(r[col.field]) : '';
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
  const rangeByName = new Map(RANGE_FIELDS.map((r) => [norm(r.name), r]));
  // (ext_fld_id + norm(name)) -> [ext_fld_dropdown_id]
  const detayIdx = new Map();
  for (const d of ctx.detay) {
    const k = `${d.extFldId}~${norm(d.ad)}`;
    if (!detayIdx.has(k)) detayIdx.set(k, []);
    detayIdx.get(k).push(d);
  }

  const existingKeys = new Set((existingRows || []).map((r) => keyOf(r)));
  const seenInFile = new Map();
  const results = [];

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    const texts = {};
    COLUMN_DEFS.forEach((col, idx) => { texts[col.key] = cellText(values[idx + 1]); });
    if (COLUMN_DEFS.every((col) => !texts[col.key])) return;

    const errors = [];
    const resolved = {};
    const display = {};

    COLUMN_DEFS.forEach((col) => {
      const txt = texts[col.key];
      display[col.key] = txt;

      if (col.kind === 'lookup') {
        if (!txt) { if (col.required) errors.push(`${col.header} boş olamaz.`); resolved[col.idField] = null; if (col.nameField) resolved[col.nameField] = null; return; }
        const m = lookupIdx[col.key].get(norm(txt));
        if (!m || m.length === 0) errors.push(`${col.header} listede bulunamadı: "${txt}"`);
        else if (m.length > 1) errors.push(`${col.header} için birden fazla eşleşme bulundu: "${txt}"`);
        else { resolved[col.idField] = m[0][col.idKey]; if (col.nameField) resolved[col.nameField] = m[0].ad; }
      } else if (col.kind === 'range') {
        if (!txt) { resolved.range_ad = null; resolved.ext_fld_id = null; return; }
        const rf = rangeByName.get(norm(txt));
        if (!rf) errors.push(`Range listede bulunamadı: "${txt}"`);
        else { resolved.range_ad = rf.name; resolved.ext_fld_id = rf.extFldId; }
      } else if (col.kind === 'range-detay') {
        // ext_fld_id (Range) çözülmeden Range Detayı çözülemez.
        resolved.range_detayi = txt || null;
        if (!txt) { if (col.required) errors.push('Range Detayı boş olamaz.'); resolved.drop_down_value = null; return; }
        if (!resolved.ext_fld_id) { errors.push('Range Detayı için önce geçerli bir Range seçilmelidir.'); resolved.drop_down_value = null; return; }
        const m = detayIdx.get(`${resolved.ext_fld_id}~${norm(txt)}`);
        if (!m || m.length === 0) errors.push(`Range Detayı seçili Range altında bulunamadı: "${txt}"`);
        else if (m.length > 1) errors.push(`Range Detayı için birden fazla eşleşme bulundu: "${txt}"`);
        else { resolved.drop_down_value = m[0].id; resolved.range_detayi = m[0].ad; }
      } else if (col.kind === 'integer') {
        if (!txt) { resolved[col.field] = 0; return; }
        const num = Number(txt);
        if (Number.isNaN(num) || !Number.isInteger(num) || num < col.min || num > col.max) errors.push(`${col.header} ${col.min}-${col.max} arası tam sayı olmalıdır.`);
        else resolved[col.field] = num;
      } else { // text-list
        if (!txt) { resolved[col.field] = null; return; }
        const canonical = listIdx[col.key].get(norm(txt));
        if (canonical === undefined) errors.push(`${col.header} listede bulunamadı: "${txt}"`);
        else resolved[col.field] = canonical;
      }
    });

    const status0 = errors.length === 0;
    let action = null;
    if (status0) {
      const k = keyOf(resolved);
      if (seenInFile.has(k)) errors.push(`Bu kırılım şablonda ${seenInFile.get(k)}. satırla tekrar ediyor.`);
      else { seenInFile.set(k, rowNumber); action = existingKeys.has(k) ? 'update' : 'insert'; }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    results.push({
      rowNumber,
      display,
      status,
      errors,
      action: status === 'ok' ? action : null,
      resolved: status === 'ok' ? resolved : null
    });
  });

  return {
    totalRows: results.length,
    validCount: results.filter((r) => r.status === 'ok').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    rows: results
  };
}

async function buildTemplateWorkbookFromDb() {
  const [ctx, rows] = await Promise.all([loadContext(), rangePlanParameterService.listParameters()]);
  return buildTemplateWorkbook(ctx, rows);
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');
  const [ctx, existingRows] = await Promise.all([loadContext(), rangePlanParameterService.listParameters()]);
  return validateSheetRows(sheet, ctx, existingRows);
}

module.exports = { buildTemplateWorkbook, buildTemplateWorkbookFromDb, validateSheetRows, parseAndValidateWorkbookBuffer, SHEET_NAME, COLUMN_DEFS };
