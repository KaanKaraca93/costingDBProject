const express = require('express');
const router = express.Router();
const refService = require('../services/refService');

router.get('/ref/marka', async (req, res) => {
  try {
    res.json(await refService.listMarka());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ref/alt-kategori', async (req, res) => {
  try {
    res.json(await refService.listAltKategori());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ref/segment', async (req, res) => {
  try {
    res.json(await refService.listSegment());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
