# Parametre Yönetim Widget'ı — Teknik Spesifikasyon

Bu doküman, **mevcut PLM "Target Cost Calculator" widget'ının** (`widget.ts`) içinde şu anda
kod içine gömülü (hardcoded) duran `DECISION_TABLE` dizisini **kullanıcıların kendi başına
yönetebileceği bağımsız bir web uygulamasına** taşımak için hazırlanmıştır. Amaç: iş kullanıcıları
(Berke vb.) yeni bir kod deploy'una ihtiyaç duymadan MU/Sarf gibi parametreleri kendi
ekranlarından girip güncelleyebilsin.

Hedef mimari: GitHub'da tutulan bir proje, Heroku'ya deploy edilecek, veri katmanı olarak
**Heroku Postgres (Eco/Mini tier yeterli — veri hacmi ~500-1000 satır civarında kalacak)**
kullanılacak.

---

## 1. Mevcut sistemin çalışma mantığı (referans)

PLM widget'ı bir ürün (Style) için maliyet hesaplarken şu sırayla ilerliyor:

1. Üründen **4 parçalı bir anahtar (kırılım)** üretiliyor: `MarkaId-AltKategoriId-SegmentId-LifeStyleGrupId`
2. Bu anahtarla decision table'da satır aranıyor (`DECISION_MAP[key]`).
3. Bulunan satırdan **MU, KDV, Sarf** değerleri okunuyor.
4. Ürünün **PSF (perakende satış fiyatı)** ve **Segment** bilgisi zaten üründen (PLM'den) geliyor —
   asla decision table'dan okunmuyor.
5. Formüller (bkz. Bölüm 3) bu değerlerle canlı hesaplanıyor.

Yeni uygulamanın görevi: **sadece 3. adımdaki satırları (anahtar → MU/Sarf) yönetmek.**
PSF, Segment, kur gibi değerler her zaman üründen/PLM'den geleceği için bu yeni DB'de
**tutulmamalı**.

---

## 2. Zorunlu kırılım (composite key) — 4 alan

Her parametre satırı şu 4 alanın kombinasyonuyla **benzersiz** olmalı:

| Alan | Tip | PLM Karşılığı | Açıklama |
|---|---|---|---|
| `marka_id` | int | `Style.BrandId` | Marka. Şu an sadece **4** (Ipekyol) ve **8** (ikinci marka) kullanımda. |
| `alt_kategori_id` | int | `Style.ProductSubSubCategoryId` | Ürün alt kategorisi (örn. BLAZER, BLUZ, PANTOLON...). PLM'de tanımlı sabit bir kod listesi. |
| `segment_id` | int | `Style.UserDefinedField5Id` | Fiyat segmenti. Şu an 1-5 arası değerler görülüyor (Segment 1...Segment 5). |
| `lifestyle_grup_id` | int | Ürünün **ilk renginin** (`StyleColorways[0]`) `ColorwayUserField4` alanı | Bilinen değerler: `1=Mono, 2=Essential, 3=Tema, 8=Business`. Başka değerler de olabilir, sabit liste olarak varsayma; PLM'den referans listesi çekilebiliyorsa oradan besle. |

> ⚠️ **Not (renk kırılımı hakkında):** `lifestyle_grup_id` PLM tarafında ürünün ilk (sıradaki)
> renginden geliyor ve PLM tarafında "aktif/pasif" renk ayrımı garanti edilmiyor — pasif bir
> renk ilk sırada gelirse onun değeri kullanılıyor. Bu yeni uygulamanın sorumluluğunda değil,
> sadece PLM widget'ının veri çekme davranışı; parametre DB tasarımını etkilemiyor, bilgi
> amaçlı belirtildi.

## 3. Zorunlu değer alanları (her kırılım satırı için)

| Alan | Tip | Zorunlu mu? | Açıklama |
|---|---|---|---|
| `mu` | decimal(5,2) | **Evet** | Markup çarpanı. `AlimFiyat_TRY = (PSF / (1+KDV)) / MU` formülünde bölen. Gözlemlenen aralık ~3.0–5.8. |
| `sarf` | decimal(6,3) | **Evet** | Kumaş sarfiyatı (birim). `KumaşHedefMaliyet = (AlimFiyat_USD_kur_sonrası * 0.4) / Sarf` formülünde kullanılıyor. Gözlemlenen aralık ~0.6–2.4 (bazı kayıtlarda 0, o durumda kumaş hedefi hesaplanamıyor). |

## 4. Global / tek satırlık ayar (kırılıma göre DEĞİL, tüm sistem için tek değer)

| Alan | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `kdv_orani` | decimal(4,3) | `0.10` | Mevcut 406 satırın **tamamında** KDV = 0.10 (%10) sabit. Kırılıma göre değişmiyor, bu yüzden per-satır alan olarak DEĞİL, tek bir "genel ayar" (settings tablosu / config) olarak tutulması yeterli. İleride kategori bazlı KDV farkı çıkarsa `alt_kategori_id` bazında override eklenebilir, ama MVP için gerekli değil. |

## 5. ⚠️ Bu yeni sistemde OLMAMASI gereken alanlar (eski tablodan kaldırıldı)

Kod analiz edildi; aşağıdaki alanlar decision table'da yer alıyordu ama gerçek hesaplamada
**hiç kullanılmıyor** veya **artık başka bir kaynaktan** geliyor. Yeni parametre DB'sine
**eklenmemeli**:

| Eski alan | Neden dahil edilmiyor |
|---|---|
| `HesaplamaKuru` (kur) | **Artık decision table'dan gelmiyor.** PLM'deki `Cost10` (USD kuru) ve `Cost14` (EUR kuru) extended field'larından canlı okunuyor. Kullanıcıdan kur parametresi istemene gerek yok. |
| `SegmentPSF` | Koda bakıldığında sadece state'e kopyalanıyor, hiçbir formülde kullanılmıyor (ölü alan). PSF zaten her zaman üründen geliyor. |
| `AlimFiyat_USD` | Koda bakıldığında hiç okunmuyor. Gerçek USD alım fiyatı her zaman canlı formülle hesaplanıyor: `alimUSD = cost2USD / NAVL / VRG`. |
| `KumasHedefMaliyet` | Aynı şekilde hiç okunmuyor. Her zaman canlı hesaplanıyor: `(cost2USD * 0.4) / Sarf`. |
| `AlimFiyat_TRY` | Sadece PSF boş geldiğinde devreye giren bir "yedek" değerdi. Sen PSF'nin **her zaman** üründen dolu geleceğini söylediğin için bu yedek yol hiç tetiklenmeyecek — gerekli değil. |
| `VRG` / `NAVL` (vergi/navlun çarpanı) | Artık markaya/parametreye bakılmaksızın **sabit** (1.51 / 1.08). Decision table'da hiç yoktu zaten, DB'ye eklenmesine gerek yok — kod tarafında sabit kalabilir. |

---

## 6. Formül akışı (yeni sistemin doğru veri ürettiğini test etmek için referans)

Girdi: `PSF` (üründen), `KDV=0.10` (global), `MU` ve `Sarf` (yeni DB'den, kırılıma göre),
`kur` (PLM Cost10/14'ten canlı), `VRG=1.51`, `NAVL=1.08` (sabit).

```
AlimFiyat_TRY = round( (PSF / (1 + KDV)) / MU, 2 )
Cost2_USD     = round( AlimFiyat_TRY / kur, 2 )
AlimFiyat_USD = round( Cost2_USD / NAVL / VRG, 2 )          // sadece Overseas/YD kanalında NAVL/VRG uygulanıyor, Local/Üretim'de 1 kabul edilebilir — bu widget tarafının detayı
KumasHedefMaliyet = round( (Cost2_USD * 0.4) / Sarf, 2 )     // Sarf=0 ise hesaplanamaz, 0 dön
```

Eşleşme bulunamazsa (yeni DB'de o kırılım için satır yoksa) mevcut sistemin fallback'i:
```
MU  = (lifestyle_grup_id === 2) ? 3.15 : 4.94
KDV = 0.10
Sarf = 1.5
```
Yeni uygulama da bu "eşleşme yoksa ne dönülür" davranışını (bir "default/fallback" satırı
veya sabit config olarak) desteklemeli ki PLM widget'ı entegre olduğunda hiç boş dönmesin.

---

## 7. Önerilen Postgres şeması

```sql
CREATE TABLE decision_parameters (
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

CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
-- seed: INSERT INTO app_settings (key, value) VALUES ('kdv_orani', '0.10');

-- Referans/lookup tabloları (dropdown'lar için, opsiyonel ama önerilir)
CREATE TABLE ref_marka (marka_id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
CREATE TABLE ref_lifestyle_grup (lifestyle_grup_id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
CREATE TABLE ref_alt_kategori (alt_kategori_id INTEGER PRIMARY KEY, ad TEXT NOT NULL);
-- ref_segment gerekirse aynı şekilde (1..5 → "Segment 1".."Segment 5")
```

Bilinen referans verileri (ilk seed için):

```sql
INSERT INTO ref_marka (marka_id, ad) VALUES (4, 'Ipekyol'), (8, 'Marka 8 (isim teyit edilecek)');

INSERT INTO ref_lifestyle_grup (lifestyle_grup_id, ad) VALUES
    (1, 'Mono'), (2, 'Essential'), (3, 'Tema'), (8, 'Business');
```

`ref_alt_kategori` için PLM'in `ProductSubSubCategory` referans listesi canlı çekilebiliyorsa
oradan senkron edilmesi en sağlıklısı (isim + id eşleşmesi PLM'de zaten tanımlı).

---

## 8. Mevcut veri göçü (migration)

`widget.ts` içindeki `DECISION_TABLE` dizisinde şu an **406 satır** var. Yeni sistem kurulurken
bu 406 satır (`marka_id, alt_kategori_id, segment_id, lifestyle_grup_id, mu, sarf`) ilk veri
olarak `decision_parameters` tablosuna aktarılmalı (KDV, kur, SegmentPSF, AlimFiyat_TRY/USD,
KumasHedefMaliyet kolonları migration'da atlanacak, Bölüm 5'e bakınız).

## 9. UI beklentisi (özet)

- Kullanıcı Marka / Alt Kategori / Segment / LifeStyle Grup'u dropdown'lardan seçip MU ve Sarf
  girebilmeli (create/update).
- Aynı 4'lü kombinasyon tekrar girilirse hata vermeli (unique constraint zaten koruyor) ya da
  var olanı güncelleme moduna geçmeli.
- Basit bir liste/tablo görünümü + filtre (marka, alt kategori) yeterli, karmaşık bir UI gerekmiyor.
- Kimlik doğrulama: en azından basit bir şifre/login katmanı önerilir (herkese açık internet
  üzerinde maliyet parametreleri düzenlenebilir olmamalı).

## 10. PLM widget'ı ile entegrasyon (ileri aşama, şimdilik bilgi amaçlı)

Bugün `widget.ts` içindeki `DECISION_TABLE` statik bir dizi. İleride bu yeni uygulama bir
REST endpoint (örn. `GET /api/parameters?marka=4&altKategori=102&segment=3&lifestyleGrup=8`)
sunarsa, PLM widget'ı statik diziyi bu API çağrısıyla değiştirebilir. Bu adım şu an
kapsamda değil, sadece gelecekteki entegrasyon için mimari not olarak düşünülsün.
