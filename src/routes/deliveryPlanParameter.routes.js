const express = require('express');
const router = express.Router();
const service = require('../services/deliveryPlanParameterService');
const importExportService = require('../services/deliveryPlanImportExportService');
const { describeDbError } = require('../services/dbErrors');
const { gerceklesenTedarikKaynagiId } = require('../config/tedarikKaynagi');

function validateBody(body) {
  const { markaId, divisionId, sezonId, altSezonCode, deliveryId, optionSay } = body;
  if ([markaId, divisionId, sezonId, altSezonCode, deliveryId, optionSay].some((v) => v === undefined || v === null || v === '')) {
    return 'markaId, divisionId, sezonId, altSezonCode, deliveryId ve optionSay zorunludur.';
  }
  for (const [name, v] of [['markaId', markaId], ['divisionId', divisionId], ['sezonId', sezonId], ['deliveryId', deliveryId]]) {
    if (!Number.isInteger(Number(v))) return `${name} tam sayı olmalıdır.`;
  }
  const n = Number(optionSay);
  if (!Number.isInteger(n) || n < 0) {
    return 'optionSay sıfır veya pozitif tam sayı olmalıdır.';
  }
  if (gerceklesenTedarikKaynagiId(deliveryId) == null) {
    return `Tedarik Kaynağı #${deliveryId} için Gerçekleşen Tedarik Kaynağı eşleşmesi tanımlı değil (src/config/tedarikKaynagi.js).`;
  }
  return null;
}

/**
 * @swagger
 * /api/delivery-plan-parametreleri:
 *   get:
 *     summary: >
 *       Delivery Plan listesi (Marka/Ana Kategori/Sezon/Alt Sezon/Tedarik Kaynağı kırılımında Option Say).
 *       ?format=plan => gerçekleşen widget'ının okuduğu plan çıktısı (BrandId/DivisionId/SeasonId/Alt_Sezon/DeliveryId
 *       + GerceklesenTedarikKaynagiId + isimler + Option Say). DeliveryId Planlanan Tedarik Kaynağı'dır;
 *       GerceklesenTedarikKaynagiId, GerceklesenTedarikSekli extended field'ının dropdown değeridir ve
 *       API tarafından DeliveryId'den türetilir (kullanıcı girmez).
 *     tags: [Delivery Plan Parametreleri]
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [plan] } }
 *       - { in: query, name: markaId, description: 'brandId de kabul edilir', schema: { type: integer } }
 *       - { in: query, name: divisionId, schema: { type: integer } }
 *       - { in: query, name: sezonId, description: 'seasonId de kabul edilir', schema: { type: integer } }
 *       - { in: query, name: altSezonCode, description: 'altSezon da kabul edilir', schema: { type: string } }
 *       - { in: query, name: deliveryId, description: 'Planlanan Tedarik Kaynağı (Deliveries)', schema: { type: integer } }
 *       - { in: query, name: gerceklesenTedarikKaynagiId, description: 'Gerçekleşen Tedarik Kaynağı (GerceklesenTedarikSekli dropdown)', schema: { type: integer } }
 *     responses:
 *       200: { description: Başarılı }
 */
router.get('/delivery-plan-parametreleri', async (req, res) => {
  try {
    const { markaId, brandId, divisionId, sezonId, seasonId, altSezonCode, altSezon, deliveryId, gerceklesenTedarikKaynagiId, format } = req.query;
    const filters = { markaId, brandId, divisionId, sezonId, seasonId, altSezonCode, altSezon, deliveryId, gerceklesenTedarikKaynagiId };
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
 * /api/delivery-plan-parametreleri/template:
 *   get:
 *     summary: Mevcut kayıtlarla dolu, dropdown doğrulamalı Delivery Plan Excel şablonu (?format=base64 ile JSON)
 *     tags: [Delivery Plan Parametreleri]
 *     responses:
 *       200: { description: Başarılı }
 */
router.get('/delivery-plan-parametreleri/template', async (req, res) => {
  try {
    const workbook = await importExportService.buildTemplateWorkbookFromDb();
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `delivery_plan_sablonu_${new Date().toISOString().slice(0, 10)}.xlsx`;

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
 * /api/delivery-plan-parametreleri/import/validate:
 *   post:
 *     summary: "{ fileBase64 } — DB'ye yazmadan satır satır doğrular"
 *     tags: [Delivery Plan Parametreleri]
 *     responses:
 *       200: { description: Doğrulama sonucu }
 */
router.post('/delivery-plan-parametreleri/import/validate', async (req, res) => {
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

/**
 * @swagger
 * /api/delivery-plan-parametreleri/import/commit:
 *   post:
 *     summary: "{ rows, updatedBy } — import/validate'den dönen geçerli satırları yazar"
 *     tags: [Delivery Plan Parametreleri]
 *     responses:
 *       200: { description: Eklenen/güncellenen/başarısız sayıları }
 */
router.post('/delivery-plan-parametreleri/import/commit', async (req, res) => {
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

        // ID gelmişse o kayıt güncellenir (kırılım dahil). ID yoksa kırılıma göre upsert.
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
 * /api/delivery-plan-parametreleri/{id}:
 *   get:
 *     summary: Tek Delivery Plan kaydı
 *     tags: [Delivery Plan Parametreleri]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Başarılı }
 *       404: { description: Kayıt bulunamadı }
 *   put:
 *     summary: Delivery Plan kaydını günceller (kırılım dahil)
 *     tags: [Delivery Plan Parametreleri]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryPlanParameterInput'
 *     responses:
 *       200: { description: Güncellendi }
 *       404: { description: Kayıt bulunamadı }
 *       409: { description: Bu kırılım başka bir kayıtta mevcut }
 *   delete:
 *     summary: Delivery Plan kaydını siler
 *     tags: [Delivery Plan Parametreleri]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Silindi }
 *       404: { description: Kayıt bulunamadı }
 */
router.get('/delivery-plan-parametreleri/:id', async (req, res) => {
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
 * /api/delivery-plan-parametreleri:
 *   post:
 *     summary: Yeni Delivery Plan kaydı oluşturur
 *     tags: [Delivery Plan Parametreleri]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryPlanParameterInput'
 *     responses:
 *       201: { description: Oluşturuldu }
 *       409: { description: Bu kırılım zaten mevcut }
 */
router.post('/delivery-plan-parametreleri', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const existing = await service.findByKey(req.body);
    if (existing) {
      return res.status(409).json({ error: 'Bu marka/ana kategori/sezon/alt sezon/tedarik kaynağı kombinasyonu zaten mevcut.', existingId: existing.id });
    }

    const created = await service.createParameter(req.body, req.body.updatedBy);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/delivery-plan-parametreleri/:id', async (req, res) => {
  try {
    const error = validateBody(req.body);
    if (error) return res.status(400).json({ error });

    const updated = await service.updateParameter(req.params.id, req.body, req.body.updatedBy);
    if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu kombinasyon zaten mevcut.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/delivery-plan-parametreleri/:id', async (req, res) => {
  try {
    const deleted = await service.deleteParameter(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
