const express = require('express');
const router = express.Router();
const refService = require('../services/refService');
const plmLookupService = require('../services/plmLookupService');
const plmThemeAttributeService = require('../services/plmThemeAttributeService');

/**
 * @swagger
 * /api/ref/marka:
 *   get:
 *     summary: Marka listesi
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/marka', async (req, res) => {
  try {
    res.json(await refService.listMarka());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/alt-kategori:
 *   get:
 *     summary: Alt kategori listesi
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/alt-kategori', async (req, res) => {
  try {
    res.json(await refService.listAltKategori());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/segment:
 *   get:
 *     summary: Segment listesi
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/segment', async (req, res) => {
  try {
    res.json(await refService.listSegment());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/lifestyle-grup:
 *   get:
 *     summary: LifeStyle grubu listesi
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/lifestyle-grup', async (req, res) => {
  try {
    res.json(await refService.listLifestyleGrup());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/sezon:
 *   get:
 *     summary: Sezon listesi (PLM GLrefId 58)
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/sezon', async (req, res) => {
  try {
    res.json(await refService.listSezon());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/alt-sezon:
 *   get:
 *     summary: Alt Sezon listesi (PLM Theme_Attributes entity'sinin Alt_Sezon valueset'i)
 *     description: >
 *       Bu liste bir GenericLookUpAll lookup'ı değildir; PLM'nin Theme_Attributes entity
 *       tanımındaki sabit bir değer kümesidir. Anahtar (kod) metindir (örn. "FW1", "SS2").
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/alt-sezon', async (req, res) => {
  try {
    res.json(await refService.listAltSezon());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/bolum:
 *   get:
 *     summary: Bölüm listesi (PLM GLrefId 90) — Ön Adet Parametreleri için
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/bolum', async (req, res) => {
  try {
    res.json(await refService.listBolum());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/cluster:
 *   get:
 *     summary: Cluster listesi (PLM Theme_Attributes entity'sinin Cluster valueset'i) — Ön Adet Parametreleri için
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/cluster', async (req, res) => {
  try {
    res.json(await refService.listCluster());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/kategori:
 *   get:
 *     summary: Kategori listesi (PLM SubCategory, GLrefId 65) — Ön Adet Parametreleri için
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/kategori', async (req, res) => {
  try {
    res.json(await refService.listKategori());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/fashion-pyramid:
 *   get:
 *     summary: Fashion Pyramid listesi (PLM GLrefId 224 / CUD1) — Option Plan için
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/fashion-pyramid', async (req, res) => {
  try {
    res.json(await refService.listFashionPyramid());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/koleksiyon-tipi:
 *   get:
 *     summary: Koleksiyon Tipi listesi (PLM GLrefId 228 / CUD5, Excel'de "FT") — Option Plan için
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/koleksiyon-tipi', async (req, res) => {
  try {
    res.json(await refService.listKoleksiyonTipi());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/ext-field-dropdown:
 *   get:
 *     summary: >
 *       Range Detayı değerleri (PLM ExtendedFieldDropDown) — Range Plan için.
 *       ext_fld_dropdown_id (DropDownValue) DB anahtarıdır; ext_fld_id hangi
 *       Range'e ait olduğunu belirtir; ad ön yüzde gösterilir.
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/ext-field-dropdown', async (req, res) => {
  try {
    res.json(await refService.listExtFieldDropDown());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/range-fields:
 *   get:
 *     summary: Range Plan için sabit tanımlar (Range<->ExtFldId eşleşmesi, RangeTag ve Life Style Grup listeleri)
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/ref/range-fields', (req, res) => {
  const { RANGE_FIELDS, RANGE_TAGS, RANGE_LIFESTYLE_GROUPS } = require('../config/rangeFields');
  res.json({ ranges: RANGE_FIELDS, rangeTags: RANGE_TAGS, lifeStyleGroups: RANGE_LIFESTYLE_GROUPS });
});

router.post('/ref/alt-kategori', async (req, res) => {
  try {
    const { altKategoriId, ad } = req.body;
    if (!altKategoriId || !ad) {
      return res.status(400).json({ error: 'altKategoriId ve ad zorunludur.' });
    }
    await refService.upsertAltKategori(altKategoriId, ad);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/ref/sync-from-plm:
 *   post:
 *     summary: Marka/Alt Kategori/Segment/LifeStyle Grubu/Sezon/Alt Sezon listelerini PLM'den senkronize eder
 *     description: >
 *       Marka(1)/Alt Kategori(69)/Segment(232)/LifeStyle Grubu(227)/Sezon(58) PLM'deki
 *       GenericLookUpAll (odata2) servisinden GlrefId filtreleriyle çekilir (GlValId DB
 *       anahtarı, varsa tr-tr çevirisi yoksa kök Name gösterim ismidir). Alt Sezon ise bir
 *       lookup değil, PLM'nin Theme_Attributes entity tanımındaki Alt_Sezon alanının sabit
 *       valueset'inden (IDM datamodel API) çekilir; anahtar metindir (örn. "FW1"). PLM'de
 *       artık dönmeyen eski kayıtlar silinmez.
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Senkronizasyon özeti (her tip için işlenen kayıt sayısı)
 *       500:
 *         description: PLM'e bağlanılamadı veya senkronizasyon hatası
 */
router.post('/ref/sync-from-plm', async (req, res) => {
  try {
    const [lookups, altSezon, cluster, extFieldDropDown] = await Promise.all([
      plmLookupService.fetchAllLookups(),
      plmThemeAttributeService.fetchAltSezonValueset(),
      plmThemeAttributeService.fetchClusterValueset(),
      plmLookupService.fetchExtendedFieldDropDown()
    ]);
    const result = await refService.syncRefTablesFromPlm({ ...lookups, altSezon, cluster });
    result.extFieldDropDown = await refService.upsertExtFieldDropDown(extFieldDropDown);
    res.json({ success: true, synced: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Genel ayarları listeler (örn. kdv_orani)
 *     tags: [Ayarlar]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/settings', async (req, res) => {
  try {
    res.json(await refService.listSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'value zorunludur.' });
    }
    await refService.setSetting(req.params.key, String(value));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
