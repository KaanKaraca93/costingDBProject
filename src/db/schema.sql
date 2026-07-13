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

-- Option Plan (v6.2) için ek PLM lookup'ları (GenericLookUpAll GlValId anahtarlı):
--   Fashion Pyramid = CUD1 = GlRefId 224
--   Koleksiyon Tipi = CUD5 = GlRefId 228  (Excel'de "FT" başlığıyla geçiyordu)
-- (Life Style Grup = CUD4 = GlRefId 227 zaten ref_lifestyle_grup ile karşılanır.)
CREATE TABLE IF NOT EXISTS ref_fashion_pyramid (
    id  INTEGER PRIMARY KEY,
    ad  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_koleksiyon_tipi (
    id  INTEGER PRIMARY KEY,
    ad  TEXT NOT NULL
);

-- Range Plan (v7.2) "Range Detayı" değerleri: PLM ExtendedFieldDropDown.
-- Anahtar (DropDownValue) = ExtFldDropDownId (global unique). ext_fld_id, hangi
-- Extended Field'a (Range) ait olduğunu belirtir; aynı isim (ad) farklı
-- ext_fld_id altında tekrar edebilir, bu yüzden çözümleme (ext_fld_id, ad) ile yapılır.
CREATE TABLE IF NOT EXISTS ref_ext_field_dropdown (
    ext_fld_dropdown_id INTEGER PRIMARY KEY,
    ext_fld_id          TEXT NOT NULL,
    ad                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ref_ext_field_dropdown_extfld_idx
    ON ref_ext_field_dropdown (ext_fld_id);

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

-- ─────────────────────────────────────────────────────────────────────────
-- OPTION PLAN PARAMETRELERI (kaynak: RangeSayacv6_2.xlsx)
-- IpekyolRangeSayac "Range Count Source V6.2" servisinin placeholder/plan
-- kaynağı. Her satır planlanan bir opsiyon (placeholder) demektir; aynı
-- kırılımdaki satır sayısı = o kırılımın planlanan opsiyon adedi. Bu yüzden
-- kırılım UNIQUE DEĞİLDİR; satır kimliği "Opsiyon Kodu"dur (PH####).
-- Eşleştirme ID kolonlarıyla yapılır (brand_id, sub_category_id,
-- sub_sub_category_id, cud1, cud4, cud5, udf5_id, season_id, alt_sezon);
-- isim (metin) kolonları yalnızca çıktı/etikettir. Excel'deki hem ID hem
-- isim kolonlarına bire bir sadık kalınır.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS option_plan_parametreleri (
    id                  SERIAL PRIMARY KEY,
    opsiyon_kodu        TEXT NOT NULL,
    marka               TEXT,               -- MARKA (etiket)
    brand_id            INTEGER NOT NULL,   -- BrandId
    urun_grubu          TEXT,               -- ÜRÜN GRUBU (etiket)
    sub_category_id     INTEGER NOT NULL,   -- SubCategoryId (Kategori)
    urun_alt_grup       TEXT,               -- Ürün Alt Grup (etiket)
    sub_sub_category_id INTEGER NOT NULL,   -- SubSubCategoryId (Alt Kategori)
    fashion_pyramid     TEXT,               -- Fashion Pyramid (etiket)
    cud1                INTEGER,            -- CUD1 (Fashion Pyramid id / ColorwayUserField1)
    life_style_grup     TEXT,               -- Life Style Grup (etiket)
    cud4                INTEGER,            -- CUD4 (ColorwayUserDefinedField4 id)
    ft                  TEXT,               -- FT (etiket)
    cud5                INTEGER,            -- CUD5 (ColorwayUserDefinedField5 id)
    segment             TEXT,               -- Segment (etiket)
    udf5_id             INTEGER,            -- UDF5Id (UserDefinedField5 id)
    season_id           INTEGER NOT NULL,   -- SeasonId
    alt_sezon           TEXT,               -- Alt_Sezon (metin, örn. "SS1")
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT,
    CONSTRAINT option_plan_parametreleri_opsiyon_kodu_key UNIQUE (opsiyon_kodu)
);

-- ─────────────────────────────────────────────────────────────────────────
-- RANGE PLAN PARAMETRELERI (kaynak: Rangesayacv7_2.xlsx)
-- IpekyolRangeSayac "PLM Range V7.2" servisinin plan kaynağı. Her satır bir
-- (range detay / dropdown değeri) kırılımı + planlanan "Option Say" adedidir.
-- Eşleştirme anahtarı makeKey ile aynıdır:
--   (brand_id, sub_category_id, ext_fld_id, drop_down_value, cud5_id,
--    season_id, alt_sezon, life_style_grup)
-- NULL alanların anahtarda tutarlı davranması için COALESCE'li UNIQUE index.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS range_plan_parametreleri (
    id                  SERIAL PRIMARY KEY,
    marka               TEXT,               -- Marka (etiket)
    brand_id            INTEGER NOT NULL,   -- BrandId
    urun_grubu          TEXT,               -- Ürün Gurbu (etiket)
    sub_category_id     INTEGER NOT NULL,   -- SubCategoryId
    range_tag           TEXT,               -- RangeTag
    range_ad            TEXT,               -- Range
    ext_fld_id          TEXT NOT NULL,      -- ExtFldId (GUID)
    range_detayi        TEXT,               -- Range Detayı
    drop_down_value     INTEGER NOT NULL,   -- DropDownValue
    cud5_id             INTEGER,            -- CUD5Id
    option_say          INTEGER NOT NULL DEFAULT 0, -- Option Say (planlanan adet)
    season_id           INTEGER NOT NULL,   -- SeasonId
    alt_sezon           TEXT,               -- Alt_Sezon
    life_style_grup     TEXT,               -- Life Style Grup (grup: Mono/Business/Tema/Diğer)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS range_plan_parametreleri_key
    ON range_plan_parametreleri (
        brand_id, sub_category_id, ext_fld_id, drop_down_value,
        COALESCE(cud5_id, -1), season_id, COALESCE(alt_sezon, ''), COALESCE(life_style_grup, '')
    );
