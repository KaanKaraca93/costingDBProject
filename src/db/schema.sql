-- Parametre Yönetim Widget'ı - Postgres şeması
-- Kaynak: PARAMETER_DB_SPEC.md Bölüm 7

CREATE TABLE IF NOT EXISTS decision_parameters (
    id                  SERIAL PRIMARY KEY,
    marka_id            INTEGER NOT NULL,
    alt_kategori_id     INTEGER NOT NULL,
    segment_id          INTEGER NOT NULL,
    lifestyle_grup_id   INTEGER NOT NULL,
    mu                  NUMERIC(5,2) NOT NULL,
    sarf                NUMERIC(6,3) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT,
    UNIQUE (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id)
);

-- Sezon (GLrefId 58, standart PLM lookup) ve Alt Sezon (PLM Theme_Attributes
-- entity'sinin Alt_Sezon valueset'i, metin kodlu) kırılıma sonradan eklenen
-- 2 yeni boyut. Mevcut kayıtlarda bu alanlar NULL kalabilir (eski satırlar yeni
-- sezon/alt sezon bilgisi girilene kadar "sezon belirtilmemiş" sayılır); bu yüzden
-- DB seviyesinde NOT NULL zorunlu tutulmuyor, zorunluluk uygulama (API) katmanında
-- yeni kayıt/güncellemelerde kontrol ediliyor.
ALTER TABLE decision_parameters ADD COLUMN IF NOT EXISTS sezon_id INTEGER;
ALTER TABLE decision_parameters ADD COLUMN IF NOT EXISTS alt_sezon_code TEXT;

-- Kırılım art\u0131k 6 alandan olu\u015fuyor; eski 4'l\u00fc UNIQUE constraint'i (ad\u0131 ne olursa olsun
-- bulup) kald\u0131r\u0131p yerine 6'l\u0131 olan\u0131 ekliyoruz. Bu blok tekrar tekrar \u00e7al\u0131\u015ft\u0131r\u0131labilir
-- (Heroku release faz\u0131 her deploy'da migrate.js'i \u00e7al\u0131\u015ft\u0131r\u0131yor).
DO $$
DECLARE
    old_constraint_name TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'decision_parameters'
          AND constraint_name = 'decision_parameters_unique_kirilim'
    ) THEN
        SELECT tc.constraint_name INTO old_constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.table_name = 'decision_parameters'
          AND tc.constraint_type = 'UNIQUE'
        LIMIT 1;

        IF old_constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE decision_parameters DROP CONSTRAINT %I', old_constraint_name);
        END IF;

        EXECUTE 'ALTER TABLE decision_parameters
            ADD CONSTRAINT decision_parameters_unique_kirilim
            UNIQUE (marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, sezon_id, alt_sezon_code)';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

-- Referans/lookup tabloları (dropdown'lar için)
CREATE TABLE IF NOT EXISTS ref_marka (
    marka_id    INTEGER PRIMARY KEY,
    ad          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_lifestyle_grup (
    lifestyle_grup_id   INTEGER PRIMARY KEY,
    ad                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_alt_kategori (
    alt_kategori_id     INTEGER PRIMARY KEY,
    ad                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_segment (
    segment_id  INTEGER PRIMARY KEY,
    ad          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_sezon (
    sezon_id    INTEGER PRIMARY KEY,
    ad          TEXT NOT NULL
);

-- Alt Sezon PLM'de bir lookup değil, Theme_Attributes entity'sinin sabit bir
-- valueset'i; anahtarı (kod) metin (örn. "FW1", "SS2", "Diğer").
CREATE TABLE IF NOT EXISTS ref_alt_sezon (
    alt_sezon_code  TEXT PRIMARY KEY,
    ad              TEXT NOT NULL
);

-- "Ön Adet Parametreleri" tablosu için ek referanslar
CREATE TABLE IF NOT EXISTS ref_bolum (
    bolum_id    INTEGER PRIMARY KEY,
    ad          TEXT NOT NULL
);

-- Cluster de Alt Sezon gibi bir Theme_Attributes valueset'i; anahtarı (kod) metin
-- (örn. "013"), gösterim ismi farklıdır (örn. "B").
CREATE TABLE IF NOT EXISTS ref_cluster (
    cluster_code    TEXT PRIMARY KEY,
    ad              TEXT NOT NULL
);

-- Kategori = PLM SubCategoryId (GLrefId 65). Ön yüzde "Kategori", arkada SubCategoryId.
-- Ön Adet fallback'inde Alt Kategori (ProductSubSubCategoryId) eşleşmezse bir üst
-- seviye olarak bu SubCategory kırılımına bakılır.
CREATE TABLE IF NOT EXISTS ref_kategori (
    kategori_id INTEGER PRIMARY KEY,
    ad          TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────
-- Ön Adet Parametreleri: Marka + Bölüm + Alt Kategori + Cluster + LifeStyle
-- Grubu + Sezon + Alt Sezon kırılımına göre "Adet" (tam sayı) değeri.
-- decision_parameters ile aynı yönetim mantığı (CRUD + Excel içe/dışa aktarma),
-- farklı bir kırılım ve tek bir sayısal değer alanı.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS on_adet_parametreleri (
    id                  SERIAL PRIMARY KEY,
    marka_id            INTEGER NOT NULL,
    bolum_id            INTEGER NOT NULL,
    kategori_id         INTEGER NOT NULL,
    alt_kategori_id     INTEGER NOT NULL,
    cluster_code        TEXT NOT NULL,
    lifestyle_grup_id   INTEGER NOT NULL,
    sezon_id            INTEGER NOT NULL,
    alt_sezon_code      TEXT NOT NULL,
    adet                INTEGER NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT,
    CONSTRAINT on_adet_parametreleri_unique_kirilim
        UNIQUE (marka_id, bolum_id, kategori_id, alt_kategori_id, cluster_code, lifestyle_grup_id, sezon_id, alt_sezon_code)
);

-- Kategori (SubCategory) sonradan eklenen bir boyut; daha önce deploy edilmiş
-- (boş) tabloya da eklensin ve UNIQUE constraint kategori_id'yi içerecek şekilde
-- yeniden kurulsun. Blok idempotenttir (her deploy'da migrate.js çalışır).
ALTER TABLE on_adet_parametreleri ADD COLUMN IF NOT EXISTS kategori_id INTEGER;

DO $$
DECLARE
    c TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'on_adet_parametreleri'
          AND constraint_name = 'on_adet_parametreleri_unique_kirilim'
    ) THEN
        FOR c IN
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_name = 'on_adet_parametreleri' AND constraint_type = 'UNIQUE'
        LOOP
            EXECUTE format('ALTER TABLE on_adet_parametreleri DROP CONSTRAINT %I', c);
        END LOOP;

        EXECUTE 'ALTER TABLE on_adet_parametreleri
            ADD CONSTRAINT on_adet_parametreleri_unique_kirilim
            UNIQUE (marka_id, bolum_id, kategori_id, alt_kategori_id, cluster_code, lifestyle_grup_id, sezon_id, alt_sezon_code)';
    END IF;
END $$;
