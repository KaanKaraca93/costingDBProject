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
| `decision_parameters` | Marka + Alt Kategori + Segment + LifeStyle Grubu + Sezon + Alt Sezon kırılımına göre MU/Sarf değerleri (unique constraint ile korunur) |
| `on_adet_parametreleri` | Marka + Bölüm + Kategori + Alt Kategori + Cluster + LifeStyle Grubu + Sezon + Alt Sezon kırılımına göre Adet değeri |
| `option_plan_parametreleri` | **RangeSayac v6.2** plan kaynağı (eski `RangeSayacv6_2.xlsx`). Her satır planlanan bir opsiyon; **Opsiyon Kodu (PH####) sistem tarafından otomatik/sıralı üretilir** (kullanıcı/Excel girmez). Boyutlar PLM lookup'larından çözümlenir: Marka(1)/Ürün Grubu=SubCategory(65)/Ürün Alt Grup=SubSubCategory(69)/Fashion Pyramid=CUD1(224)/Life Style Grup=CUD4(227)/Koleksiyon Tipi=CUD5(228)/Segment(232)/Sezon(58)/Alt Sezon. |
| `range_plan_parametreleri` | **RangeSayac v7.2** plan kaynağı (eski `Rangesayacv7_2.xlsx`). Range detay/dropdown planı + `Option Say`. `Range`=Extended Field adı → sabit `ExtFldId`; `Range Detayı`=PLM `ExtendedFieldDropDown` değeri → `DropDownValue` (=ExtFldDropDownId), `(ExtFldId + Name)` çifti ile çözümlenir. Anahtar RangeSayac `makeKey` ile aynı. |
| `ref_fashion_pyramid` / `ref_koleksiyon_tipi` / `ref_ext_field_dropdown` | Option/Range plan dropdown kaynakları; `POST /api/ref/sync-from-plm` ile PLM'den doldurulur. |
| `app_settings` | Kırılıma göre değişmeyen global ayarlar (örn. `kdv_orani`, fallback değerleri) |

### Range/Option plan API'leri (RangeSayac entegrasyonu)

Eski `IpekyolRangeSayac` servisleri planı Excel'den okuyordu; artık bu DB'den API ile
okunacak. Her iki tablo için Ön Adet ile aynı prensipler geçerlidir (CRUD + Excel şablon +
içe aktarma doğrula/uygula):

| İşlem | Option Plan (v6.2) | Range Plan (v7.2) |
|---|---|---|
| Liste (DB satırları) | `GET /api/option-plan-parametreleri` | `GET /api/range-plan-parametreleri` |
| **Plan çıktısı (Excel kolon adları)** | `GET /api/option-plan-parametreleri?format=plan` | `GET /api/range-plan-parametreleri?format=plan` |
| Excel şablon | `GET .../template` | `GET .../template` |
| İçe aktar (doğrula/uygula) | `POST .../import/validate` · `POST .../import/commit` | aynı |
| CRUD | `POST/PUT/DELETE .../[:id]` | `POST/PUT/DELETE .../[:id]` |

> `?format=plan` çıktısı, ilgili kaynak Excel'in (`RangeSayacv6_2.xlsx` /
> `Rangesayacv7_2.xlsx`) kolon adlarıyla **bire bir** aynıdır. Böylece RangeSayac
> tarafında `XLSX.readFile(...).sheet_to_json(...)` çağrısı, doğrudan bu API'den
> `axios.get(...)` ile değiştirilebilir; eşleştirme mantığı aynen korunur.
| `ref_marka`, `ref_alt_kategori`, `ref_segment`, `ref_lifestyle_grup`, `ref_sezon`, `ref_alt_sezon` | Dropdown'lar için isim/ID eşleştirme tabloları — **kullanıcı arayüzde her zaman ismi görür, ID'yi görmez**; ID sadece DB/entegrasyon tarafında tutulur. `ref_alt_sezon`'un anahtarı (`alt_sezon_code`) diğerlerinden farklı olarak **metin** kodudur (örn. "FW1"), çünkü kaynağı bir GenericLookUpAll lookup'ı değil, PLM Theme_Attributes entity'sinin sabit valueset'idir. |

> **Not (geriye dönük uyumluluk):** `sezon_id` ve `alt_sezon_code` kolonları DB seviyesinde
> `NULL` olabilir; bu iki boyut sonradan eklendiği için PLM üzerinden senkronize edilmeden
> önce oluşturulmuş eski kayıtlarda bu alanlar boştur. Yeni kayıt/güncellemelerde API
> katmanı bu iki alanı da **zorunlu** tutar — eski bir satırı düzenlemek isteyen kullanıcı
> önce Sezon/Alt Sezon seçmek zorunda kalır. Excel şablonunda da aynı şekilde eski satırlar
> bu iki kolon boş olarak iner ve doldurulmadan tekrar yüklenirse hata olarak işaretlenir.

## API Uçları

### Parametreler
```
GET    /api/parameters                      Liste (opsiyonel ?markaId=&altKategoriId=&sezonId= filtresi)
GET    /api/parameters/:id                  Tek kayıt
GET    /api/parameters/resolve?marka=&altKategori=&segment=&lifestyleGrup=&sezon=&altSezon=
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
GET  /api/ref/sezon
GET  /api/ref/alt-sezon
POST /api/ref/alt-kategori                  { altKategoriId, ad } upsert
POST /api/ref/sync-from-plm                 Marka/Alt Kategori/Segment/LifeStyle/Sezon/Alt Sezon listelerini PLM'den çeker
GET  /api/settings
PUT  /api/settings/:key                     { value }
```

### Excel şablon indirme / toplu içe aktarma
```
GET  /api/parameters/template               Mevcut kayıtlarla dolu, dropdown veri doğrulamalı .xlsx şablonu
                                             (?format=base64 verilirse JSON içinde {filename, contentBase64} döner — PLM widget'ı bunu kullanır)
POST /api/parameters/import/validate        { fileBase64 } — DB'ye yazmadan satır satır eşleşme/doğrulama kontrolü yapar
POST /api/parameters/import/commit          { rows: [...], updatedBy } — /import/validate'den dönen "ok" satırları upsert eder
```

Şablonda Marka/Alt Kategori/Segment/LifeStyle Grubu/Sezon/Alt Sezon kolonları **isim** olarak gelir (ID değil)
ve her hücrede Excel veri doğrulaması (açılır liste) bulunur; kullanıcı listede olmayan bir
değer yazarsa Excel anında uyarır. Yükleme sırasında da sunucu tarafında aynı kontrol tekrar
yapılır: eşleşmeyen/eksik/tekrar eden satırlar `import/validate` cevabında hata olarak işaretlenir
ve **içe aktarılmaz**; sadece geçerli satırlar `import/commit` ile eklenir/güncellenir. Hem
standalone web arayüzünde ("⬇️ Excel Şablonu İndir" / "📤 Excel'den Yükle") hem de PLM widget'ında
("Şablon İndir" / "Excel'den Yükle") aynı akış kullanılabilir.

### Swagger / OpenAPI

Tüm endpoint'lerin interaktif dokümantasyonu: **`/api-docs`** (örn. yerelde
`http://localhost:3000/api-docs`, production'da `https://costingdb-8538ae5b78bc.herokuapp.com/api-docs`).
PLM'e widget tarafından çağrılacak API'leri tanıtırken bu dokümantasyonu kaynak olarak kullanabilirsiniz;
widget'ın asıl ihtiyaç duyduğu tek uç `GET /api/parameters/resolve`.

## PLM'den İsim Listelerini Senkronize Etme (ref_* tabloları)

`decision_parameters` tablosunda ID'ler (marka_id, alt_kategori_id, segment_id,
lifestyle_grup_id, sezon_id, alt_sezon_code) tutulur; kullanıcı arayüzde bu ID'leri
görmez, her zaman `ref_*` tablolarındaki **isimleri** görür. Bu isimleri PLM'den canlı
çekmek için:

```
POST /api/ref/sync-from-plm
```

Bu endpoint iki farklı PLM kaynağından veri çeker:

**1) `GenericLookUpAll` (odata2) — Marka/Alt Kategori/Segment/LifeStyle Grubu/Sezon**

| Alan | GlrefId | PLM LookUpType |
|---|---|---|
| Marka | 1 | Brand |
| Alt Kategori | 69 | Product Subsubcategory |
| Segment | 232 | (segment lookup) |
| LifeStyle Grubu | 227 | (lifestyle grubu lookup) |
| Sezon | 58 | Season |

Her kayıtta gerçek DB anahtarı **`GlValId`**'dir (Code veya Id değil). Gösterim ismi
için önce `Translations` içinde `Culture = "tr-tr"` olan çeviri aranır, bulunamazsa
kök `Name` alanı kullanılır. Bu mantık `src/services/plmLookupService.js` içinde.

**2) IDM `datamodel/entities` — Alt Sezon**

Alt Sezon bir `GenericLookUpAll` lookup'ı değildir; PLM'nin `Theme_Attributes` entity
tanımındaki `Alt_Sezon` alanının sabit bir valueset'idir:

```
GET https://mingle-ionapi.eu1.inforcloudsuite.com/{tenant}/IDM/api/datamodel/entities/Theme_Attributes
```

Yanıttaki `entity.attrs.attr[].valueset.value[]` dizisinden `name`/`desc` çiftleri okunur;
**`name` DB'ye yazılan gerçek anahtar**, **`desc` ise kullanıcıya gösterilen isimdir**
(Alt Sezon özelinde ikisi PLM tarafının standardı gereği çoğunlukla aynıdır, örn.
"FW1"/"FW1"). Bu mantık `src/services/plmThemeAttributeService.js` içinde ve ileride
başka bir Tema özelliği (örn. Cluster, Urun_Sinifi) gerekirse aynı fonksiyon farklı
`attributeName` ile tekrar kullanılabilir.

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
- [x] `ref_marka` / `ref_alt_kategori` / `ref_segment` / `ref_lifestyle_grup` / `ref_sezon` / `ref_alt_sezon` listelerinin PLM'den senkronizasyonu (`POST /api/ref/sync-from-plm`)
- [ ] PLM widget'ının `/api/parameters/resolve` endpoint'ine bağlanması (Swagger dokümantasyonu PLM'e tanıtılacak)
