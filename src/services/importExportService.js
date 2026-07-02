const ExcelJS = require('exceljs');
const refService = require('./refService');
const parameterService = require('./parameterService');

const SHEET_NAME = 'Parametreler';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500; // yeni satır eklemeye yetecek kadar boş satır
const MU_MIN = 0;
const MU_MAX = 20;
const SARF_MIN = 0;
const SARF_MAX = 20;

/**
 * Kırılımı oluşturan kolonlar. Yeni bir kırılım boyutu (örn. ileride başka bir Tema
 * özelliği) eklenmesi gerekirse tek yapılması gereken buraya bir `kind: 'lookup'`
 * satırı eklemek ve `refKey`'e karşılık gelen listeyi refs objesine dahil etmektir —
 * şablon üretimi, veri doğrulaması ve içe aktarma mantığının tamamı buradan besleniyor.
 */
const COLUMN_DEFS = [
  { key: 'marka', header: 'Marka', width: 22, kind: 'lookup', refKey: 'marka', idKey: 'marka_id', displayField: 'marka_ad', resolvedKey: 'markaId', namedRange: 'ListMarka' },
  { key: 'altKategori', header: 'Alt Kategori', width: 24, kind: 'lookup', refKey: 'altKategori', idKey: 'alt_kategori_id', displayField: 'alt_kategori_ad', resolvedKey: 'altKategoriId', namedRange: 'ListAltKategori' },
  { key: 'segment', header: 'Segment', width: 16, kind: 'lookup', refKey: 'segment', idKey: 'segment_id', displayField: 'segment_ad', resolvedKey: 'segmentId', namedRange: 'ListSegment' },
  { key: 'lifestyleGrup', header: 'LifeStyle Grubu', width: 22, kind: 'lookup', refKey: 'lifestyleGrup', idKey: 'lifestyle_grup_id', displayField: 'lifestyle_grup_ad', resolvedKey: 'lifestyleGrupId', namedRange: 'ListLifestyleGrup' },
  { key: 'sezon', header: 'Sezon', width: 18, kind: 'lookup', refKey: 'sezon', idKey: 'sezon_id', displayField: 'sezon_ad', resolvedKey: 'sezonId', namedRange: 'ListSezon' },
  { key: 'altSezon', header: 'Alt Sezon', width: 16, kind: 'lookup', refKey: 'altSezon', idKey: 'alt_sezon_code', displayField: 'alt_sezon_ad', resolvedKey: 'altSezonCode', namedRange: 'ListAltSezon' },
  { key: 'mu', header: 'MU', width: 10, kind: 'number', resolvedKey: 'mu', min: MU_MIN, max: MU_MAX },
  { key: 'sarf', header: 'Sarf', width: 10, kind: 'number', resolvedKey: 'sarf', min: SARF_MIN, max: SARF_MAX }
];

const LOOKUP_COLUMNS = COLUMN_DEFS.filter((c) => c.kind === 'lookup');

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

/**
 * Sadece veri alıp bir ExcelJS Workbook üreten saf fonksiyon (DB bağımsız, test edilebilir).
 * `refs`: { marka, altKategori, segment, lifestyleGrup, sezon, altSezon } — her biri
 * [{ <idKey>, ad }] biçiminde bir dizi.
 */
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
          type: 'decimal',
          operator: 'between',
          allowBlank: true,
          formulae: [col.min, col.max],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: `Geçersiz ${col.header}`,
          error: `${col.header} ${col.min} ile ${col.max} arasında sayısal bir değer olmalıdır.`
        };
      }
    });
  }

  return workbook;
}

function cellText(rawValue) {
  if (rawValue == null) return '';
  if (typeof rawValue === 'object') {
    if (rawValue.text != null) return String(rawValue.text).trim();
    if (rawValue.result != null) return String(rawValue.result).trim();
    if (Array.isArray(rawValue.richText)) return rawValue.richText.map((t) => t.text).join('').trim();
  }
  return String(rawValue).trim();
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

/**
 * Saf fonksiyon: ExcelJS worksheet'ini (zaten yüklenmiş) ve referans listelerini/mevcut
 * kayıtları alarak satır satır doğrulama yapar. DB'ye yazmaz.
 */
function validateSheetRows(sheet, refs, existingRows) {
  const lookupIndexes = {};
  LOOKUP_COLUMNS.forEach((col) => {
    lookupIndexes[col.key] = buildLookupIndex(refs[col.refKey], col.idKey);
  });

  const existingKeys = new Set(
    (existingRows || []).map((r) => LOOKUP_COLUMNS.map((col) => r[col.idKey]).join('~'))
  );

  const seenInFile = new Map();
  const results = [];

  // includeEmpty: Excel dosyasındaki boş (sadece veri doğrulaması uygulanmış, henüz
  // değer girilmemiş) satırlar da döngüye dahil edilir; bu satırlar aşağıdaki isEmpty
  // kontrolüyle zaten atlanıyor. Aksi halde ExcelJS varsayılan olarak "gerçek değer"
  // içermeyen satırları (ör. şablonun kullandırmadığı doğrulama satırlarını) atlayabiliyor.
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = row.values;
    const texts = {};
    COLUMN_DEFS.forEach((col, idx) => {
      texts[col.key] = cellText(values[idx + 1]);
    });

    const isEmpty = COLUMN_DEFS.every((col) => !texts[col.key]);
    if (isEmpty) return;

    const errors = [];
    const resolved = {};
    const display = {};

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

    const numberColumns = COLUMN_DEFS.filter((c) => c.kind === 'number');
    numberColumns.forEach((col) => {
      const txt = texts[col.key];
      display[col.key] = txt;
      const num = Number(txt);
      if (!txt || Number.isNaN(num)) {
        errors.push(`${col.header} sayısal olmalıdır.`);
        resolved[col.resolvedKey] = txt;
      } else if (num < col.min || num > col.max) {
        errors.push(`${col.header} ${col.min} ile ${col.max} arasında olmalıdır.`);
        resolved[col.resolvedKey] = num;
      } else {
        resolved[col.resolvedKey] = num;
      }
    });

    let fileKey = null;
    const hasAllLookupIds = LOOKUP_COLUMNS.every((col) => resolved[col.resolvedKey] != null);
    if (hasAllLookupIds) {
      fileKey = LOOKUP_COLUMNS.map((col) => resolved[col.resolvedKey]).join('~');
      if (seenInFile.has(fileKey)) {
        errors.push(`Bu kırılım şablonda ${seenInFile.get(fileKey)}. satırla tekrar ediyor.`);
      } else {
        seenInFile.set(fileKey, rowNumber);
      }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    const action = status === 'ok' ? (existingKeys.has(fileKey) ? 'update' : 'insert') : null;

    results.push({
      rowNumber,
      marka: display.marka,
      altKategori: display.altKategori,
      segment: display.segment,
      lifestyleGrup: display.lifestyleGrup,
      sezon: display.sezon,
      altSezon: display.altSezon,
      mu: display.mu,
      sarf: display.sarf,
      status,
      errors,
      action,
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

async function fetchAllRefs() {
  const [marka, altKategori, segment, lifestyleGrup, sezon, altSezon] = await Promise.all([
    refService.listMarka(),
    refService.listAltKategori(),
    refService.listSegment(),
    refService.listLifestyleGrup(),
    refService.listSezon(),
    refService.listAltSezon()
  ]);
  return { marka, altKategori, segment, lifestyleGrup, sezon, altSezon };
}

async function buildTemplateWorkbookFromDb() {
  const [refs, rows] = await Promise.all([fetchAllRefs(), parameterService.listParameters()]);
  return buildTemplateWorkbook({ refs, rows });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');
  }

  const [refs, existingRows] = await Promise.all([fetchAllRefs(), parameterService.listParameters()]);

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
