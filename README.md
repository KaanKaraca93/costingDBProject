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
GET  /api/settings
PUT  /api/settings/:key                     { value }
```

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

## Yol Haritası

- [ ] Gerçek 406 satırlık `DECISION_TABLE` verisinin migrate edilmesi (kaynak: PLM `widget.ts`)
- [ ] `ref_alt_kategori` listesinin PLM'den canlı senkronizasyonu (token servisi hazır)
- [ ] PLM widget'ının `/api/parameters/resolve` endpoint'ine bağlanması
