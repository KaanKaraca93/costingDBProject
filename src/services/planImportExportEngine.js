const ExcelJS = require('exceljs');

// Range/Option plan tabloları için ortak Excel motoru. Kaynak Excel'ler (v6.2 /
// v7.2) hem ID hem isim kolonları içerir; bu yüzden şablon kaynak kolonlara
// bire bir sadık kalır. Lookup çiftlerinde (isim ↔ id) içe aktarma sırasında
// biri boşsa diğerinden tamamlanır. Eşleştirme ID kolonlarıyla yapıldığı için
// asıl doğruluk ID'dedir; ref listede olmayan ID'ler engellenmez (esnek).

const MIN_VALIDATION_ROWS = 500;
const LOOKUP_SHEET_NAME = 'Lookups';

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

function cellText(rawValue) {
  if (rawValue == null) return '';
  if (typeof rawValue === 'object') {
    if (rawValue.text != null) return String(rawValue.text).trim();
    if (rawValue.result != null) return String(rawValue.result).trim();
    if (Array.isArray(rawValue.richText)) return rawValue.richText.map((t) => t.text).join('').trim();
    if (rawValue.hyperlink != null) return String(rawValue.text || '').trim();
  }
  return String(rawValue).trim();
}

function toIntOrNull(txt) {
  if (txt === '' || txt == null) return null;
  const n = Number(txt);
  return Number.isInteger(n) ? n : NaN;
}

// source.list: [{ id, ad }] → byNameLower (ad→[id]) + byId (id→ad)
function indexSource(list) {
  const byName = new Map();
  const byId = new Map();
  for (const item of list || []) {
    const k = norm(item.ad);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(item.id);
    byId.set(String(item.id), item.ad);
  }
  return { byName, byId };
}

function buildTemplateWorkbook(config, { rows, validationLists }) {
  const { sheetName, columns } = config;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ipekyol Costing DB';
  workbook.created = new Date();

  // Gizli lookup sayfası + adlandırılmış aralıklar (dropdown doğrulama)
  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME);
  lookupSheet.state = 'veryHidden';
  const namedRangeByField = {};
  let lookupColIdx = 0;
  for (const col of columns) {
    const list = validationLists[col.field];
    if (!list || !list.length) continue;
    const colLetter = String.fromCharCode(65 + lookupColIdx);
    lookupSheet.getCell(`${colLetter}1`).value = col.field;
    list.forEach((name, i) => { lookupSheet.getCell(`${colLetter}${i + 2}`).value = name; });
    const lastRow = Math.max(list.length + 1, 2);
    const rangeName = `List_${col.field}`;
    workbook.definedNames.add(`${LOOKUP_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${lastRow}`, rangeName);
    namedRangeByField[col.field] = rangeName;
    lookupColIdx++;
  }

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.field, width: c.width || 18 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    const rowObj = {};
    columns.forEach((col) => {
      const v = r[col.field];
      rowObj[col.field] = (v == null || v === '') ? '' : (col.type === 'int' ? Number(v) : v);
    });
    sheet.addRow(rowObj);
  });

  const lastValidationRow = Math.max(rows.length + 1, 1) + MIN_VALIDATION_ROWS;
  for (let rowNum = 2; rowNum <= lastValidationRow; rowNum++) {
    columns.forEach((col, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      const cell = sheet.getCell(`${colLetter}${rowNum}`);
      const rangeName = namedRangeByField[col.field];
      if (rangeName) {
        cell.dataValidation = {
          type: 'list', allowBlank: true, formulae: [rangeName],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: `Geçersiz ${col.header}`,
          error: `Lütfen listeden bir ${col.header} değeri seçin.`
        };
      } else if (col.type === 'int') {
        cell.dataValidation = {
          type: 'whole', operator: 'between', allowBlank: true,
          formulae: [-2147483648, 2147483647], showErrorMessage: true, errorStyle: 'stop',
          errorTitle: `Geçersiz ${col.header}`, error: `${col.header} tam sayı olmalıdır.`
        };
      }
    });
  }

  return workbook;
}

// sheet -> { totalRows, validCount, errorCount, rows: [{ rowNumber, display, status, errors, action, resolved }] }
function validateSheetRows(config, sheet, { sources, existingRows }) {
  const { columns, pairs, requiredFields, keyOf } = config;
  const pairIndex = {};
  for (const p of pairs || []) {
    pairIndex[p.nameField] = { ...p, idx: indexSource(sources[p.sourceKey]) };
    pairIndex[p.idField] = { ...p, idx: indexSource(sources[p.sourceKey]) };
  }

  const existingKeys = new Set((existingRows || []).map((r) => keyOf(r)));
  const seenInFile = new Map();
  const results = [];

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    const texts = {};
    columns.forEach((col, idx) => { texts[col.field] = cellText(values[idx + 1]); });

    const isEmpty = columns.every((col) => !texts[col.field]);
    if (isEmpty) return;

    const errors = [];
    const resolved = {};
    const display = {};
    columns.forEach((col) => { display[col.field] = texts[col.field]; });

    // 1) Lookup çiftleri: isim ↔ id tamamla/doğrula
    const handledPairFields = new Set();
    for (const p of pairs || []) {
      const idTxt = texts[p.idField];
      const nameTxt = texts[p.nameField];
      const { byName, byId } = pairIndex[p.idField].idx;
      handledPairFields.add(p.idField);
      handledPairFields.add(p.nameField);

      const idParsed = toIntOrNull(idTxt);
      if (idTxt !== '' && Number.isNaN(idParsed)) {
        errors.push(`${p.idHeader} tam sayı olmalıdır: "${idTxt}"`);
        resolved[p.idField] = null;
        resolved[p.nameField] = nameTxt || null;
        continue;
      }
      if (idParsed != null) {
        // ID öncelikli; ismi kaynaktan doldur, yoksa dosyadaki ismi koru
        resolved[p.idField] = idParsed;
        resolved[p.nameField] = byId.get(String(idParsed)) || nameTxt || null;
      } else if (nameTxt) {
        const matches = byName.get(norm(nameTxt));
        if (!matches || matches.length === 0) {
          errors.push(`${p.nameHeader} listede yok: "${nameTxt}"`);
          resolved[p.idField] = null; resolved[p.nameField] = nameTxt;
        } else if (matches.length > 1) {
          errors.push(`${p.nameHeader} birden fazla eşleşti: "${nameTxt}"`);
          resolved[p.idField] = null; resolved[p.nameField] = nameTxt;
        } else {
          resolved[p.idField] = matches[0];
          resolved[p.nameField] = byId.get(String(matches[0])) || nameTxt;
        }
      } else {
        resolved[p.idField] = null; resolved[p.nameField] = null;
      }
    }

    // 2) Kalan kolonlar (standalone text / int)
    for (const col of columns) {
      if (handledPairFields.has(col.field)) continue;
      const txt = texts[col.field];
      if (col.type === 'int') {
        const n = toIntOrNull(txt);
        if (txt !== '' && Number.isNaN(n)) {
          errors.push(`${col.header} tam sayı olmalıdır: "${txt}"`);
          resolved[col.field] = null;
        } else {
          resolved[col.field] = n;
        }
      } else {
        resolved[col.field] = txt === '' ? null : txt;
      }
    }

    // 3) Zorunlu alanlar
    for (const rf of requiredFields || []) {
      if (resolved[rf] == null || resolved[rf] === '') {
        const col = columns.find((c) => c.field === rf);
        errors.push(`${col ? col.header : rf} boş olamaz.`);
      }
    }

    // 4) Dosya içi tekrar kontrolü
    let fileKey = null;
    if (errors.length === 0) {
      fileKey = keyOf(resolved);
      if (seenInFile.has(fileKey)) {
        errors.push(`Bu kayıt şablonda ${seenInFile.get(fileKey)}. satırla tekrar ediyor.`);
      } else {
        seenInFile.set(fileKey, rowNumber);
      }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    const action = status === 'ok' ? (existingKeys.has(fileKey) ? 'update' : 'insert') : null;
    results.push({ rowNumber, display, status, errors, action, resolved: status === 'ok' ? resolved : null });
  });

  return {
    totalRows: results.length,
    validCount: results.filter((r) => r.status === 'ok').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    rows: results
  };
}

module.exports = { buildTemplateWorkbook, validateSheetRows, cellText, norm, LOOKUP_SHEET_NAME };
