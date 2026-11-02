const pool = require('../config/db');

// option_plan_parametreleri (kaynak RangeSayacv6_2.xlsx). Her satır planlanan
// bir opsiyondur (placeholder); kırılım UNIQUE değildir. Satır kimliği
// "Opsiyon Kodu"dur (PH####) ve SİSTEM tarafından otomatik, sıralı üretilir
// (kullanıcı/Excel girmez): mevcut en büyük PH numarası + 1. Bu yüzden Excel
// içe aktarma "ekleme" semantiğindedir (her satır yeni bir PH alır).

const BASE_SELECT = `
  SELECT
    p.id,
    p.opsiyon_kodu,
    p.marka,
    p.brand_id,
    p.urun_grubu,
    p.sub_category_id,
    p.urun_alt_grup,
    p.sub_sub_category_id,
    p.fashion_pyramid,
    p.cud1,
    p.life_style_grup,
    p.cud4,
    p.ft,
    p.cud5,
    p.segment,
    p.udf5_id,
    p.season_id,
    p.alt_sezon,
    p.cluster,
    p.cluster_code,
    p.koleksiyon_tipi,
    p.koleksiyon_tipi_code,
    p.created_at,
    p.updated_at,
    p.updated_by
  FROM option_plan_parametreleri p
`;

const FIELDS = [
  'opsiyon_kodu', 'marka', 'brand_id', 'urun_grubu', 'sub_category_id',
  'urun_alt_grup', 'sub_sub_category_id', 'fashion_pyramid', 'cud1',
  'life_style_grup', 'cud4', 'ft', 'cud5', 'segment', 'udf5_id',
  'season_id', 'alt_sezon', 'cluster', 'cluster_code', 'koleksiyon_tipi', 'koleksiyon_tipi_code'
];

// Sonradan eklenen tema kırılımları. Güncellemede istekte HİÇ yoksa (alan adı
// gönderilmemişse) mevcut değer korunur: bu alanları bilmeyen eski widget
// sürümleri bir satırı düzenlediğinde Cluster / Koleksiyon Tipi silinmesin.
const KEEP_IF_ABSENT_ON_UPDATE = ['cluster', 'cluster_code', 'koleksiyon_tipi', 'koleksiyon_tipi_code'];

function isAbsent(data, snake) {
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return data[snake] === undefined && data[camel] === undefined;
}

// data: hem camelCase hem snake_case anahtarları kabul et (widget/Excel uyumu)
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
  addFilter('sub_sub_category_id', filters.subSubCategoryId);
  addFilter('season_id', filters.seasonId);
  addFilter('alt_sezon', filters.altSezon);
  addFilter('opsiyon_kodu', filters.opsiyonKodu);
  addFilter('cluster_code', filters.clusterCode);
  addFilter('koleksiyon_tipi_code', filters.koleksiyonTipiCode);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${BASE_SELECT} ${where} ORDER BY p.brand_id, p.sub_category_id, p.sub_sub_category_id, p.opsiyon_kodu`,
    values
  );
  return rows;
}

async function getParameterById(id) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function findByOpsiyonKodu(opsiyonKodu) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE p.opsiyon_kodu = $1`, [opsiyonKodu]);
  return rows[0] || null;
}

// Bir sonraki sıradaki "PH####" kodunu üretir (mevcut sayısal eklerin max'ı + 1).
// İsteğe bağlı client (transaction içinde tutarlı seri üretmek için).
async function nextOpsiyonKoduNumber(client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(opsiyon_kodu, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS maxn
     FROM option_plan_parametreleri`
  );
  return Number(rows[0].maxn) + 1;
}

async function createParameter(data, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Opsiyon Kodu verilmemişse sıradaki PH#### üretilir.
    const d = { ...data };
    if (pick(d, 'opsiyon_kodu') == null) {
      d.opsiyon_kodu = 'PH' + (await nextOpsiyonKoduNumber(client));
    }
    const { rows } = await client.query(
      `INSERT INTO option_plan_parametreleri (${cols.join(', ')})
       VALUES (${placeholders}) RETURNING id`,
      [...extractValues(d), updatedBy || null]
    );
    await client.query('COMMIT');
    return getParameterById(rows[0].id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Excel toplu içe aktarma. Satırda `id` varsa o kayıt güncellenir (Opsiyon Kodu
 * korunur), yoksa yeni placeholder olarak eklenir ve sıradaki PH#### verilir.
 * PH numaraları tek transaction içinde sıralı üretilir (yarış koşulu olmadan).
 *
 * Hatalı satır tüm transaction'ı düşürmesin diye her satır SAVEPOINT içinde
 * çalışır; Postgres'te başarısız bir ifade sonrası transaction "aborted"
 * duruma geçtiği için ROLLBACK TO ile o satır geri alınıp devam edilir.
 */
async function commitMany(rowsData, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updatable = FIELDS.filter((f) => f !== 'opsiyon_kodu');
  const setClause = updatable.map((f, i) => `${f} = $${i + 1}`).join(', ');

  const client = await pool.connect();
  const failed = [];
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    let n = await nextOpsiyonKoduNumber(client);

    for (const data of rowsData) {
      const id = data.id === undefined || data.id === null || data.id === '' ? null : Number(data.id);
      await client.query('SAVEPOINT satir');
      try {
        let done = false;
        if (id != null) {
          const { rowCount } = await client.query(
            `UPDATE option_plan_parametreleri
             SET ${setClause}, updated_by = $${updatable.length + 1}, updated_at = now()
             WHERE id = $${updatable.length + 2}`,
            [...updatable.map((f) => pick(data, f)), updatedBy || null, id]
          );
          if (rowCount > 0) { updated++; done = true; }
          // rowCount === 0: kayıt aradan silinmiş; aşağıda yeni kayıt olarak eklenir.
        }
        if (!done) {
          await client.query(
            `INSERT INTO option_plan_parametreleri (${cols.join(', ')}) VALUES (${placeholders})`,
            [...extractValues({ ...data, opsiyon_kodu: 'PH' + n }), updatedBy || null]
          );
          inserted++;
          n++;
        }
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

async function updateParameter(id, data, updatedBy) {
  // opsiyon_kodu değişmez (sistem üretimli); güncellemede dışarıda tutulur.
  const updatable = FIELDS.filter((f) => f !== 'opsiyon_kodu' && !(KEEP_IF_ABSENT_ON_UPDATE.includes(f) && isAbsent(data, f)));
  const setClause = updatable.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = updatable.map((f) => pick(data, f));
  const { rowCount } = await pool.query(
    `UPDATE option_plan_parametreleri
     SET ${setClause}, updated_by = $${updatable.length + 1}, updated_at = now()
     WHERE id = $${updatable.length + 2}`,
    [...values, updatedBy || null, id]
  );
  if (rowCount === 0) return null;
  return getParameterById(id);
}

async function deleteParameter(id) {
  const { rowCount } = await pool.query('DELETE FROM option_plan_parametreleri WHERE id = $1', [id]);
  return rowCount > 0;
}

// Opsiyon Kodu varsa günceller, yoksa ekler (Excel toplu içe aktarma).
async function upsertParameter(data, updatedBy) {
  const cols = FIELDS.concat('updated_by');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = FIELDS.filter((f) => f !== 'opsiyon_kodu')
    .map((f) => `${f} = EXCLUDED.${f}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO option_plan_parametreleri (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (opsiyon_kodu)
     DO UPDATE SET ${updates}, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [...extractValues(data), updatedBy || null]
  );
  return { id: rows[0].id, inserted: rows[0].inserted, row: await getParameterById(rows[0].id) };
}

// IpekyolRangeSayac servisinin beklediği (RangeSayacv6_2.xlsx) kolon adlarıyla
// bire bir eşleşen "plan" çıktısı. Böylece o proje Excel yerine doğrudan
// bu API'den okuyabilir (mantık aynı kalır).
function toPlanShape(row) {
  return {
    MARKA: row.marka,
    BrandId: row.brand_id,
    'Opsiyon Kodu': row.opsiyon_kodu,
    'ÜRÜN GRUBU': row.urun_grubu,
    SubCategoryId: row.sub_category_id,
    'Ürün Alt Grup': row.urun_alt_grup,
    SubSubCategoryId: row.sub_sub_category_id,
    'Fashion Pyramid': row.fashion_pyramid,
    CUD1: row.cud1,
    'Life Style Grup': row.life_style_grup,
    CUD4: row.cud4,
    FT: row.ft,
    CUD5: row.cud5,
    Segment: row.segment,
    UDF5Id: row.udf5_id,
    SeasonId: row.season_id,
    Alt_Sezon: row.alt_sezon,
    // Eklemeler (mevcut anahtarlar korunur). FT/CUD5 = colorway CUD5 = "Model Özellik".
    'Model Özellik': row.ft,
    Cluster: row.cluster,                       // tema Cluster etiketi (örn. "B")
    ClusterCode: row.cluster_code,              // tema Cluster kodu (örn. "013")
    'Koleksiyon Tipi': row.koleksiyon_tipi,     // tema Koleksiyon_Tipi etiketi (örn. "Ana Koleksiyon")
    KoleksiyonTipiCode: row.koleksiyon_tipi_code // tema Koleksiyon_Tipi kodu (örn. "001")
  };
}

async function listPlan(filters = {}) {
  const rows = await listParameters(filters);
  return rows.map(toPlanShape);
}

module.exports = {
  listParameters,
  getParameterById,
  findByOpsiyonKodu,
  nextOpsiyonKoduNumber,
  createParameter,
  commitMany,
  updateParameter,
  deleteParameter,
  upsertParameter,
  listPlan,
  toPlanShape,
  FIELDS
};
