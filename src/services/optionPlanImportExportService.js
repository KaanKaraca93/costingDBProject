const ExcelJS = require('exceljs');
const refService = require('./refService');
const optionPlanParameterService = require('./optionPlanParameterService');
const engine = require('./planImportExportEngine');

const SHEET_NAME = 'OptionPlan';

// Fashion Pyramid (ColorwayUserField1) ve FT (ColorwayUserDefinedField5) PLM'de
// GenericLookUpAll değil; RangeSayac servisindeki sabit eşleşmelerden alınır.
const FASHION_PYRAMID = [
  { id: 1, ad: 'İMAGE' }, { id: 2, ad: 'FARKLI' }, { id: 4, ad: 'NORMAL' }, { id: 5, ad: 'ÇOK FARKLI' },
  { id: 6, ad: 'Essentials' }, { id: 7, ad: 'Basics' }, { id: 8, ad: 'Fashion Core' },
  { id: 9, ad: 'Fashion Newness' }, { id: 10, ad: 'Fashion Wow' }, { id: 11, ad: 'Styling Core' },
  { id: 12, ad: 'Twist Signature' }, { id: 13, ad: 'Twist Fashion' }, { id: 14, ad: 'Iconic / Hero' }
];
const FT = [{ id: 1, ad: 'Standart' }, { id: 2, ad: 'Fast Track' }];

const CONFIG = {
  sheetName: SHEET_NAME,
  columns: [
    { header: 'MARKA', field: 'marka', type: 'text', width: 20 },
    { header: 'BrandId', field: 'brand_id', type: 'int', width: 10 },
    { header: 'Opsiyon Kodu', field: 'opsiyon_kodu', type: 'text', width: 16 },
    { header: 'ÜRÜN GRUBU', field: 'urun_grubu', type: 'text', width: 18 },
    { header: 'SubCategoryId', field: 'sub_category_id', type: 'int', width: 14 },
    { header: 'Ürün Alt Grup', field: 'urun_alt_grup', type: 'text', width: 18 },
    { header: 'SubSubCategoryId', field: 'sub_sub_category_id', type: 'int', width: 16 },
    { header: 'Fashion Pyramid', field: 'fashion_pyramid', type: 'text', width: 18 },
    { header: 'CUD1', field: 'cud1', type: 'int', width: 8 },
    { header: 'Life Style Grup', field: 'life_style_grup', type: 'text', width: 16 },
    { header: 'CUD4', field: 'cud4', type: 'int', width: 8 },
    { header: 'FT', field: 'ft', type: 'text', width: 12 },
    { header: 'CUD5', field: 'cud5', type: 'int', width: 8 },
    { header: 'Segment', field: 'segment', type: 'text', width: 14 },
    { header: 'UDF5Id', field: 'udf5_id', type: 'int', width: 10 },
    { header: 'SeasonId', field: 'season_id', type: 'int', width: 10 },
    { header: 'Alt_Sezon', field: 'alt_sezon', type: 'text', width: 12 }
  ],
  pairs: [
    { nameField: 'marka', idField: 'brand_id', sourceKey: 'marka', nameHeader: 'MARKA', idHeader: 'BrandId' },
    { nameField: 'urun_grubu', idField: 'sub_category_id', sourceKey: 'kategori', nameHeader: 'ÜRÜN GRUBU', idHeader: 'SubCategoryId' },
    { nameField: 'urun_alt_grup', idField: 'sub_sub_category_id', sourceKey: 'altKategori', nameHeader: 'Ürün Alt Grup', idHeader: 'SubSubCategoryId' },
    { nameField: 'fashion_pyramid', idField: 'cud1', sourceKey: 'fashionPyramid', nameHeader: 'Fashion Pyramid', idHeader: 'CUD1' },
    { nameField: 'ft', idField: 'cud5', sourceKey: 'ft', nameHeader: 'FT', idHeader: 'CUD5' },
    { nameField: 'segment', idField: 'udf5_id', sourceKey: 'segment', nameHeader: 'Segment', idHeader: 'UDF5Id' }
  ],
  requiredFields: ['opsiyon_kodu', 'brand_id', 'sub_category_id', 'sub_sub_category_id', 'season_id'],
  keyOf: (r) => engine.norm(r.opsiyon_kodu)
};

const mapRef = (rows, idCol) => (rows || []).map((r) => ({ id: r[idCol], ad: r.ad }));

async function loadSources() {
  const [marka, kategori, altKategori, segment, altSezon] = await Promise.all([
    refService.listMarka(),
    refService.listKategori(),
    refService.listAltKategori(),
    refService.listSegment(),
    refService.listAltSezon()
  ]);
  return {
    marka: mapRef(marka, 'marka_id'),
    kategori: mapRef(kategori, 'kategori_id'),
    altKategori: mapRef(altKategori, 'alt_kategori_id'),
    segment: mapRef(segment, 'segment_id'),
    fashionPyramid: FASHION_PYRAMID,
    ft: FT,
    altSezon: mapRef(altSezon, 'alt_sezon_code')
  };
}

function validationLists(sources) {
  return {
    marka: sources.marka.map((x) => x.ad),
    urun_grubu: sources.kategori.map((x) => x.ad),
    urun_alt_grup: sources.altKategori.map((x) => x.ad),
    fashion_pyramid: sources.fashionPyramid.map((x) => x.ad),
    ft: sources.ft.map((x) => x.ad),
    segment: sources.segment.map((x) => x.ad),
    alt_sezon: sources.altSezon.map((x) => x.ad)
  };
}

async function buildTemplateWorkbookFromDb() {
  const [sources, rows] = await Promise.all([loadSources(), optionPlanParameterService.listParameters()]);
  return engine.buildTemplateWorkbook(CONFIG, { rows, validationLists: validationLists(sources) });
}

async function parseAndValidateWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında beklenen sayfa bulunamadı.');

  const [sources, existingRows] = await Promise.all([loadSources(), optionPlanParameterService.listParameters()]);
  return engine.validateSheetRows(CONFIG, sheet, { sources, existingRows });
}

module.exports = { buildTemplateWorkbookFromDb, parseAndValidateWorkbookBuffer, SHEET_NAME, CONFIG };
