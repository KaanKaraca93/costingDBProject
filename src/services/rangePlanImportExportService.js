const ExcelJS = require('exceljs');
const refService = require('./refService');
const rangePlanParameterService = require('./rangePlanParameterService');
const engine = require('./planImportExportEngine');

const SHEET_NAME = 'RangePlan';

// V7.2 "Life Style Grup" kolonu bir grup adıdır (lifeStyleGroupFromCud4 çıktısı).
const LIFESTYLE_GROUPS = ['Mono', 'Business', 'Tema', 'Diğer'];

// keyOf: RangeSayac makeKey ile aynı normalizasyon (NULL güvenli).
const n = (v) => (v == null || v === '') ? 'null' : String(v).trim();
const na = (v) => (v == null || v === '') ? 'null' : String(v).trim().toUpperCase();
const ng = (v) => (v == null || String(v).trim() === '') ? 'Diğer' : String(v).trim();

const CONFIG = {
  sheetName: SHEET_NAME,
  columns: [
    { header: 'Marka', field: 'marka', type: 'text', width: 16 },
    { header: 'BrandId', field: 'brand_id', type: 'int', width: 10 },
    { header: 'Ürün Gurbu', field: 'urun_grubu', type: 'text', width: 16 },
    { header: 'SubCategoryId', field: 'sub_category_id', type: 'int', width: 14 },
    { header: 'RangeTag', field: 'range_tag', type: 'text', width: 12 },
    { header: 'Range', field: 'range_ad', type: 'text', width: 14 },
    { header: 'ExtFldId', field: 'ext_fld_id', type: 'text', width: 38 },
    { header: 'Range Detayı', field: 'range_detayi', type: 'text', width: 18 },
    { header: 'DropDownValue', field: 'drop_down_value', type: 'int', width: 14 },
    { header: 'CUD5Id', field: 'cud5_id', type: 'int', width: 10 },
    { header: 'Option Say', field: 'option_say', type: 'int', width: 12 },
    { header: 'SeasonId', field: 'season_id', type: 'int', width: 10 },
    { header: 'Alt_Sezon', field: 'alt_sezon', type: 'text', width: 12 },
    { header: 'Life Style Grup', field: 'life_style_grup', type: 'text', width: 16 }
  ],
  pairs: [
    { nameField: 'marka', idField: 'brand_id', sourceKey: 'marka', nameHeader: 'Marka', idHeader: 'BrandId' },
    { nameField: 'urun_grubu', idField: 'sub_category_id', sourceKey: 'kategori', nameHeader: 'Ürün Gurbu', idHeader: 'SubCategoryId' }
  ],
  requiredFields: ['brand_id', 'sub_category_id', 'ext_fld_id', 'drop_down_value', 'season_id'],
  keyOf: (r) => [
    n(r.brand_id), n(r.sub_category_id), n(r.ext_fld_id), n(r.drop_down_value),
    n(r.cud5_id), n(r.season_id), na(r.alt_sezon), ng(r.life_style_grup)
  ].join('_')
};

const mapRef = (rows, idCol) => (rows || []).map((r) => ({ id: r[idCol], ad: r.ad }));

async function loadSources() {
  const [marka, kategori, altSezon] = await Promise.all([
    refService.listMarka(),
    refService.listKategori(),
    refService.listAltSezon()
  ]);
  return {
    marka: mapRef(marka, 'marka_id'),
    kategori: mapRef(kategori, 'kategori_id'),
    altSezon: mapRef(altSezon, 'alt_sezon_code')
  };
}

function validationLists(sources) {
  return {
    marka: sources.marka.map((x) => x.ad),
    urun_grubu: sources.kategori.map((x) => x.ad),
    alt_sezon: sources.altSezon.map((x) => x.ad),
    life_style_grup: LIFESTYLE_GROUPS
  };
}

async function buildTemplateWorkbookFromDb() {
  const [sources, rows] = await Promise.all([loadSources(), rangePlanParameterService.listParameters()]);
  return engine.buildTemplateWorkbook(CONFIG, { rows, validationLists: validationLists(sources) });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');

  const [sources, existingRows] = await Promise.all([loadSources(), rangePlanParameterService.listParameters()]);
  return engine.validateSheetRows(CONFIG, sheet, { sources, existingRows });
}

module.exports = { buildTemplateWorkbookFromDb, parseAndValidateWorkbookBuffer, SHEET_NAME, CONFIG };
