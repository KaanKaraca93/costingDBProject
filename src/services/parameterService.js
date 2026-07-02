const pool = require('../config/db');

const BASE_SELECT = `
  SELECT
    dp.id,
    dp.marka_id,
    rm.ad            AS marka_ad,
    dp.alt_kategori_id,
    rak.ad           AS alt_kategori_ad,
    dp.segment_id,
    rs.ad            AS segment_ad,
    dp.lifestyle_grup_id,
    rlg.ad           AS lifestyle_grup_ad,
    dp.sezon_id,
    rsz.ad           AS sezon_ad,
    dp.alt_sezon_code,
    rasz.ad          AS alt_sezon_ad,
    dp.mu,
    dp.sarf,
    dp.created_at,
    dp.updated_at,
    dp.updated_by
  FROM decision_parameters dp
  LEFT JOIN ref_marka rm            ON rm.marka_id = dp.marka_id
  LEFT JOIN ref_alt_kategori rak    ON rak.alt_kategori_id = dp.alt_kategori_id
  LEFT JOIN ref_segment rs          ON rs.segment_id = dp.segment_id
  LEFT JOIN ref_lifestyle_grup rlg  ON rlg.lifestyle_grup_id = dp.lifestyle_grup_id
  LEFT JOIN ref_sezon rsz           ON rsz.sezon_id = dp.sezon_id
  LEFT JOIN ref_alt_sezon rasz      ON rasz.alt_sezon_code = dp.alt_sezon_code
`;

async function listParameters({ markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId, altSezonCode } = {}) {
  const conditions = [];
  const values = [];

  if (markaId) {
    values.push(markaId);
    conditions.push(`dp.marka_id = $${values.length}`);
  }
  if (altKategoriId) {
    values.push(altKategoriId);
    conditions.push(`dp.alt_kategori_id = $${values.length}`);
  }
  if (segmentId) {
    values.push(segmentId);
    conditions.push(`dp.segment_id = $${values.length}`);
  }
  if (lifestyleGrupId) {
    values.push(lifestyleGrupId);
    conditions.push(`dp.lifestyle_grup_id = $${values.length}`);
  }
  if (sezonId) {
    values.push(sezonId);
    conditions.push(`dp.sezon_id = $${values.length}`);
  }
  if (altSezonCode) {
    values.push(altSezonCode);
    conditions.push(`dp.alt_sezon_code = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY dp.marka_id, dp.alt_kategori_id, dp.segment_id, dp.lifestyle_grup_id, dp.sezon_id, dp.alt_sezon_code`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE dp.id = $1`, [id]);
  return rows[0] || null;
}

/**
 * sezonId / altSezonCode henüz doldurulmamış eski kayıtlarda NULL olabileceğinden
 * `=` yerine `IS NOT DISTINCT FROM` kullanılır (NULL = NULL karşılaştırmasını da
 * doğru şekilde eşleştirir).
 */
async function findByKey({ markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId, altSezonCode }) {
  const { rows } = await pool.query(
    `${BASE_SELECT} WHERE dp.marka_id = $1 AND dp.alt_kategori_id = $2 AND dp.segment_id = $3
       AND dp.lifestyle_grup_id = $4 AND dp.sezon_id IS NOT DISTINCT FROM $5
       AND dp.alt_sezon_code IS NOT DISTINCT FROM $6`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId ?? null, altSezonCode ?? null]
  );
  return rows[0] || null;
}

async function createParameter(data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId, altSezonCode, mu, sarf } = data;
  const { rows } = await pool.query(
    `INSERT INTO decision_parameters
       (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, sezon_id, alt_sezon_code, mu, sarf, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId ?? null, altSezonCode ?? null, mu, sarf, updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId, altSezonCode, mu, sarf } = data;
  const { rowCount } = await pool.query(
    `UPDATE decision_parameters
     SET marka_id = $1, alt_kategori_id = $2, segment_id = $3, lifestyle_grup_id = $4,
         sezon_id = $5, alt_sezon_code = $6, mu = $7, sarf = $8, updated_by = $9, updated_at = now()
     WHERE id = $10`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId ?? null, altSezonCode ?? null, mu, sarf, updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM decision_parameters WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * Marka/AltKategori/Segment/LifeStyleGrup/Sezon/AltSezon kırılımı zaten varsa günceller,
 * yoksa oluşturur. Excel toplu içe aktarma akışı için kullanılır. Postgres'in sistem
 * kolonu `xmax`in INSERT sonrası 0 olmasından faydalanıp satırın yeni mi güncellenmiş mi
 * olduğunu döner.
 *
 * Not: sezonId/altSezonCode NULL gönderilirse ON CONFLICT eşleşmesi (Postgres'te NULL
 * hiçbir zaman "eşit" sayılmadığından) tetiklenmez ve satır her zaman yeni eklenir; bu,
 * sezon/alt sezon bilgisi olmayan eski kayıtlar için beklenen davranıştır.
 */
async function upsertParameter(data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId, altSezonCode, mu, sarf } = data;
  const { rows } = await pool.query(
    `INSERT INTO decision_parameters
       (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, sezon_id, alt_sezon_code, mu, sarf, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, sezon_id, alt_sezon_code)
     DO UPDATE SET mu = EXCLUDED.mu, sarf = EXCLUDED.sarf, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, sezonId ?? null, altSezonCode ?? null, mu, sarf, updatedBy || null]
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
