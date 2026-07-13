const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ipekyol Costing DB API',
      version: '1.0.0',
      description: `
### Maliyet Parametreleri (MU / Sarf) Yönetim API'si

PLM "Target Cost Calculator" widget'ının kullandığı Marka / Alt Kategori / Segment /
LifeStyle Grubu / Sezon / Alt Sezon kırılımına göre MU ve Sarf parametrelerini yönetir.

**Widget entegrasyonu için önemli endpoint:** \`GET /api/parameters/resolve\` — bu uç
token gerektirmez, doğrudan PLM widget'ından çağrılabilir.

**Referans veri senkronizasyonu:** \`POST /api/ref/sync-from-plm\` — Marka/Alt Kategori/
Segment/LifeStyle Grubu/Sezon isim listelerini PLM GenericLookUpAll servisinden, Alt Sezon'u
ise PLM Theme_Attributes entity'sinin sabit valueset'inden çeker.
      `,
      contact: {
        name: 'Ipekyol PLM Team'
      }
    },
    servers: [
      {
        url: 'https://costingdb-8538ae5b78bc.herokuapp.com',
        description: 'Production Server (Heroku)'
      },
      {
        url: 'http://localhost:3000',
        description: 'Development Server'
      }
    ],
    tags: [
      { name: 'Parametreler', description: 'MU/Sarf kırılım kayıtları (CRUD) ve PLM çözümleme uç noktası' },
      { name: 'Ön Adet Parametreleri', description: 'Marka/Bölüm/Alt Kategori/Cluster/LifeStyle Grubu/Sezon/Alt Sezon kırılımına göre Adet kayıtları (CRUD)' },
      { name: 'Option Plan Parametreleri', description: 'RangeSayac v6.2 plan kaynağı (opsiyon placeholder listesi). CRUD + Excel + ?format=plan ile RangeSayacv6_2.xlsx kolon adları' },
      { name: 'Range Plan Parametreleri', description: 'RangeSayac v7.2 plan kaynağı (range detay/dropdown planı). CRUD + Excel + ?format=plan ile Rangesayacv7_2.xlsx kolon adları' },
      { name: 'Referans Veriler', description: 'Dropdown isim listeleri ve PLM senkronizasyonu' },
      { name: 'Ayarlar', description: 'Kırılıma bağlı olmayan global ayarlar (kdv_orani vb.)' },
      { name: 'Token', description: 'PLM/ION OAuth2.0 token yönetimi (tanı/entegrasyon amaçlı)' }
    ],
    components: {
      schemas: {
        ParameterInput: {
          type: 'object',
          required: ['markaId', 'altKategoriId', 'segmentId', 'lifestyleGrupId', 'sezonId', 'altSezonCode', 'mu', 'sarf'],
          properties: {
            markaId: { type: 'integer', example: 4 },
            altKategoriId: { type: 'integer', example: 100 },
            segmentId: { type: 'integer', example: 3 },
            lifestyleGrupId: { type: 'integer', example: 8 },
            sezonId: { type: 'integer', example: 12 },
            altSezonCode: { type: 'string', example: 'FW1' },
            mu: { type: 'number', example: 4.94 },
            sarf: { type: 'number', example: 1.5 }
          }
        },
        OnAdetParameterInput: {
          type: 'object',
          required: ['markaId', 'bolumId', 'kategoriId', 'altKategoriId', 'clusterCode', 'lifestyleGrupId', 'sezonId', 'altSezonCode', 'adet'],
          properties: {
            markaId: { type: 'integer', example: 4 },
            bolumId: { type: 'integer', example: 6 },
            kategoriId: { type: 'integer', example: 20 },
            altKategoriId: { type: 'integer', example: 56 },
            clusterCode: { type: 'string', example: '013' },
            lifestyleGrupId: { type: 'integer', example: 8 },
            sezonId: { type: 'integer', example: 12 },
            altSezonCode: { type: 'string', example: 'FW1' },
            adet: { type: 'integer', example: 250 }
          }
        },
        TokenResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            accessToken: { type: 'string', example: 'eyJraWQiOiJrZzpjZDU0...' },
            tokenType: { type: 'string', example: 'Bearer' },
            expiresAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerJsdoc(options);
