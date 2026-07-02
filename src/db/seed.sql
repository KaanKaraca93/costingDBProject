-- Bilinen referans verileri (PARAMETER_DB_SPEC.md Bölüm 7)
-- Not: alt_kategori ve segment listeleri PLM'den teyit edilene kadar boş/kısmi kalabilir.

INSERT INTO ref_marka (marka_id, ad) VALUES
    (4, 'Ipekyol'),
    (8, 'Marka 8 (isim teyit edilecek)')
ON CONFLICT (marka_id) DO NOTHING;

INSERT INTO ref_lifestyle_grup (lifestyle_grup_id, ad) VALUES
    (1, 'Mono'),
    (2, 'Essential'),
    (3, 'Tema'),
    (8, 'Business')
ON CONFLICT (lifestyle_grup_id) DO NOTHING;

INSERT INTO ref_segment (segment_id, ad) VALUES
    (1, 'Segment 1'),
    (2, 'Segment 2'),
    (3, 'Segment 3'),
    (4, 'Segment 4'),
    (5, 'Segment 5')
ON CONFLICT (segment_id) DO NOTHING;

-- Global ayar: KDV oranı (spec Bölüm 4)
INSERT INTO app_settings (key, value) VALUES
    ('kdv_orani', '0.10')
ON CONFLICT (key) DO NOTHING;

-- Eşleşme bulunamadığında kullanılacak fallback değerler (spec Bölüm 6)
INSERT INTO app_settings (key, value) VALUES
    ('fallback_mu_default', '4.94'),
    ('fallback_mu_essential', '3.15'),
    ('fallback_sarf', '1.5')
ON CONFLICT (key) DO NOTHING;
