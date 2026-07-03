const pool = require('../config/db');

const BASE_SELECT = `
  SELECT
    p.id,
    p.marka_id,
    rm.ad             AS marka_ad,
    p.bolum_id,
    rb.ad             AS bolum_ad,
    p.alt_kategori_id,
    rak.ad            AS alt_kategori_ad,
    p.cluster_code,
    rc.ad             AS cluster_ad,
    p.lifestyle_grup_id,
    rlg.ad            AS lifestyle_grup_ad,
    p.sezon_id,
    rsz.ad            AS sezon_ad,
    p.alt_sezon_code,
    rasz.ad           AS alt_sezon_ad,
    p.adet,
    p.created_at,
    p.updated_at,
    p.updated_by
  FROM on_adet_parametreleri p
  LEFT JOIN ref_marka rm            ON rm.marka_id = p.marka_id
  LEFT JOIN ref_bolum rb            ON rb.bolum_id = p.bolum_id
  LEFT JOIN ref_alt_kategori rak    ON rak.alt_kategori_id = p.alt_kategori_id
  LEFT JOIN ref_cluster rc          ON rc.cluster_code = p.cluster_code
  LEFT JOIN ref_lifestyle_grup rlg  ON rlg.lifestyle_grup_id = p.lifestyle_grup_id
  LEFT JOIN ref_sezon rsz           ON rsz.sezon_id = p.sezon_id
  LEFT JOIN ref_alt_sezon rasz      ON rasz.alt_sezon_code = p.alt_sezon_code
`;

async function listParameters({ markaId, bolumId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode } = {}) {
  const conditions = [];
  const values = [];

  const addFilter = (column, value) => {
    if (value === undefined || value === null || value === '') return;
    values.push(value);
    conditions.push(`p.${column} = $${values.length}`);
  };

  addFilter('marka_id', markaId);
  addFilter('bolum_id', bolumId);
  addFilter('alt_kategori_id', altKategoriId);
  addFilter('cluster_code', clusterCode);
  addFilter('lifestyle_grup_id', lifestyleGrupId);
  addFilter('sezon_id', sezonId);
  addFilter('alt_sezon_code', altSezonCode);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY p.marka_id, p.bolum_id, p.alt_kategori_id, p.cluster_code, p.lifestyle_grup_id, p.sezon_id, p.alt_sezon_code`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function findByKey({ markaId, bolumId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode }) {
  const { rows } = await pool.query(
    `${BASE_SELECT} WHERE p.marka_id = $1 AND p.bolum_id = $2 AND p.alt_kategori_id = $3
       AND p.cluster_code = $4 AND p.lifestyle_grup_id = $5 AND p.sezon_id = $6 AND p.alt_sezon_code = $7`,
    [markaId, bolumId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode]
  );
  return rows[0] || null;
}

function extractFields(data) {
  const { markaId, bolumId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode, adet } = data;
  return [markaId, bolumId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode, adet];
}

async function createParameter(data, updatedBy) {
  const { rows } = await pool.query(
    `INSERT INTO on_adet_parametreleri
       (marka_id, bolum_id, alt_kategori_id, cluster_code, lifestyle_grup_id, sezon_id, alt_sezon_code, adet, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [...extractFields(data), updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const { rowCount } = await pool.query(
    `UPDATE on_adet_parametreleri
     SET marka_id = $1, bolum_id = $2, alt_kategori_id = $3, cluster_code = $4,
         lifestyle_grup_id = $5, sezon_id = $6, alt_sezon_code = $7, adet = $8,
         updated_by = $9, updated_at = now()
     WHERE id = $10`,
    [...extractFields(data), updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM on_adet_parametreleri WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * Marka/Bölüm/AltKategori/Cluster/LifeStyleGrup/Sezon/AltSezon kırılımı zaten varsa
 * günceller, yoksa oluşturur (Excel toplu içe aktarma akışı için).
 */
async function upsertParameter(data, updatedBy) {
  const { rows } = await pool.query(
    `INSERT INTO on_adet_parametreleri
       (marka_id, bolum_id, alt_kategori_id, cluster_code, lifestyle_grup_id, sezon_id, alt_sezon_code, adet, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (marka_id, bolum_id, alt_kategori_id, cluster_code, lifestyle_grup_id, sezon_id, alt_sezon_code)
     DO UPDATE SET adet = EXCLUDED.adet, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [...extractFields(data), updatedBy || null]
  );
  return { id: rows[0].id, inserted: rows[0].inserted, row: await getParameterById(rows[0].id) };
}

module.exports = {
  listParameters,
  getParameterById,
  findByKey,
  createParameter,
  updateParameter,
  deleteParameter,
  upsertParameter
};
