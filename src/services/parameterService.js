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
`;

async function listParameters({ markaId, altKategoriId } = {}) {
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

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY dp.marka_id, dp.alt_kategori_id, dp.segment_id, dp.lifestyle_grup_id`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE dp.id = $1`, [id]);
  return rows[0] || null;
}

async function findByKey({ markaId, altKategoriId, segmentId, lifestyleGrupId }) {
  const { rows } = await pool.query(
    `${BASE_SELECT} WHERE dp.marka_id = $1 AND dp.alt_kategori_id = $2 AND dp.segment_id = $3 AND dp.lifestyle_grup_id = $4`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId]
  );
  return rows[0] || null;
}

async function createParameter(data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf } = data;
  const { rows } = await pool.query(
    `INSERT INTO decision_parameters
       (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, mu, sarf, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf, updatedBy || null]
  );
  return getParameterById(rows[0].id);
}

async function updateParameter(id, data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf } = data;
  const { rowCount } = await pool.query(
    `UPDATE decision_parameters
     SET marka_id = $1, alt_kategori_id = $2, segment_id = $3, lifestyle_grup_id = $4,
         mu = $5, sarf = $6, updated_by = $7, updated_at = now()
     WHERE id = $8`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf, updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM decision_parameters WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * Marka/AltKategori/Segment/LifeStyleGrup k\u0131r\u0131l\u0131m\u0131 zaten varsa g\u00fcnceller, yoksa olu\u015fturur.
 * Excel toplu i\u00e7e aktarma ak\u0131\u015f\u0131 i\u00e7in kullan\u0131l\u0131r. Postgres'in sistem kolonu `xmax`in
 * INSERT sonras\u0131 0 olmas\u0131ndan faydalan\u0131p sat\u0131r\u0131n yeni mi g\u00fcncellenmi\u015f mi oldu\u011funu d\u00f6ner.
 */
async function upsertParameter(data, updatedBy) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf } = data;
  const { rows } = await pool.query(
    `INSERT INTO decision_parameters
       (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, mu, sarf, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id)
     DO UPDATE SET mu = EXCLUDED.mu, sarf = EXCLUDED.sarf, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf, updatedBy || null]
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
