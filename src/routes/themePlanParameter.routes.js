const express = require('express');
const router = express.Router();
const service = require('../services/themePlanParameterService');
const importExportService = require('../services/themePlanImportExportService');
const { describeDbError } = require('../services/dbErrors');

function f(body, camel, snake) {
  const v = body[camel] !== undefined ? body[camel] : body[snake];
  return v === undefined || v === '' ? null : v;
}

function validateBody(body) {
  const required = [
    ['brandId', 'brand_id'], ['subCategoryId', 'sub_category_id'], ['seasonId', 'season_id']
  ];
  for (const [camel, snake] of required) {
    if (f(body, camel, snake) == null) {
      return 'brandId, subCategoryId ve seasonId zorunludur.';
    }
  }
  const ints = [['brandId', 'brand_id'], ['subCategoryId', 'sub_category_id'], ['seasonId', 'season_id']];
  for (const [camel, snake] of ints) {
    if (!Number.isInteger(Number(f(body, camel, snake)))) return `${camel} tam sayı olmalıdır.`;
  }
  // themeId opsiyoneldir (tema henüz açılmamış olabilir) ama verildiyse tam sayı olmalı.
  const themeId = f(body, 'themeId', 'theme_id');
  if (themeId != null && !Number.isInteger(Number(themeId))) return 'themeId tam sayı olmalıdır.';
  const optSay = f(body, 'optSay', 'opt_say');
  if (optSay != null && (!Number.isInteger(Number(optSay)) || Number(optSay) < 0)) {
    return 'optSay 0 veya üzeri tam sayı olmalıdır.';
  }
  return null;
}

/**
 * @swagger
 * /api/theme-plan-parametreleri:
 *   get:
 *     summary: >
 *       Tema Plan parametre listesi (IpekyolRangeSayac "theme-category" plan
 *       kaynağı). ?format=plan => RangeSayacv3_yeni_taslakv2.xlsx kolon adlarıyla.
 *     tags: [Tema Plan Parametreleri]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [plan] }
 *         description: "plan verilirse Excel kolon adlarıyla düz liste döner."
 *       - in: query
 *         name: brandId
 *         schema: { type: integer }
 *       - in: query
 *         name: seasonId
 *         schema: { type: integer }
 *       - in: query
 *         name: altSezon
 *         schema: { type: string }
 *       - in: query
 *         name: themeId
 *         schema: { type: integer }
 *       - in: query
 *         name: subCategoryId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Başarılı }
 */
router.get('/theme-plan-parametreleri', async (req, res) => {
  try {
    const { brandId, seasonId, altSezon, themeId, subCategoryId, format } = req.query;
    const filters = { brandId, seasonId, altSezon, themeId, subCategoryId };
    if (format === 'plan') {
      return res.json(await service.listPlan(filters));
    }
    res.json(await service.listParameters(filters));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/theme-plan-parametreleri/template:
 *   get:
 *     summary: Tema Plan Excel şablonunu indirir (mevcut kayıtlar dolu gelir).
 *     tags: [Tema Plan Parametreleri]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [base64] }
 *         description: "base64 verilirse dosya JSON içinde base64 olarak döner (widget için)."
 *     responses:
 *       200: { description: Başarılı }
 */
router.get('/theme-plan-parametreleri/template', async (req, res) => {
  try {
    const workbook = await importExportService.buildTemplateWorkbookFromDb();
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `tema_plan_parametreleri_sablonu_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

/**
 * @swagger
 * /api/theme-plan-parametreleri/import/validate:
 *   post:
 *     summary: Yüklenen Excel'i doğrular ve satır bazlı önizleme döner (DB'ye yazmaz).
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       200: { description: Başarılı }
 */
router.post('/theme-plan-parametreleri/import/validate', async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 zorunludur.' });
    const buffer = Buffer.from(fileBase64, 'base64');
    res.json(await importExportService.parseAndValidateWorkbookBuffer(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Excel dosyası okunamadı: ' + err.message });
  }
});

/**
 * @swagger
 * /api/theme-plan-parametreleri/import/commit:
 *   post:
 *     summary: Doğrulanmış satırları DB'ye yazar (ID varsa günceller, yoksa kırılıma göre upsert).
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       200: { description: Başarılı }
 */
router.post('/theme-plan-parametreleri/import/commit', async (req, res) => {
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

        // ID gelmişse o kayıt güncellenir (kırılım dahil tüm kolonlar). ID yoksa
        // kırılıma göre upsert edilir — ID kolonu olmayan eski şablonlar da
        // böylece çalışmaya devam eder.
        const id = row.id === undefined || row.id === null || row.id === '' ? null : Number(row.id);
        if (id != null) {
          const updatedRow = await service.updateParameter(id, row, updatedBy);
          if (updatedRow) { updated++; continue; }
          // Kayıt doğrulama ile commit arasında silinmiş: yeni kayıt olarak ekle.
        }
        const result = await service.upsertParameter(row, updatedBy);
        if (result.inserted) inserted++; else updated++;
      } catch (err) {
        failed.push({ row, error: describeDbError(err) });
      }
    }
    res.json({ success: failed.length === 0, inserted, updated, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/theme-plan-parametreleri/{id}:
 *   get:
 *     summary: Tek bir Tema Plan kaydını döner.
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       200: { description: Başarılı }
 *       404: { description: Kayıt bulunamadı }
 */
router.get('/theme-plan-parametreleri/:id', async (req, res) => {
  try {
    const row = await service.getParameterById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/theme-plan-parametreleri:
 *   post:
 *     summary: Yeni Tema Plan kaydı ekler.
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       201: { description: Oluşturuldu }
 *       409: { description: Bu kırılım zaten mevcut }
 */
router.post('/theme-plan-parametreleri', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });
    const existing = await service.findByKey(req.body);
    if (existing) {
      return res.status(409).json({
        error: 'Bu kırılım (tema/kategori/sezon/alt sezon) zaten mevcut.',
        existingId: existing.id
      });
    }
    const created = await service.createParameter(req.body, f(req.body, 'updatedBy', 'updated_by'));
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bu kırılım zaten mevcut.' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/theme-plan-parametreleri/{id}:
 *   put:
 *     summary: Tema Plan kaydını günceller.
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       200: { description: Güncellendi }
 *       404: { description: Kayıt bulunamadı }
 */
router.put('/theme-plan-parametreleri/:id', async (req, res) => {
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

/**
 * @swagger
 * /api/theme-plan-parametreleri/{id}:
 *   delete:
 *     summary: Tema Plan kaydını siler.
 *     tags: [Tema Plan Parametreleri]
 *     responses:
 *       200: { description: Silindi }
 *       404: { description: Kayıt bulunamadı }
 */
router.delete('/theme-plan-parametreleri/:id', async (req, res) => {
  try {
    const deleted = await service.deleteParameter(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
