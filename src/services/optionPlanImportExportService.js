const ExcelJS = require('exceljs');
const refService = require('./refService');
const optionPlanParameterService = require('./optionPlanParameterService');

// Option Plan (v6.2) Excel şablonu. Prensip Ön Adet ile aynıdır: ön yüzde /
// şablonda yalnızca İSİM kolonları (dropdown/veri doğrulamalı) bulunur, ID'ler
// PLM lookup listelerinden çözümlenir. Opsiyon Kodu şablonda YOKTUR; her satır
// yeni bir placeholder'dır ve içe aktarmada sıralı PH#### otomatik üretilir.
const SHEET_NAME = 'OptionPlan';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500;

// kind: 'lookup' => name -> id (idField) + ad (nameField); 'text-list' => name
// listede olmalı, metni (nameField) saklanır (alt_sezon).
// Not: loadRefs tüm ref listelerini {id, ad} olarak normalize eder; bu yüzden
// tüm lookup kolonlarında idKey = 'id'.
const COLUMN_DEFS = [
  { key: 'marka', header: 'Marka', width: 22, kind: 'lookup', refKey: 'marka', idKey: 'id', idField: 'brand_id', nameField: 'marka', namedRange: 'ListMarka', required: true },
  { key: 'urunGrubu', header: 'Ürün Grubu', width: 20, kind: 'lookup', refKey: 'kategori', idKey: 'id', idField: 'sub_category_id', nameField: 'urun_grubu', namedRange: 'ListKategori', required: true },
  { key: 'urunAltGrup', header: 'Ürün Alt Grup', width: 22, kind: 'lookup', refKey: 'altKategori', idKey: 'id', idField: 'sub_sub_category_id', nameField: 'urun_alt_grup', namedRange: 'ListAltKategori', required: true },
  { key: 'fashionPyramid', header: 'Fashion Pyramid', width: 18, kind: 'lookup', refKey: 'fashionPyramid', idKey: 'id', idField: 'cud1', nameField: 'fashion_pyramid', namedRange: 'ListFashionPyramid' },
  { key: 'lifeStyleGrup', header: 'Life Style Grup', width: 18, kind: 'lookup', refKey: 'lifestyleGrup', idKey: 'id', idField: 'cud4', nameField: 'life_style_grup', namedRange: 'ListLifestyleGrup' },
  { key: 'koleksiyonTipi', header: 'Koleksiyon Tipi', width: 18, kind: 'lookup', refKey: 'koleksiyonTipi', idKey: 'id', idField: 'cud5', nameField: 'ft', namedRange: 'ListKoleksiyonTipi' },
  { key: 'segment', header: 'Segment', width: 16, kind: 'lookup', refKey: 'segment', idKey: 'id', idField: 'udf5_id', nameField: 'segment', namedRange: 'ListSegment' },
  { key: 'sezon', header: 'Sezon', width: 18, kind: 'lookup', refKey: 'sezon', idKey: 'id', idField: 'season_id', nameField: null, namedRange: 'ListSezon', required: true },
  { key: 'altSezon', header: 'Alt Sezon', width: 16, kind: 'text-list', refKey: 'altSezon', idKey: 'id', idField: null, nameField: 'alt_sezon', namedRange: 'ListAltSezon' }
];

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

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

async function loadRefs() {
  const [marka, kategori, altKategori, fashionPyramid, lifestyleGrup, koleksiyonTipi, segment, sezon, altSezon] = await Promise.all([
    refService.listMarka(),
    refService.listKategori(),
    refService.listAltKategori(),
    refService.listFashionPyramid(),
    refService.listLifestyleGrup(),
    refService.listKoleksiyonTipi(),
    refService.listSegment(),
    refService.listSezon(),
    refService.listAltSezon()
  ]);
  return {
    marka: mapRef(marka, 'marka_id'),
    kategori: mapRef(kategori, 'kategori_id'),
    altKategori: mapRef(altKategori, 'alt_kategori_id'),
    fashionPyramid: mapRef(fashionPyramid, 'id'),
    lifestyleGrup: mapRef(lifestyleGrup, 'lifestyle_grup_id'),
    koleksiyonTipi: mapRef(koleksiyonTipi, 'id'),
    segment: mapRef(segment, 'segment_id'),
    sezon: mapRef(sezon, 'sezon_id'),
    altSezon: mapRef(altSezon, 'alt_sezon_code')
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

function buildTemplateWorkbook({ refs, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ipekyol Costing DB';
  workbook.created = new Date();

  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME);
  lookupSheet.state = 'veryHidden';

  COLUMN_DEFS.forEach((col, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    const items = (refs[col.refKey] || []).map((item) => item.ad);
    lookupSheet.getCell(`${colLetter}1`).value = col.refKey;
    items.forEach((name, i) => { lookupSheet.getCell(`${colLetter}${i + 2}`).value = name; });
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
      if (col.nameField) rowObj[col.key] = r[col.nameField] || '';
      else if (col.key === 'sezon') {
        const s = (refs.sezon || []).find((x) => String(x.id) === String(r.season_id));
        rowObj[col.key] = s ? s.ad : '';
      } else rowObj[col.key] = '';
    });
    sheet.addRow(rowObj);
  });

  const lastValidationRow = Math.max(rows.length + 1, 1) + MIN_VALIDATION_ROWS;
  for (let rowNum = 2; rowNum <= lastValidationRow; rowNum++) {
    COLUMN_DEFS.forEach((col, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      sheet.getCell(`${colLetter}${rowNum}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [col.namedRange],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: `Geçersiz ${col.header}`,
        error: `Lütfen listeden bir ${col.header} değeri seçin.`
      };
    });
  }
  return workbook;
}

function validateSheetRows(sheet, refs) {
  const indexes = {};
  COLUMN_DEFS.forEach((col) => { indexes[col.key] = buildIndex(refs[col.refKey]); });

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
      if (!txt) {
        if (col.required) errors.push(`${col.header} boş olamaz.`);
        if (col.idField) resolved[col.idField] = null;
        if (col.nameField) resolved[col.nameField] = null;
        return;
      }
      const matches = indexes[col.key].get(norm(txt));
      if (!matches || matches.length === 0) {
        errors.push(`${col.header} listede bulunamadı: "${txt}"`);
      } else if (matches.length > 1) {
        errors.push(`${col.header} için birden fazla eşleşme bulundu: "${txt}"`);
      } else {
        const item = matches[0];
        if (col.idField) resolved[col.idField] = item[col.idKey];
        if (col.nameField) resolved[col.nameField] = item.ad;
      }
    });

    const status = errors.length === 0 ? 'ok' : 'error';
    results.push({
      rowNumber,
      display,
      status,
      errors,
      action: status === 'ok' ? 'insert' : null,
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
  const [refs, rows] = await Promise.all([loadRefs(), optionPlanParameterService.listParameters()]);
  return buildTemplateWorkbook({ refs, rows });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');
  const refs = await loadRefs();
  return validateSheetRows(sheet, refs);
}

module.exports = { buildTemplateWorkbook, buildTemplateWorkbookFromDb, validateSheetRows, parseAndValidateWorkbookBuffer, SHEET_NAME, COLUMN_DEFS };
