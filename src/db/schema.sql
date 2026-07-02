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
