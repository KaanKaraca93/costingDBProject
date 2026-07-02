# Ipekyol Maliyet Parametreleri (Costing DB)

PLM "Target Cost Calculator" widget'ının kod içine gömülü (`DECISION_TABLE`) MU/Sarf
parametrelerini, iş kullanıcılarının kod deploy'una ihtiyaç duymadan kendi ekranlarından
yönetebilmesi için hazırlanmış bağımsız web uygulaması.

Teknik detay ve veri modeli kararları için bkz. [`PARAMETER_DB_SPEC.md`](./PARAMETER_DB_SPEC.md).

## Mimari

- **Backend**: Node.js + Express
- **Veritabanı**: PostgreSQL (Heroku Postgres Eco/Mini tier yeterli)
- **Frontend**: Vanilla HTML/CSS/JS (basit liste + filtre + create/update formu)
- **Deploy**: Heroku (Procfile ile)
- **Erişim**: Bu uygulama şu an ayrı bir kullanıcı girişi/oturum katmanı içermiyor;
  erişimin PLM üzerinden sağlanması planlanıyor.

## Kurulum (local)

```bash
npm install
cp .env.example .env   # DATABASE_URL'i kendi local Postgres'inize göre düzenleyin
npm run migrate        # schema.sql + seed.sql çalıştırır
npm run dev             # nodemon ile geliştirme modu
```

Uygulama varsayılan olarak `http://localhost:3000` üzerinde çalışır.

## Veri Modeli (özet)

| Tablo | Açıklama |
|---|---|
| `decision_parameters` | Marka + Alt Kategori + Segment + LifeStyle Grubu kırılımına göre MU/Sarf değerleri (unique constraint ile korunur) |
| `app_settings` | Kırılıma göre değişmeyen global ayarlar (örn. `kdv_orani`, fallback değerleri) |
| `ref_marka`, `ref_alt_kategori`, `ref_segment`, `ref_lifestyle_grup` | Dropdown'lar için isim/ID eşleştirme tabloları — **kullanıcı arayüzde her zaman ismi görür, ID'yi görmez**; ID sadece DB/entegrasyon tarafında tutulur. |

## API Uçları

### Parametreler
```
GET    /api/parameters                      Liste (opsiyonel ?markaId=&altKategoriId= filtresi)
GET    /api/parameters/:id                  Tek kayıt
GET    /api/parameters/resolve?marka=&altKategori=&segment=&lifestyleGrup=
                                             PLM entegrasyonu için MU/Sarf çözümleme (eşleşme yoksa fallback döner)
POST   /api/parameters                      Yeni kayıt
PUT    /api/parameters/:id                  Güncelle
DELETE /api/parameters/:id                  Sil
```

### Referans veriler
```
GET  /api/ref/marka
GET  /api/ref/alt-kategori
GET  /api/ref/segment
GET  /api/ref/lifestyle-grup
POST /api/ref/alt-kategori                  { altKategoriId, ad } upsert
POST /api/ref/sync-from-plm                 Marka/Alt Kategori/Segment/LifeStyle listelerini PLM'den çeker
GET  /api/settings
PUT  /api/settings/:key                     { value }
```

### Swagger / OpenAPI

Tüm endpoint'lerin interaktif dokümantasyonu: **`/api-docs`** (örn. yerelde
`http://localhost:3000/api-docs`, production'da `https://costingdb-8538ae5b78bc.herokuapp.com/api-docs`).
PLM'e widget tarafından çağrılacak API'leri tanıtırken bu dokümantasyonu kaynak olarak kullanabilirsiniz;
widget'ın asıl ihtiyaç duyduğu tek uç `GET /api/parameters/resolve`.

## PLM'den İsim Listelerini Senkronize Etme (ref_* tabloları)

`decision_parameters` tablosunda ID'ler (marka_id, alt_kategori_id, segment_id,
lifestyle_grup_id) tutulur; kullanıcı arayüzde bu ID'leri görmez, her zaman
`ref_*` tablolarındaki **isimleri** görür. Bu isimleri PLM'den canlı çekmek için:

```
POST /api/ref/sync-from-plm
```

Bu endpoint PLM'nin `GenericLookUpAll` (odata2) servisinden şu filtrelerle veri çeker:

| Alan | GlrefId | PLM LookUpType |
|---|---|---|
| Marka | 1 | Brand |
| Alt Kategori | 69 | Product Subsubcategory |
| Segment | 232 | (segment lookup) |
| LifeStyle Grubu | 227 | (lifestyle grubu lookup) |

Her kayıtta gerçek DB anahtarı **`GlValId`**'dir (Code veya Id değil). Gösterim ismi
için önce `Translations` içinde `Culture = "tr-tr"` olan çeviri aranır, bulunamazsa
kök `Name` alanı kullanılır. Bu mantık `src/services/plmLookupService.js` içinde.

Arayüzde "🔄 PLM'den İsim Listelerini Senkronize Et" butonuyla da tetiklenebilir.
PLM'de yeni bir kategori eklendiğinde veya isim değiştiğinde tekrar çalıştırmak yeterli;
PLM'de artık dönmeyen eski kayıtlar mevcut `decision_parameters` referansları kopmasın
diye otomatik silinmez.

> Not: Bu senkronizasyon `tokenService`/`plm.config.js` üzerinden PLM'e OAuth2.0 ile
> bağlanır (canlı test edilip PRD tenant'ında çalıştığı doğrulanmıştır). PLM widget'ının
> kendisinin çağıracağı `/api/parameters/resolve` ise bu token'a ihtiyaç duymaz.

### PLM Token Servisi (ileri aşama için hazırlandı)

`src/config/plm.config.js` ve `src/services/tokenService.js`, `IpekyolRangeSayac`
projesindeki aynı OAuth2.0 akışını kullanır (Infor ION API). Şu an için credentials
bilinçli olarak kod içinde hardcoded tutuluyor; entegrasyon (örn. `ref_alt_kategori`
listesinin PLM'den canlı senkronize edilmesi) stabilleştikten sonra environment
variable'a taşınacak.

```
GET  /api/token              Token al
GET  /api/token/info         Token durumu
POST /api/token/refresh      Token yenile
POST /api/token/revoke       Token iptal et
```

`NODE_ENV=production` olduğunda otomatik olarak PRD tenant'ı (`ATJZAMEWEF5P4SNV_PRD`)
kullanılır; aksi halde TEST tenant'ı (`ATJZAMEWEF5P4SNV_TST`) kullanılır. PRD tenant'ı
local ortamda test edilip token alımının başarılı olduğu doğrulanmıştır.

## Heroku Deploy

```bash
heroku create <app-adi>
heroku addons:create heroku-postgresql:mini
heroku config:set PG_SSL=true
git push heroku main
```

`release` fazı (`Procfile`) her deploy'da otomatik olarak `npm run migrate` çalıştırır.

### "DATABASE_URL tanımlı değil" / "ECONNREFUSED 127.0.0.1:5432" hatası

Bu hata, Heroku Postgres eklentisi henüz app'e bağlı olmadığı için `DATABASE_URL`
env variable'ının hiç set edilmemiş olmasından kaynaklanır (set edilmeyince kod
`localhost:5432`'ye bağlanmayı dener). Çözüm:

```bash
# 1) Postgres eklentisini ekleyin (bu otomatik olarak DATABASE_URL'i set eder)
heroku addons:create heroku-postgresql:essential-0 --app costingdb-8538ae5b78bc

# 2) DATABASE_URL'in gerçekten set edildiğini doğrulayın
heroku config --app costingdb-8538ae5b78bc

# 3) Heroku Postgres SSL gerektirdiği için:
heroku config:set PG_SSL=true --app costingdb-8538ae5b78bc

# 4) release fazını (migration) tekrar tetiklemek için ya yeniden deploy edin
#    ya da manuel çalıştırın:
heroku run npm run migrate --app costingdb-8538ae5b78bc

# 5) Logları kontrol edin
heroku logs --tail --app costingdb-8538ae5b78bc
```

Eklenti planı isimleri Heroku tarafında zaman zaman değişebiliyor (`mini`, `essential-0`
gibi); `heroku addons:create heroku-postgresql --app costingdb-8538ae5b78bc` komutunu
plan belirtmeden çalıştırırsanız Heroku size güncel seçenekleri listeler.

## Yol Haritası

- [ ] Gerçek 406 satırlık `DECISION_TABLE` verisinin migrate edilmesi (kaynak: PLM `widget.ts`)
- [x] `ref_marka` / `ref_alt_kategori` / `ref_segment` / `ref_lifestyle_grup` listelerinin PLM'den senkronizasyonu (`POST /api/ref/sync-from-plm`)
- [ ] PLM widget'ının `/api/parameters/resolve` endpoint'ine bağlanması (Swagger dokümantasyonu PLM'e tanıtılacak)
