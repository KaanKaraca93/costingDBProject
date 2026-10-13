const pool = require('../config/db');
const { gerceklesenTedarikKaynagiId } = require('../config/tedarikKaynagi');

// delivery_plan_parametreleri: Marka + Ana Kategori (Division) + Sezon + Alt Sezon +
// Tedarik Kaynağı (Deliveries) + Ürün Grubu (SubCategory) + Life Style Grup (CUD4)
// kırılımında planlanan opsiyon sayısı. Ön Adet ile
// aynı prensip: DB'de PLM ID'leri tutulur, isimler ref_* tablolarından JOIN ile gelir.
// gerceklesen_tedarik_kaynagi_id kullanıcıdan alınmaz; delivery_id'den türetilir.

const BASE_SELECT = `
  SELECT
    p.id,
    p.marka_id,
    rm.ad             AS marka_ad,
    p.division_id,
    rb.ad             AS division_ad,
    p.sezon_id,
    rsz.ad            AS sezon_ad,
    p.alt_sezon_code,
    rasz.ad           AS alt_sezon_ad,
    p.delivery_id,
    rd.ad             AS delivery_ad,
    p.gerceklesen_tedarik_kaynagi_id,
    p.sub_category_id,
    rk.ad             AS sub_category_ad,
    p.lifestyle_grup_id,
    rlg.ad            AS lifestyle_grup_ad,
    p.option_say,
    p.created_at,
    p.updated_at,
    p.updated_by
  FROM delivery_plan_parametreleri p
  LEFT JOIN ref_marka rm            ON rm.marka_id = p.marka_id
  LEFT JOIN ref_bolum rb            ON rb.bolum_id = p.division_id
  LEFT JOIN ref_sezon rsz           ON rsz.sezon_id = p.sezon_id
  LEFT JOIN ref_alt_sezon rasz      ON rasz.alt_sezon_code = p.alt_sezon_code
  LEFT JOIN ref_delivery rd         ON rd.delivery_id = p.delivery_id
  LEFT JOIN ref_kategori rk         ON rk.kategori_id = p.sub_category_id
  LEFT JOIN ref_lifestyle_grup rlg  ON rlg.lifestyle_grup_id = p.lifestyle_grup_id
`;

const ORDER_BY = 'ORDER BY p.marka_id, p.sezon_id, p.alt_sezon_code, p.division_id, p.delivery_id, rk.ad, rlg.ad';

// Filtreler hem kendi adlarıyla (markaId/sezonId/altSezonCode) hem de plan
// çıktısındaki PLM adlarıyla (brandId/seasonId/altSezon) verilebilir; plan
// tüketicisi (gerçekleşen widget'ı) PLM adlarını kullanır.
async function listParameters(filters = {}) {
  const conditions = [];
  const values = [];
  const addFilter = (column, value) => {
    if (value === undefined || value === null || value === '') return;
    values.push(value);
    conditions.push(`p.${column} = $${values.length}`);
  };
  addFilter('marka_id', filters.markaId != null ? filters.markaId : filters.brandId);
  addFilter('division_id', filters.divisionId);
  addFilter('sezon_id', filters.sezonId != null ? filters.sezonId : filters.seasonId);
  addFilter('alt_sezon_code', filters.altSezonCode != null ? filters.altSezonCode : filters.altSezon);
  addFilter('delivery_id', filters.deliveryId);
  addFilter('gerceklesen_tedarik_kaynagi_id', filters.gerceklesenTedarikKaynagiId);
  addFilter('sub_category_id', filters.subCategoryId);
  addFilter('lifestyle_grup_id', filters.lifestyleGrupId);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${BASE_SELECT} ${where} ${ORDER_BY}`, values);
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function findByKey({ markaId, divisionId, sezonId, altSezonCode, deliveryId, subCategoryId, lifestyleGrupId }) {
  const { rows } = await pool.query(
    `${BASE_SELECT} WHERE p.marka_id = $1 AND p.division_id = $2 AND p.sezon_id = $3
       AND p.alt_sezon_code = $4 AND p.delivery_id = $5
       AND p.sub_category_id = $6 AND p.lifestyle_grup_id = $7`,
    [markaId, divisionId, sezonId, altSezonCode, deliveryId, subCategoryId, lifestyleGrupId]
  );
  return rows[0] || null;
}

function extractFields(data) {
  const { markaId, divisionId, sezonId, altSezonCode, deliveryId, subCategoryId, lifestyleGrupId, optionSay } = data;
  return [markaId, divisionId, sezonId, altSezonCode, deliveryId, subCategoryId, lifestyleGrupId, optionSay,
    gerceklesenTedarikKaynagiId(deliveryId)];
}

const INSERT_COLS = `(marka_id, division_id, sezon_id, alt_sezon_code, delivery_id, sub_category_id, lifestyle_grup_id,
       option_say, gerceklesen_tedarik_kaynagi_id, updated_by)`;

async function createParameter(data, updatedBy) {
  const { rows } = await pool.query(
    `INSERT INTO delivery_plan_parametreleri ${INSERT_COLS}
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [...extractFields(data), updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const { rowCount } = await pool.query(
    `UPDATE delivery_plan_parametreleri
     SET marka_id = $1, division_id = $2, sezon_id = $3, alt_sezon_code = $4,
         delivery_id = $5, sub_category_id = $6, lifestyle_grup_id = $7,
         option_say = $8, gerceklesen_tedarik_kaynagi_id = $9,
         updated_by = $10, updated_at = now()
     WHERE id = $11`,
    [...extractFields(data), updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM delivery_plan_parametreleri WHERE id = $1', [id]);
  return rowCount > 0;
}

/** Kırılım varsa Option Say'ı günceller, yoksa ekler (Excel toplu içe aktarma). */
async function upsertParameter(data, updatedBy) {
  const { rows } = await pool.query(
    `INSERT INTO delivery_plan_parametreleri ${INSERT_COLS}
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (marka_id, division_id, sezon_id, alt_sezon_code, delivery_id, sub_category_id, lifestyle_grup_id)
     DO UPDATE SET option_say = EXCLUDED.option_say,
                   gerceklesen_tedarik_kaynagi_id = EXCLUDED.gerceklesen_tedarik_kaynagi_id,
                   updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [...extractFields(data), updatedBy || null]
  );
  return { id: rows[0].id, inserted: rows[0].inserted, row: await getParameterById(rows[0].id) };
}

// Gerçekleşen widget'ının okuduğu plan çıktısı. ID kolonları PLM Style
// alanlarıyla aynı adı taşır (BrandId/DivisionId/SeasonId/Alt_Sezon/DeliveryId)
// ki eşleştirme anahtarı doğrudan kurulabilsin; yanlarında gösterim isimleri var.
// Tedarik kaynağı iki anahtarla verilir:
//   DeliveryId                  -> Planlanan Tedarik Kaynağı (Style.DeliveryIdList)
//   GerceklesenTedarikKaynagiId -> Gerçekleşen Tedarik Kaynağı
//                                  ("GerceklesenTedarikSekli" ExtFldDropDownId)
function toPlanShape(row) {
  return {
    Marka: row.marka_ad,
    BrandId: row.marka_id,
    'Ana Kategori': row.division_ad,
    DivisionId: row.division_id,
    Sezon: row.sezon_ad,
    SeasonId: row.sezon_id,
    Alt_Sezon: row.alt_sezon_code,
    'Tedarik Kaynağı': row.delivery_ad,
    DeliveryId: row.delivery_id,
    GerceklesenTedarikKaynagiId: row.gerceklesen_tedarik_kaynagi_id,
    'Ürün Grubu': row.sub_category_ad,
    SubCategoryId: row.sub_category_id,
    'Life Style Grup': row.lifestyle_grup_ad,
    LifeStyleGrupId: row.lifestyle_grup_id, // colorway ColorwayUserDefinedField4 (CUD4)
    'Option Say': row.option_say
  };
}

async function listPlan(filters = {}) {
  const rows = await listParameters(filters);
  return rows.map(toPlanShape);
}

module.exports = {
  listParameters,
  getParameterById,
  findByKey,
  createParameter,
  updateParameter,
  deleteParameter,
  upsertParameter,
  listPlan,
  toPlanShape
};
