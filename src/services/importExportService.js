const ExcelJS = require('exceljs');
const refService = require('./refService');
const parameterService = require('./parameterService');

const SHEET_NAME = 'Parametreler';
const LOOKUP_SHEET_NAME = 'Lookups';
const MIN_VALIDATION_ROWS = 500; // yeni satır eklemeye yetecek kadar bo\u015f sat\u0131r
const MU_MIN = 0;
const MU_MAX = 20;
const SARF_MIN = 0;
const SARF_MAX = 20;

const COLUMN_DEFS = [
  { key: 'marka', header: 'Marka', width: 24, lookupKey: 'marka', namedRange: 'ListMarka' },
  { key: 'altKategori', header: 'Alt Kategori', width: 26, lookupKey: 'altKategori', namedRange: 'ListAltKategori' },
  { key: 'segment', header: 'Segment', width: 16, lookupKey: 'segment', namedRange: 'ListSegment' },
  { key: 'lifestyleGrup', header: 'LifeStyle Grubu', width: 22, lookupKey: 'lifestyleGrup', namedRange: 'ListLifestyleGrup' },
  { key: 'mu', header: 'MU', width: 10 },
  { key: 'sarf', header: 'Sarf', width: 10 }
];

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

/**
 * Sadece veri al\u0131p bir ExcelJS Workbook \u00fcreten saf fonksiyon (DB ba\u011f\u0131ms\u0131z, test edilebilir).
 */
function buildTemplateWorkbook({ marka, altKategori, segment, lifestyleGrup, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ipekyol Costing DB';
  workbook.created = new Date();

  const lookupLists = {
    marka: marka.map((m) => m.ad),
    altKategori: altKategori.map((m) => m.ad),
    segment: segment.map((m) => m.ad),
    lifestyleGrup: lifestyleGrup.map((m) => m.ad)
  };

  const lookupSheet = workbook.addWorksheet(LOOKUP_SHEET_NAME);
  lookupSheet.state = 'veryHidden';

  const lookupColKeys = ['marka', 'altKategori', 'segment', 'lifestyleGrup'];
  lookupColKeys.forEach((key, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx);
    lookupSheet.getCell(`${colLetter}1`).value = key;
    lookupLists[key].forEach((name, i) => {
      lookupSheet.getCell(`${colLetter}${i + 2}`).value = name;
    });
    const lastRow = Math.max(lookupLists[key].length + 1, 2);
    const def = COLUMN_DEFS.find((c) => c.lookupKey === key);
    workbook.definedNames.add(`${LOOKUP_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${lastRow}`, def.namedRange);
  });

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = COLUMN_DEFS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    sheet.addRow({
      marka: r.marka_ad || '',
      altKategori: r.alt_kategori_ad || '',
      segment: r.segment_ad || '',
      lifestyleGrup: r.lifestyle_grup_ad || '',
      mu: r.mu != null ? Number(r.mu) : '',
      sarf: r.sarf != null ? Number(r.sarf) : ''
    });
  });

  const lastValidationRow = Math.max(rows.length + 1, 1) + MIN_VALIDATION_ROWS;

  for (let rowNum = 2; rowNum <= lastValidationRow; rowNum++) {
    COLUMN_DEFS.forEach((col, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      const cell = sheet.getCell(`${colLetter}${rowNum}`);
      if (col.namedRange) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [col.namedRange],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: `Ge\u00e7ersiz ${col.header}`,
          error: `L\u00fctfen listeden bir ${col.header} de\u011feri se\u00e7in.`
        };
      } else if (col.key === 'mu') {
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          allowBlank: true,
          formulae: [MU_MIN, MU_MAX],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Ge\u00e7ersiz MU',
          error: `MU ${MU_MIN} ile ${MU_MAX} aras\u0131nda say\u0131sal bir de\u011fer olmal\u0131d\u0131r.`
        };
      } else if (col.key === 'sarf') {
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          allowBlank: true,
          formulae: [SARF_MIN, SARF_MAX],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Ge\u00e7ersiz Sarf',
          error: `Sarf ${SARF_MIN} ile ${SARF_MAX} aras\u0131nda say\u0131sal bir de\u011fer olmal\u0131d\u0131r.`
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
  for (const item of list) {
    const key = norm(item.ad);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item[idKey]);
  }
  return map;
}

/**
 * Saf fonksiyon: ExcelJS worksheet'ini (zaten y\u00fcklenmi\u015f) ve referans listelerini/mevcut
 * kay\u0131tlar\u0131 alarak sat\u0131r sat\u0131r do\u011frulama yapar. DB'ye yazmaz.
 */
function validateSheetRows(sheet, { marka, altKategori, segment, lifestyleGrup }, existingRows) {
  const markaIdx = buildLookupIndex(marka, 'marka_id');
  const altIdx = buildLookupIndex(altKategori, 'alt_kategori_id');
  const segIdx = buildLookupIndex(segment, 'segment_id');
  const lifeIdx = buildLookupIndex(lifestyleGrup, 'lifestyle_grup_id');

  const existingKeys = new Set(
    (existingRows || []).map(
      (r) => `${r.marka_id}-${r.alt_kategori_id}-${r.segment_id}-${r.lifestyle_grup_id}`
    )
  );

  const seenInFile = new Map();
  const results = [];

  // includeEmpty: Excel dosyas\u0131ndaki bo\u015f (sadece veri do\u011frulamas\u0131 uygulanm\u0131\u015f, hen\u00fcz
  // de\u011fer girilmemi\u015f) sat\u0131rlar da d\u00f6ng\u00fcye dahil edilir; bu sat\u0131rlar a\u015fa\u011f\u0131daki isEmpty
  // kontrol\u00fcyle zaten atlan\u0131yor. Aksi halde ExcelJS varsay\u0131lan olarak "ger\u00e7ek de\u011fer"
  // i\u00e7ermeyen sat\u0131rlar\u0131 (\u00f6r. \u015fablonun kulland\u0131rmad\u0131\u011f\u0131 do\u011frulama sat\u0131rlar\u0131n\u0131) atlayabiliyor.
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = row.values;
    const markaTxt = cellText(values[1]);
    const altTxt = cellText(values[2]);
    const segTxt = cellText(values[3]);
    const lifeTxt = cellText(values[4]);
    const muRaw = values[5];
    const sarfRaw = values[6];
    const muTxt = cellText(muRaw);
    const sarfTxt = cellText(sarfRaw);

    const isEmpty = !markaTxt && !altTxt && !segTxt && !lifeTxt && !muTxt && !sarfTxt;
    if (isEmpty) return;

    const errors = [];

    const lookupOne = (idx, label, txt) => {
      if (!txt) {
        errors.push(`${label} bo\u015f olamaz.`);
        return null;
      }
      const matches = idx.get(norm(txt));
      if (!matches || matches.length === 0) {
        errors.push(`${label} listede bulunamad\u0131: "${txt}"`);
        return null;
      }
      if (matches.length > 1) {
        errors.push(`${label} i\u00e7in birden fazla e\u015fle\u015fme bulundu: "${txt}"`);
        return null;
      }
      return matches[0];
    };

    const markaId = lookupOne(markaIdx, 'Marka', markaTxt);
    const altKategoriId = lookupOne(altIdx, 'Alt Kategori', altTxt);
    const segmentId = lookupOne(segIdx, 'Segment', segTxt);
    const lifestyleGrupId = lookupOne(lifeIdx, 'LifeStyle Grubu', lifeTxt);

    const mu = Number(muTxt);
    const sarf = Number(sarfTxt);
    if (!muTxt || Number.isNaN(mu)) {
      errors.push('MU say\u0131sal olmal\u0131d\u0131r.');
    } else if (mu <= MU_MIN || mu > MU_MAX) {
      errors.push(`MU ${MU_MIN} ile ${MU_MAX} aras\u0131nda olmal\u0131d\u0131r.`);
    }
    if (!sarfTxt || Number.isNaN(sarf)) {
      errors.push('Sarf say\u0131sal olmal\u0131d\u0131r.');
    } else if (sarf < SARF_MIN || sarf > SARF_MAX) {
      errors.push(`Sarf ${SARF_MIN} ile ${SARF_MAX} aras\u0131nda olmal\u0131d\u0131r.`);
    }

    let key = null;
    const hasAllIds = [markaId, altKategoriId, segmentId, lifestyleGrupId].every((v) => v != null);
    if (hasAllIds) {
      key = `${markaId}-${altKategoriId}-${segmentId}-${lifestyleGrupId}`;
      if (seenInFile.has(key)) {
        errors.push(`Bu k\u0131r\u0131l\u0131m \u015fablonda ${seenInFile.get(key)}. sat\u0131rla tekrar ediyor.`);
      } else {
        seenInFile.set(key, rowNumber);
      }
    }

    const status = errors.length === 0 ? 'ok' : 'error';
    const action = status === 'ok' ? (existingKeys.has(key) ? 'update' : 'insert') : null;

    results.push({
      rowNumber,
      marka: markaTxt,
      altKategori: altTxt,
      segment: segTxt,
      lifestyleGrup: lifeTxt,
      mu: Number.isNaN(mu) ? muTxt : mu,
      sarf: Number.isNaN(sarf) ? sarfTxt : sarf,
      status,
      errors,
      action,
      resolved: status === 'ok' ? { markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf } : null
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
  const [marka, altKategori, segment, lifestyleGrup, rows] = await Promise.all([
    refService.listMarka(),
    refService.listAltKategori(),
    refService.listSegment(),
    refService.listLifestyleGrup(),
    parameterService.listParameters()
  ]);
  return buildTemplateWorkbook({ marka, altKategori, segment, lifestyleGrup, rows });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Excel dosyas\u0131nda beklenen sayfa bulunamad\u0131.');
  }

  const [marka, altKategori, segment, lifestyleGrup, existingRows] = await Promise.all([
    refService.listMarka(),
    refService.listAltKategori(),
    refService.listSegment(),
    refService.listLifestyleGrup(),
    parameterService.listParameters()
  ]);

  return validateSheetRows(sheet, { marka, altKategori, segment, lifestyleGrup }, existingRows);
}

module.exports = {
  buildTemplateWorkbook,
  buildTemplateWorkbookFromDb,
  validateSheetRows,
  parseAndValidateWorkbookBuffer,
  SHEET_NAME
};
