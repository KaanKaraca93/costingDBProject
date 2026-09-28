/**
 * Tedarik Kaynağı eşleşmesi (Delivery Plan).
 *
 * PLM'de tedarik kaynağı iki ayrı alanda tutulur:
 *   Planlanan Tedarik Kaynağı   = Deliveries (GenericLookUpAll GlrefId 76,
 *                                 Style.DeliveryIdList / StyleDeliveries.DeliveryId)
 *   Gerçekleşen Tedarik Kaynağı = Style extended field "GerceklesenTedarikSekli"
 *                                 (dropdown; değer ExtFldDropDownId)
 *
 * Plan kullanıcıdan yalnızca Planlanan (Deliveries) olarak alınır; gerçekleşen
 * karşılığı bu tablodan türetilip plan satırında ayrıca saklanır. Böylece
 * gerçekleşen hesabı iki anahtardan hangisiyle eşleştireceğini seçebilir.
 *
 * Yeni bir Deliveries değeri eklenirse buraya karşılığı da eklenmelidir; eşleşmesi
 * olmayan tedarik kaynağıyla plan kaydı kabul edilmez. schema.sql'deki geri
 * doldurma (backfill) bloğu da bu tabloyla aynı tutulmalıdır.
 */
const GERCEKLESEN_TEDARIK_BY_DELIVERY = {
  1: 133, // LOCAL
  2: 132, // PRODUCTION
  4: 130  // OVERSEAS
};

/** Deliveries id'sinin gerçekleşen karşılığı; tanımlı değilse null. */
function gerceklesenTedarikKaynagiId(deliveryId) {
  const v = GERCEKLESEN_TEDARIK_BY_DELIVERY[Number(deliveryId)];
  return v === undefined ? null : v;
}

module.exports = { GERCEKLESEN_TEDARIK_BY_DELIVERY, gerceklesenTedarikKaynagiId };
