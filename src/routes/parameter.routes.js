const express = require('express');
const router = express.Router();
const parameterService = require('../services/parameterService');
const refService = require('../services/refService');

/**
 * @swagger
 * /api/parameters:
 *   get:
 *     summary: Parametre listesi (opsiyonel filtreli)
 *     tags: [Parametreler]
 *     parameters:
 *       - in: query
 *         name: markaId
 *         schema: { type: integer }
 *       - in: query
 *         name: altKategoriId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/parameters', async (req, res) => {
  try {
    const { markaId, altKategoriId } = req.query;
    const rows = await parameterService.listParameters({ markaId, altKategoriId });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/parameters/resolve:
 *   get:
 *     summary: PLM widget entegrasyonu — kırılıma göre MU/Sarf/KDV çözümleme
 *     description: >
 *       Verilen 4'lü kırılım (marka, altKategori, segment, lifestyleGrup) için decision_parameters
 *       tablosunda eşleşme arar. Eşleşme bulunursa oradaki MU/Sarf değerlerini, bulunamazsa
 *       PARAMETER_DB_SPEC.md Bölüm 6'daki fallback kurallarını (lifestyleGrup=2 ise MU=3.15,
 *       aksi halde MU=4.94, Sarf=1.5) uygular. Bu endpoint PLM token gerektirmez, doğrudan
 *       herkese açık bir REST çağrısıdır.
 *     tags: [Parametreler]
 *     parameters:
 *       - in: query
 *         name: marka
 *         required: true
 *         schema: { type: integer }
 *         example: 4
 *       - in: query
 *         name: altKategori
 *         required: true
 *         schema: { type: integer }
 *         example: 100
 *       - in: query
 *         name: segment
 *         required: true
 *         schema: { type: integer }
 *         example: 3
 *       - in: query
 *         name: lifestyleGrup
 *         required: true
 *         schema: { type: integer }
 *         example: 8
 *     responses:
 *       200:
 *         description: Başarılı
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 source: { type: string, enum: [decision_parameters, fallback] }
 *                 mu: { type: number, example: 4.94 }
 *                 sarf: { type: number, example: 1.5 }
 *                 kdvOrani: { type: number, example: 0.10 }
 */
router.get('/parameters/resolve', async (req, res) => {
  try {
    const markaId = Number(req.query.marka);
    const altKategoriId = Number(req.query.altKategori);
    const segmentId = Number(req.query.segment);
    const lifestyleGrupId = Number(req.query.lifestyleGrup);

    const match = await parameterService.findByKey({
      markaId,
      altKategoriId,
      segmentId,
      lifestyleGrupId
    });

    const kdvOrani = Number((await refService.getSetting('kdv_orani')) || '0.10');

    if (match) {
      return res.json({
        source: 'decision_parameters',
        mu: Number(match.mu),
        sarf: Number(match.sarf),
        kdvOrani
      });
    }

    const fallbackMuEssential = Number((await refService.getSetting('fallback_mu_essential')) || '3.15');
    const fallbackMuDefault = Number((await refService.getSetting('fallback_mu_default')) || '4.94');
    const fallbackSarf = Number((await refService.getSetting('fallback_sarf')) || '1.5');

    res.json({
      source: 'fallback',
      mu: lifestyleGrupId === 2 ? fallbackMuEssential : fallbackMuDefault,
      sarf: fallbackSarf,
      kdvOrani
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/parameters/{id}:
 *   get:
 *     summary: Tek bir parametre kaydını getirir
 *     tags: [Parametreler]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Başarılı }
 *       404: { description: Kayıt bulunamadı }
 */
router.get('/parameters/:id', async (req, res) => {
  try {
    const row = await parameterService.getParameterById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateBody(body) {
  const { markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf } = body;
  if ([markaId, altKategoriId, segmentId, lifestyleGrupId, mu, sarf].some((v) => v === undefined || v === null || v === '')) {
    return 'markaId, altKategoriId, segmentId, lifestyleGrupId, mu ve sarf zorunludur.';
  }
  if (Number.isNaN(Number(mu)) || Number.isNaN(Number(sarf))) {
    return 'mu ve sarf sayısal olmalıdır.';
  }
  return null;
}

/**
 * @swagger
 * /api/parameters:
 *   post:
 *     summary: Yeni parametre kaydı oluşturur
 *     tags: [Parametreler]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParameterInput'
 *     responses:
 *       201: { description: Oluşturuldu }
 *       409: { description: Bu kombinasyon zaten mevcut }
 */
router.post('/parameters', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const existing = await parameterService.findByKey(req.body);
    if (existing) {
      return res.status(409).json({ error: 'Bu marka/alt kategori/segment/lifestyle grup kombinasyonu zaten mevcut.', existingId: existing.id });
    }

    const created = await parameterService.createParameter(req.body, req.body.updatedBy);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/parameters/{id}:
 *   put:
 *     summary: Mevcut parametre kaydını günceller
 *     tags: [Parametreler]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParameterInput'
 *     responses:
 *       200: { description: Güncellendi }
 *       404: { description: Kayıt bulunamadı }
 *       409: { description: Bu kombinasyon zaten mevcut }
 */
router.put('/parameters/:id', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const updated = await parameterService.updateParameter(req.params.id, req.body, req.body.updatedBy);
    if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/parameters/{id}:
 *   delete:
 *     summary: Parametre kaydını siler
 *     tags: [Parametreler]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Silindi }
 *       404: { description: Kayıt bulunamadı }
 */
router.delete('/parameters/:id', async (req, res) => {
  try {
    const deleted = await parameterService.deleteParameter(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
