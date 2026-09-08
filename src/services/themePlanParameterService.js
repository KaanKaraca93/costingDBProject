const pool = require('../config/db');

// theme_plan_parametreleri (kaynak RangeSayacv3_yeni_taslakv2.xlsx). Anahtar,
// IpekyolRangeSayac plmThemeCategoryService._makeKey ile birebir aynıdır:
//   (theme_id, sub_category_id, season_id, alt_sezon)
// theme_id ve alt_sezon NULL olabilir; karşılaştırma IS NOT DISTINCT FROM ile
// yapılır (COALESCE'li UNIQUE index ile uyumlu).
//
// tema_adi, PLM'den türetilemeyen bir alandır: planlamacının kısa adıdır
// (örn. "B-SCT1"), PLM'deki tema adı ise "SS 27_IPK_B_SCT1"dir. Raporlarda
// kısa ad göründüğü için satırda etiket olarak saklanır ve ayrıca ref_theme'e
// yazılır (tema ile 1:1'dir, sonraki girişlerde otomatik önerilir).

const BASE_SELECT = `
  SELECT
    p.id,
    p.marka,
    p.brand_id,
    p.season_id,
    p.free_field_three,
    p.tema_adi,
    p.theme_id,
    p.kategori,
    p.sub_category_id,
    p.alt_sezon,
    p.opt_say,
    p.created_at,
    p.updated_at,
    p.updated_by
  FROM theme_plan_parametreleri p
`;

const FIELDS = [
  'marka', 'brand_id', 'season_id', 'free_field_three', 'tema_adi',
  'theme_id', 'kategori', 'sub_category_id', 'alt_sezon', 'opt_say'
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
  addFilter('season_id', filters.seasonId);
  addFilter('alt_sezon', filters.altSezon);
  addFilter('theme_id', filters.themeId);
  addFilter('sub_category_id', filters.subCategoryId);

  // Sıra ekleme sırasıdır (p.id). Kırılıma göre sıralamak, RangeSayac
  // theme-category çıktısının satır sırasını eski Excel'inkinden farklı
  // yapıyordu; plan satırları Excel'den bu sırayla aktarıldığı için p.id
  // eski çıktıyı birebir korur. Yeni girilen tema satırları sona eklenir.
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY p.id`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

// _makeKey bileşenlerine göre kayıt bulur (NULL güvenli).
async function findByKey(data) {
  const { rows } = await pool.query(
    `${BASE_SELECT}
     WHERE p.theme_id IS NOT DISTINCT FROM $1
       AND p.sub_category_id = $2
       AND p.season_id = $3
       AND p.alt_sezon IS NOT DISTINCT FROM $4`,
    [pick(data, 'theme_id'), pick(data, 'sub_category_id'), pick(data, 'season_id'), pick(data, 'alt_sezon')]
  );
  return rows[0] || null;
}

/**
 * Tema kısa adını ref_theme'e yazar (tema ile 1:1). Böylece sonraki plan
 * girişlerinde kullanıcıya otomatik önerilebilir. Tema ref'te yoksa (PLM
 * senkronu henüz çalışmamışsa) sessizce atlanır — plan satırı yine de yazılır.
 */
async function rememberKisaAd(runner, themeId, kisaAd) {
  if (themeId == null || kisaAd == null || kisaAd === '') return;
  await runner.query(
    'UPDATE ref_theme SET kisa_ad = $2 WHERE theme_id = $1',
    [themeId, kisaAd]
  );
}

async function createParameter(data, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO theme_plan_parametreleri (${cols.join(', ')})
       VALUES (${placeholders}) RETURNING id`,
      [...extractValues(data), updatedBy || null]
    );
    await rememberKisaAd(client, pick(data, 'theme_id'), pick(data, 'tema_adi'));
    await client.query('COMMIT');
    return getParameterById(rows[0].id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateParameter(id, data, updatedBy) {
  const setClause = FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE theme_plan_parametreleri
       SET ${setClause}, updated_by = $${FIELDS.length + 1}, updated_at = now()
       WHERE id = $${FIELDS.length + 2}`,
      [...extractValues(data), updatedBy || null, id]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await rememberKisaAd(client, pick(data, 'theme_id'), pick(data, 'tema_adi'));
    await client.query('COMMIT');
    return getParameterById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM theme_plan_parametreleri WHERE id = $1', [id]);
  return rowCount > 0;
}

// Anahtar varsa günceller, yoksa ekler.
async function upsertParameter(data, updatedBy) {
  const existing = await findByKey(data);
  if (existing) {
    const row = await updateParameter(existing.id, data, updatedBy);
    return { id: existing.id, inserted: false, row };
  }
  const row = await createParameter(data, updatedBy);
  return { id: row.id, inserted: true, row };
}

/**
 * Excel toplu içe aktarma. Satırda `id` varsa o kayıt güncellenir, yoksa yeni
 * kayıt eklenir. Hatalı satır tüm transaction'ı düşürmesin diye her satır
 * SAVEPOINT içinde çalışır (Postgres'te başarısız ifade sonrası transaction
 * "aborted" duruma geçer; ROLLBACK TO ile o satır geri alınıp devam edilir).
 */
async function commitMany(rowsData, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const setClause = FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');

  const client = await pool.connect();
  const failed = [];
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');

    for (const data of rowsData) {
      const id = data.id === undefined || data.id === null || data.id === '' ? null : Number(data.id);
      await client.query('SAVEPOINT satir');
      try {
        let done = false;
        if (id != null) {
          const { rowCount } = await client.query(
            `UPDATE theme_plan_parametreleri
             SET ${setClause}, updated_by = $${FIELDS.length + 1}, updated_at = now()
             WHERE id = $${FIELDS.length + 2}`,
            [...extractValues(data), updatedBy || null, id]
          );
          if (rowCount > 0) { updated++; done = true; }
          // rowCount === 0: kayıt aradan silinmiş; aşağıda yeni kayıt olarak eklenir.
        }
        if (!done) {
          await client.query(
            `INSERT INTO theme_plan_parametreleri (${cols.join(', ')}) VALUES (${placeholders})`,
            [...extractValues(data), updatedBy || null]
          );
          inserted++;
        }
        await rememberKisaAd(client, pick(data, 'theme_id'), pick(data, 'tema_adi'));
        await client.query('RELEASE SAVEPOINT satir');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT satir');
        failed.push({ row: data, error: err.message });
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { inserted, updated, failed };
}

/**
 * IpekyolRangeSayac plmThemeCategoryService'in beklediği
 * (RangeSayacv3_yeni_taslakv2.xlsx) kolon adlarıyla bire bir eşleşen "plan"
 * çıktısı. O servisin okuma mantığı ve API çıktısı değişmeden kalsın diye
 * kolon adları ve tipleri Excel ile aynıdır.
 */
function toPlanShape(row) {
  return {
    MARKA: row.marka,
    BrandId: row.brand_id,
    SeasonId: row.season_id,
    FreeFieldThree: row.free_field_three,
    'Tema Adı': row.tema_adi,
    ThemeId: row.theme_id,
    Kategori: row.kategori,
    SubCategoryId: row.sub_category_id,
    Alt_Sezon: row.alt_sezon,
    'Opt Say': row.opt_say
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
  commitMany,
  listPlan,
  toPlanShape,
  FIELDS
};
