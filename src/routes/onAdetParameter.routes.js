const express = require('express');
const router = express.Router();
const onAdetParameterService = require('../services/onAdetParameterService');
const importExportService = require('../services/onAdetImportExportService');

function validateBody(body) {
  const { markaId, bolumId, kategoriId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode, adet } = body;
  if ([markaId, bolumId, kategoriId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode, adet].some((v) => v === undefined || v === null || v === '')) {
    return 'markaId, bolumId, kategoriId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode ve adet zorunludur.';
  }
  if (!Number.isInteger(Number(adet))) {
    return 'adet tam sayı olmalıdır.';
  }
  return null;
}

/**
 * @swagger
 * /api/on-adet-parametreleri:
 *   get:
 *     summary: Ön Adet parametre listesi (opsiyonel filtreli)
 *     tags: [Ön Adet Parametreleri]
 *     responses:
 *       200:
 *         description: Başarılı
 */
router.get('/on-adet-parametreleri', async (req, res) => {
  try {
    const { markaId, bolumId, kategoriId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode } = req.query;
    const rows = await onAdetParameterService.listParameters({ markaId, bolumId, kategoriId, altKategoriId, clusterCode, lifestyleGrupId, sezonId, altSezonCode });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/on-adet-parametreleri/template', async (req, res) => {
  try {
    const workbook = await importExportService.buildTemplateWorkbookFromDb();
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `on_adet_parametreleri_sablonu_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (req.query.format === 'base64') {
      return res.json({ filename, contentBase64: Buffer.from(buffer).toString('base64') });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/on-adet-parametreleri/import/validate', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'fileBase64 zorunludur.' });
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    const result = await importExportService.parseAndValidateWorkbookBuffer(buffer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Excel dosyası okunamadı: ' + err.message });
  }
});

router.post('/on-adet-parametreleri/import/commit', async (req, res) => {
  try {
    const { rows, updatedBy } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'İçe aktarılacak satır bulunamadı.' });
    }

    let inserted = 0;
    let updated = 0;
    const failed = [];

    for (const row of rows) {
      try {
        const error = validateBody(row);
        if (error) throw new Error(error);
        const result = await onAdetParameterService.upsertParameter(row, updatedBy);
        if (result.inserted) inserted++; else updated++;
      } catch (err) {
        failed.push({ row, error: err.message });
      }
    }

    res.json({ success: failed.length === 0, inserted, updated, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/on-adet-parametreleri/:id', async (req, res) => {
  try {
    const row = await onAdetParameterService.getParameterById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/on-adet-parametreleri:
 *   post:
 *     summary: Yeni Ön Adet parametre kaydı oluşturur
 *     tags: [Ön Adet Parametreleri]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnAdetParameterInput'
 *     responses:
 *       201: { description: Oluşturuldu }
 *       409: { description: Bu kombinasyon zaten mevcut }
 */
router.post('/on-adet-parametreleri', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const existing = await onAdetParameterService.findByKey(req.body);
    if (existing) {
      return res.status(409).json({ error: 'Bu marka/bölüm/kategori/alt kategori/cluster/lifestyle grup/sezon/alt sezon kombinasyonu zaten mevcut.', existingId: existing.id });
    }

    const created = await onAdetParameterService.createParameter(req.body, req.body.updatedBy);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/on-adet-parametreleri/:id', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const updated = await onAdetParameterService.updateParameter(req.params.id, req.body, req.body.updatedBy);
    if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/on-adet-parametreleri/:id', async (req, res) => {
  try {
    const deleted = await onAdetParameterService.deleteParameter(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
