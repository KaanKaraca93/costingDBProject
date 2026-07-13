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

async function listSezon() {
  const { rows } = await pool.query('SELECT sezon_id, ad FROM ref_sezon ORDER BY ad');
  return rows;
}

async function listAltSezon() {
  const { rows } = await pool.query('SELECT alt_sezon_code, ad FROM ref_alt_sezon ORDER BY ad');
  return rows;
}

async function listBolum() {
  const { rows } = await pool.query('SELECT bolum_id, ad FROM ref_bolum ORDER BY ad');
  return rows;
}

async function listCluster() {
  const { rows } = await pool.query('SELECT cluster_code, ad FROM ref_cluster ORDER BY ad');
  return rows;
}

async function listKategori() {
  const { rows } = await pool.query('SELECT kategori_id, ad FROM ref_kategori ORDER BY ad');
  return rows;
}

async function listFashionPyramid() {
  const { rows } = await pool.query('SELECT id, ad FROM ref_fashion_pyramid ORDER BY ad');
  return rows;
}

async function listKoleksiyonTipi() {
  const { rows } = await pool.query('SELECT id, ad FROM ref_koleksiyon_tipi ORDER BY ad');
  return rows;
}

async function listExtFieldDropDown() {
  const { rows } = await pool.query(
    'SELECT ext_fld_dropdown_id, ext_fld_id, ad FROM ref_ext_field_dropdown ORDER BY ext_fld_id, ad'
  );
  return rows;
}

async function upsertAltKategori(altKategoriId, ad) {
  await pool.query(
    `INSERT INTO ref_alt_kategori (alt_kategori_id, ad) VALUES ($1, $2)
     ON CONFLICT (alt_kategori_id) DO UPDATE SET ad = EXCLUDED.ad`,
    [altKategoriId, ad]
  );
}

const REF_TABLE_CONFIG = {
  marka: { table: 'ref_marka', idColumn: 'marka_id' },
  altKategori: { table: 'ref_alt_kategori', idColumn: 'alt_kategori_id' },
  segment: { table: 'ref_segment', idColumn: 'segment_id' },
  lifestyleGrup: { table: 'ref_lifestyle_grup', idColumn: 'lifestyle_grup_id' },
  sezon: { table: 'ref_sezon', idColumn: 'sezon_id' },
  altSezon: { table: 'ref_alt_sezon', idColumn: 'alt_sezon_code' },
  bolum: { table: 'ref_bolum', idColumn: 'bolum_id' },
  cluster: { table: 'ref_cluster', idColumn: 'cluster_code' },
  kategori: { table: 'ref_kategori', idColumn: 'kategori_id' },
  fashionPyramid: { table: 'ref_fashion_pyramid', idColumn: 'id' },
  koleksiyonTipi: { table: 'ref_koleksiyon_tipi', idColumn: 'id' }
};

async function upsertRefItems(type, items) {
  const config = REF_TABLE_CONFIG[type];
  if (!config) throw new Error(`Bilinmeyen ref tipi: ${type}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO ${config.table} (${config.idColumn}, ad) VALUES ($1, $2)
         ON CONFLICT (${config.idColumn}) DO UPDATE SET ad = EXCLUDED.ad`,
        [item.id, item.name]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return items.length;
}

/**
 * PLM'den çekilen tüm lookup listelerini (marka/altKategori/segment/lifestyleGrup)
 * ilgili ref_* tablolarına upsert eder. Mevcutta olup PLM'de artık dönmeyen kayıtlar
 * silinmez (decision_parameters'daki referanslar kopmasın diye).
 */
async function syncRefTablesFromPlm(lookups) {
  const result = {};
  for (const type of Object.keys(REF_TABLE_CONFIG)) {
    result[type] = await upsertRefItems(type, lookups[type] || []);
  }
  return result;
}

// ExtendedFieldDropDown farklı şemalı (ext_fld_dropdown_id, ext_fld_id, ad);
// generic upsertRefItems'e uymaz, ayrı ele alınır.
async function upsertExtFieldDropDown(items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items || []) {
      await client.query(
        `INSERT INTO ref_ext_field_dropdown (ext_fld_dropdown_id, ext_fld_id, ad)
         VALUES ($1, $2, $3)
         ON CONFLICT (ext_fld_dropdown_id)
         DO UPDATE SET ext_fld_id = EXCLUDED.ext_fld_id, ad = EXCLUDED.ad`,
        [item.id, item.extFldId, item.name]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return (items || []).length;
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
  listSezon,
  listAltSezon,
  listBolum,
  listCluster,
  listKategori,
  listFashionPyramid,
  listKoleksiyonTipi,
  listExtFieldDropDown,
  upsertAltKategori,
  syncRefTablesFromPlm,
  upsertExtFieldDropDown,
  getSetting,
  setSetting,
  listSettings
};
