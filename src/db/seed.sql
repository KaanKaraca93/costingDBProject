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

-- Alt Sezon, PLM Theme_Attributes entity'sindeki sabit valueset (canlı doğrulanmıştır);
-- Sezon (ref_sezon) ise PLM'de sık değiştiği için burada seed edilmiyor, sadece
-- POST /api/ref/sync-from-plm ile senkronize ediliyor.
INSERT INTO ref_alt_sezon (alt_sezon_code, ad) VALUES
    ('Diğer', 'Diğer'),
    ('FW1', 'FW1'),
    ('FW2', 'FW2'),
    ('FW4', 'FW4'),
    ('SS1', 'SS1'),
    ('SS2', 'SS2'),
    ('SS3', 'SS3'),
    ('SS4', 'SS4')
ON CONFLICT (alt_sezon_code) DO NOTHING;

-- Bölüm ve Cluster, canlı doğrulanmış PLM verileriyle önceden seed edilir (ilk kullanımda
-- boş dropdown sürprizi olmasın); yine de PLM'de değişiklik olursa sync-from-plm ile
-- güncellenebilir.
INSERT INTO ref_bolum (bolum_id, ad) VALUES
    (4, 'ACCESSORY'),
    (5, 'SHOES'),
    (6, 'TEKSTIL'),
    (7, 'KOZMETIK'),
    (8, 'PLAJ URUNLERI'),
    (9, 'HEDIYE KUTUSU'),
    (10, 'SET URUN')
ON CONFLICT (bolum_id) DO NOTHING;

INSERT INTO ref_cluster (cluster_code, ad) VALUES
    ('008', 'Diğer'),
    ('013', 'B'),
    ('015', 'D'),
    ('016', 'E'),
    ('017', 'F'),
    ('018', 'G')
ON CONFLICT (cluster_code) DO NOTHING;

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

-- Tema Plan giris ekraninin varsayilan kategori kumesi.
-- Kaynak: RangeSayacv3_yeni_taslakv2.xlsx'teki marka bazinda distinct urun
-- gruplari (IPEKYOL 15, TWIST 17 = IPEKYOL + TAYT + BUSTIYER).
INSERT INTO ref_marka_kategori (brand_id, sub_category_id) VALUES
    (4,12),(4,13),(4,14),(4,17),(4,18),(4,19),(4,20),(4,21),
    (4,22),(4,23),(4,25),(4,26),(4,27),(4,49),(4,50),
    (8,12),(8,13),(8,14),(8,17),(8,18),(8,19),(8,20),(8,21),
    (8,22),(8,23),(8,25),(8,26),(8,27),(8,45),(8,46),(8,49),(8,50)
ON CONFLICT (brand_id, sub_category_id) DO NOTHING;
