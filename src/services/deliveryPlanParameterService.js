const pool = require('../config/db');

// delivery_plan_parametreleri: Marka + Division + Sezon + Alt Sezon + Deliveries
// kırılımında planlanan opsiyon sayısı. Ön Adet ile aynı prensip: DB'de PLM
// ID'leri tutulur, isimler ref_* tablolarından JOIN ile gelir.

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
`;

const ORDER_BY = 'ORDER BY p.marka_id, p.sezon_id, p.alt_sezon_code, p.division_id, p.delivery_id';

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

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`${BASE_SELECT} ${where} ${ORDER_BY}`, values);
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function findByKey({ markaId, divisionId, sezonId, altSezonCode, deliveryId }) {
  const { rows } = await pool.query(
    `${BASE_SELECT} WHERE p.marka_id = $1 AND p.division_id = $2 AND p.sezon_id = $3
       AND p.alt_sezon_code = $4 AND p.delivery_id = $5`,
    [markaId, divisionId, sezonId, altSezonCode, deliveryId]
  );
  return rows[0] || null;
}

function extractFields(data) {
  const { markaId, divisionId, sezonId, altSezonCode, deliveryId, optionSay } = data;
  return [markaId, divisionId, sezonId, altSezonCode, deliveryId, optionSay];
}

async function createParameter(data, updatedBy) {
  const { rows } = await pool.query(
    `INSERT INTO delivery_plan_parametreleri
       (marka_id, division_id, sezon_id, alt_sezon_code, delivery_id, option_say, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [...extractFields(data), updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const { rowCount } = await pool.query(
    `UPDATE delivery_plan_parametreleri
     SET marka_id = $1, division_id = $2, sezon_id = $3, alt_sezon_code = $4,
         delivery_id = $5, option_say = $6, updated_by = $7, updated_at = now()
     WHERE id = $8`,
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
    `INSERT INTO delivery_plan_parametreleri
       (marka_id, division_id, sezon_id, alt_sezon_code, delivery_id, option_say, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (marka_id, division_id, sezon_id, alt_sezon_code, delivery_id)
     DO UPDATE SET option_say = EXCLUDED.option_say, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [...extractFields(data), updatedBy || null]
  );
  return { id: rows[0].id, inserted: rows[0].inserted, row: await getParameterById(rows[0].id) };
}

// Gerçekleşen widget'ının okuduğu plan çıktısı. Kolon adları PLM Style
// alanlarıyla aynıdır (BrandId/DivisionId/SeasonId/Alt_Sezon/DeliveryId) ki
// eşleştirme anahtarı doğrudan kurulabilsin; yanlarında gösterim isimleri var.
function toPlanShape(row) {
  return {
    Marka: row.marka_ad,
    BrandId: row.marka_id,
    Division: row.division_ad,
    DivisionId: row.division_id,
    Sezon: row.sezon_ad,
    SeasonId: row.sezon_id,
    Alt_Sezon: row.alt_sezon_code,
    Delivery: row.delivery_ad,
    DeliveryId: row.delivery_id,
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
