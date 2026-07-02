const express = require('express');
const router = express.Router();
const parameterService = require('../services/parameterService');
const refService = require('../services/refService');

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
 * PLM widget entegrasyonu için: verilen kırılıma ait MU/Sarf'ı döner.
 * Eşleşme bulunamazsa spec Bölüm 6'daki fallback davranışını uygular.
 * GET /api/parameters/resolve?marka=4&altKategori=102&segment=3&lifestyleGrup=8
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
