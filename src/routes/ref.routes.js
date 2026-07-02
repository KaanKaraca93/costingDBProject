const express = require('express');
const router = express.Router();
const refService = require('../services/refService');
const plmLookupService = require('../services/plmLookupService');

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
 *     summary: Marka/Alt Kategori/Segment/LifeStyle Grubu listelerini PLM'den senkronize eder
 *     description: >
 *       PLM'deki GenericLookUpAll (odata2) servisinden GlrefId=1 (Marka), 69 (Alt Kategori),
 *       232 (Segment), 227 (LifeStyle Grubu) filtreleriyle veri çeker. Her kaydın GlValId
 *       alanı DB'deki ID olarak, varsa tr-tr çevirisi yoksa kök Name alanı gösterim ismi
 *       olarak yerel ref_* tablolarına upsert edilir. PLM'de artık dönmeyen eski kayıtlar
 *       silinmez.
 *     tags: [Referans Veriler]
 *     responses:
 *       200:
 *         description: Senkronizasyon özeti (her tip için işlenen kayıt sayısı)
 *       500:
 *         description: PLM'e bağlanılamadı veya senkronizasyon hatası
 */
router.post('/ref/sync-from-plm', async (req, res) => {
  try {
    const lookups = await plmLookupService.fetchAllLookups();
    const result = await refService.syncRefTablesFromPlm(lookups);
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
