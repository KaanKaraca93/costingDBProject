const pool = require('../config/db');

async function listMarka() {
  const { rows } = await pool.query('SELECT marka_id, ad FROM ref_marka ORDER BY ad');
  return rows;
}

async function listAltKategori() {
  const { rows } = await pool.query('SELECT alt_kategori_id, ad FROM ref_alt_kategori ORDER BY ad');
  return rows;
}

async function listSegment() {
  const { rows } = await pool.query('SELECT segment_id, ad FROM ref_segment ORDER BY segment_id');
  return rows;
}

async function listLifestyleGrup() {
  const { rows } = await pool.query('SELECT lifestyle_grup_id, ad FROM ref_lifestyle_grup ORDER BY ad');
  return rows;
}

async function upsertAltKategori(altKategoriId, ad) {
  await pool.query(
    `INSERT INTO ref_alt_kategori (alt_kategori_id, ad) VALUES ($1, $2)
     ON CONFLICT (alt_kategori_id) DO UPDATE SET ad = EXCLUDED.ad`,
    [altKategoriId, ad]
  );
}

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function listSettings() {
  const { rows } = await pool.query('SELECT key, value FROM app_settings ORDER BY key');
  return rows;
}

module.exports = {
  listMarka,
  listAltKategori,
  listSegment,
  listLifestyleGrup,
  upsertAltKategori,
  getSetting,
  setSetting,
  listSettings
};
