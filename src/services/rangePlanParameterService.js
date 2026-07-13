const pool = require('../config/db');

// range_plan_parametreleri (kaynak Rangesayacv7_2.xlsx). Anahtar makeKey ile
// aynı: (brand_id, sub_category_id, ext_fld_id, drop_down_value, cud5_id,
// season_id, alt_sezon, life_style_grup). NULL alanlar IS NOT DISTINCT FROM
// ile karşılaştırılır (COALESCE'li UNIQUE index ile uyumlu).

const BASE_SELECT = `
  SELECT
    p.id,
    p.marka,
    p.brand_id,
    p.urun_grubu,
    p.sub_category_id,
    p.range_tag,
    p.range_ad,
    p.ext_fld_id,
    p.range_detayi,
    p.drop_down_value,
    p.cud5_id,
    p.option_say,
    p.season_id,
    p.alt_sezon,
    p.life_style_grup,
    p.created_at,
    p.updated_at,
    p.updated_by
  FROM range_plan_parametreleri p
`;

const FIELDS = [
  'marka', 'brand_id', 'urun_grubu', 'sub_category_id', 'range_tag',
  'range_ad', 'ext_fld_id', 'range_detayi', 'drop_down_value', 'cud5_id',
  'option_say', 'season_id', 'alt_sezon', 'life_style_grup'
];

function pick(data, snake) {
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const v = data[snake] !== undefined ? data[snake] : data[camel];
  return v === undefined || v === '' ? null : v;
}

function extractValues(data) {
  return FIELDS.map((f) => pick(data, f));
}

async function listParameters(filters = {}) {
  const conditions = [];
  const values = [];
  const addFilter = (column, value) => {
    if (value === undefined || value === null || value === '') return;
    values.push(value);
    conditions.push(`p.${column} = $${values.length}`);
  };
  addFilter('brand_id', filters.brandId);
  addFilter('sub_category_id', filters.subCategoryId);
  addFilter('ext_fld_id', filters.extFldId);
  addFilter('season_id', filters.seasonId);
  addFilter('alt_sezon', filters.altSezon);
  addFilter('life_style_grup', filters.lifeStyleGrup);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY p.brand_id, p.sub_category_id, p.ext_fld_id, p.drop_down_value`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

// makeKey bileşenlerine göre kayıt bulur (NULL güvenli).
async function findByKey(data) {
  const { rows } = await pool.query(
    `${BASE_SELECT}
     WHERE p.brand_id = $1 AND p.sub_category_id = $2 AND p.ext_fld_id = $3
       AND p.drop_down_value = $4 AND p.cud5_id IS NOT DISTINCT FROM $5
       AND p.season_id = $6 AND p.alt_sezon IS NOT DISTINCT FROM $7
       AND p.life_style_grup IS NOT DISTINCT FROM $8`,
    [
      pick(data, 'brand_id'), pick(data, 'sub_category_id'), pick(data, 'ext_fld_id'),
      pick(data, 'drop_down_value'), pick(data, 'cud5_id'), pick(data, 'season_id'),
      pick(data, 'alt_sezon'), pick(data, 'life_style_grup')
    ]
  );
  return rows[0] || null;
}

async function createParameter(data, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO range_plan_parametreleri (${cols.join(', ')})
     VALUES (${placeholders}) RETURNING id`,
    [...extractValues(data), updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const setClause = FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE range_plan_parametreleri
     SET ${setClause}, updated_by = $${FIELDS.length + 1}, updated_at = now()
     WHERE id = $${FIELDS.length + 2}`,
    [...extractValues(data), updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM range_plan_parametreleri WHERE id = $1', [id]);
  return rowCount > 0;
}

// Anahtar varsa günceller, yoksa ekler (Excel toplu içe aktarma).
async function upsertParameter(data, updatedBy) {
  const existing = await findByKey(data);
  if (existing) {
    const row = await updateParameter(existing.id, data, updatedBy);
    return { id: existing.id, inserted: false, row };
  }
  const row = await createParameter(data, updatedBy);
  return { id: row.id, inserted: true, row };
}

// Rangesayacv7_2.xlsx kolon adlarıyla bire bir eşleşen "plan" çıktısı.
function toPlanShape(row) {
  return {
    Marka: row.marka,
    BrandId: row.brand_id,
    'Ürün Gurbu': row.urun_grubu,
    SubCategoryId: row.sub_category_id,
    RangeTag: row.range_tag,
    Range: row.range_ad,
    ExtFldId: row.ext_fld_id,
    'Range Detayı': row.range_detayi,
    DropDownValue: row.drop_down_value,
    CUD5Id: row.cud5_id,
    'Option Say': row.option_say,
    SeasonId: row.season_id,
    Alt_Sezon: row.alt_sezon,
    'Life Style Grup': row.life_style_grup
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
  toPlanShape,
  FIELDS
};
