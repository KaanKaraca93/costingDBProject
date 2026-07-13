const express = require('express');
const router = express.Router();
const service = require('../services/rangePlanParameterService');
const importExportService = require('../services/rangePlanImportExportService');

function f(body, camel, snake) {
  const v = body[camel] !== undefined ? body[camel] : body[snake];
  return v === undefined || v === '' ? null : v;
}

function validateBody(body) {
  const required = [
    ['brandId', 'brand_id'], ['subCategoryId', 'sub_category_id'],
    ['extFldId', 'ext_fld_id'], ['dropDownValue', 'drop_down_value'],
    ['seasonId', 'season_id']
  ];
  for (const [camel, snake] of required) {
    if (f(body, camel, snake) == null) {
      return 'brandId, subCategoryId, extFldId, dropDownValue ve seasonId zorunludur.';
    }
  }
  const ints = [['brandId', 'brand_id'], ['subCategoryId', 'sub_category_id'], ['dropDownValue', 'drop_down_value'], ['seasonId', 'season_id']];
  for (const [camel, snake] of ints) {
    if (!Number.isInteger(Number(f(body, camel, snake)))) return `${camel} tam sayı olmalıdır.`;
  }
  return null;
}

/**
 * @swagger
 * /api/range-plan-parametreleri:
 *   get:
 *     summary: Range Plan (v7.2) parametre listesi. ?format=plan => Rangesayacv7_2.xlsx kolon adlarıyla.
 *     tags: [Range Plan Parametreleri]
 *     responses:
 *       200: { description: Başarılı }
 */
router.get('/range-plan-parametreleri', async (req, res) => {
  try {
    const { brandId, subCategoryId, extFldId, seasonId, altSezon, lifeStyleGrup, format } = req.query;
    const filters = { brandId, subCategoryId, extFldId, seasonId, altSezon, lifeStyleGrup };
    if (format === 'plan') {
      return res.json(await service.listPlan(filters));
    }
    res.json(await service.listParameters(filters));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/range-plan-parametreleri/template', async (req, res) => {
  try {
    const workbook = await importExportService.buildTemplateWorkbookFromDb();
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `range_plan_parametreleri_sablonu_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

router.post('/range-plan-parametreleri/import/validate', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 zorunludur.' });
    const buffer = Buffer.from(fileBase64, 'base64');
    res.json(await importExportService.parseAndValidateWorkbookBuffer(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Excel dosyası okunamadı: ' + err.message });
  }
});

router.post('/range-plan-parametreleri/import/commit', async (req, res) => {
  try {
    const { rows, updatedBy } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'İçe aktarılacak satır bulunamadı.' });
    }
    let inserted = 0, updated = 0;
    const failed = [];
    for (const row of rows) {
      try {
        const error = validateBody(row);
        if (error) throw new Error(error);
        const result = await service.upsertParameter(row, updatedBy);
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

router.get('/range-plan-parametreleri/:id', async (req, res) => {
  try {
    const row = await service.getParameterById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/range-plan-parametreleri', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });
    const existing = await service.findByKey(req.body);
    if (existing) {
      return res.status(409).json({ error: 'Bu kırılım (marka/kategori/ExtFldId/DropDownValue/CUD5/sezon/alt sezon/life style grup) zaten mevcut.', existingId: existing.id });
    }
    const created = await service.createParameter(req.body, f(req.body, 'updatedBy', 'updated_by'));
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bu kırılım zaten mevcut.' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/range-plan-parametreleri/:id', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });
    const updated = await service.updateParameter(req.params.id, req.body, f(req.body, 'updatedBy', 'updated_by'));
    if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bu kırılım zaten mevcut.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/range-plan-parametreleri/:id', async (req, res) => {
  try {
    const deleted = await service.deleteParameter(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
