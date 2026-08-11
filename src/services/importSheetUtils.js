/**
 * Excel içe aktarma akışlarının ortak parçaları.
 *
 * Şablonlarda artık ilk kolon "ID"dir (tablo birincil anahtarı). Amaç: kullanıcı
 * şablonu indirip düzenleyip geri yüklediğinde satırın hangi kayıt olduğu
 * kırılım kolonlarından tahmin edilmeye çalışılmasın. Böylece bir satırın
 * kırılımı (Marka/Sezon/...) Excel'den değiştirilebilir ve kopya satır
 * oluşmadan aynı kayıt güncellenir.
 *
 * ID kolonunun yorumu (bkz. interpretIdCell):
 *   boş            -> yeni kayıt (ya da doğal anahtar eşleşirse o kayıt güncellenir)
 *   dolu + DB'de var -> o kayıt güncellenir
 *   dolu + DB'de yok -> UYARI; verilen ID yok sayılır, satır yeni kayıt olarak
 *                       eklenir ve ID'yi veritabanı sırasıyla kendisi verir
 *                       (kullanıcının uydurduğu ID seriyi bozmaz)
 */

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

// Tüm şablonların ilk kolonu. width küçük; kullanıcı doldurmaz, sadece okur.
const ID_COLUMN = { key: 'id', header: 'ID', width: 10, kind: 'id' };

const ID_HEADER_NOTE =
  'Bu kolonu değiştirmeyin. Dolu satırlar mevcut kaydı günceller, ' +
  'boş satırlar yeni kayıt olarak eklenir (ID otomatik verilir).';

function cellText(rawValue) {
  if (rawValue == null) return '';
  if (typeof rawValue === 'object') {
    if (rawValue.text != null) return String(rawValue.text).trim();
    if (rawValue.result != null) return String(rawValue.result).trim();
    if (Array.isArray(rawValue.richText)) return rawValue.richText.map((t) => t.text).join('').trim();
  }
  return String(rawValue).trim();
}

/**
 * Kolonların gerçek konumunu başlık satırındaki adlardan çözer.
 *
 * ID kolonu sonradan eklendiği için elde daha önce indirilmiş (ID'siz) şablonlar
 * olabilir; sabit konumla okunursa tüm kolonlar bir kayar ve veri bozulur. Bu
 * yüzden eşleştirme başlık adına göre yapılır:
 *   - başlığı bulunan kolon  -> gerçek konumu
 *   - bulunamayan kolon      -> null (o dosyada yok, boş okunur)
 *   - hiçbir başlık tanınmadıysa -> tanımdaki sıraya göre konumsal geri düşüş
 */
function resolveColumnPositions(sheet, columnDefs) {
  const byHeader = new Map();
  const headerRow = sheet.getRow(1);
  if (headerRow) {
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = norm(cellText(cell.value));
      if (key && !byHeader.has(key)) byHeader.set(key, colNumber);
    });
  }

  const positions = {};
  let matched = 0;
  for (const col of columnDefs) {
    const found = byHeader.get(norm(col.header));
    if (found) {
      positions[col.key] = found;
      matched++;
    } else {
      positions[col.key] = null;
    }
  }

  if (matched === 0) {
    columnDefs.forEach((col, idx) => { positions[col.key] = idx + 1; });
  }
  return positions;
}

/** Satırı, çözümlenmiş kolon konumlarına göre {kolonKey: metin} olarak okur. */
function readRowTexts(row, columnDefs, positions) {
  const values = row.values;
  const texts = {};
  for (const col of columnDefs) {
    const pos = positions[col.key];
    texts[col.key] = pos ? cellText(values[pos]) : '';
  }
  return texts;
}

/**
 * ID hücresini yorumlar.
 * @param {string} text        hücre metni
 * @param {Set<number>} existingIds  DB'deki mevcut id'ler
 * @param {Map<number,number>} seenIds  dosyada görülen id -> satır no (mutasyona uğrar)
 * @param {number} rowNumber
 * @returns {{id: number|null, error?: string, warning?: string}}
 */
function interpretIdCell(text, existingIds, seenIds, rowNumber) {
  if (!text) return { id: null };

  const num = Number(text);
  if (!Number.isInteger(num) || num <= 0) {
    return { id: null, error: `ID pozitif tam sayı olmalıdır: "${text}"` };
  }
  if (seenIds.has(num)) {
    return { id: null, error: `ID ${num} şablonda ${seenIds.get(num)}. satırla tekrar ediyor.` };
  }
  if (!existingIds.has(num)) {
    // Verilen ID kullanılmaz (seriyi bozmasın). Satır, ID'siz bir satır gibi
    // işlenir: kırılımı mevcut bir kayda denk geliyorsa o kayıt güncellenir,
    // aksi halde yeni kayıt olarak eklenir ve ID'yi veritabanı sırayla verir.
    return {
      id: null,
      warning: `ID ${num} veritabanında bulunamadı, yok sayıldı. Verilen ID kullanılmayacak; yeni kayıt eklenirse ID'yi sistem sırayla verir.`
    };
  }

  seenIds.set(num, rowNumber);
  return { id: num };
}

/** Şablondaki ID kolonuna başlık notu + hücre biçimi uygular. */
function decorateIdColumn(sheet, colLetter, lastRow) {
  const header = sheet.getCell(`${colLetter}1`);
  header.note = ID_HEADER_NOTE;
  for (let rowNum = 2; rowNum <= lastRow; rowNum++) {
    const cell = sheet.getCell(`${colLetter}${rowNum}`);
    cell.font = { color: { argb: 'FF808080' } };
    cell.dataValidation = {
      type: 'whole',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Geçersiz ID',
      error: 'ID kolonunu elle doldurmayın. Yeni satırlar için boş bırakın.'
    };
  }
}

/**
 * ID ile gelen bir satır başka bir kaydın kırılımına taşınmışsa UNIQUE kısıt
 * ihlal olur. Ancak o kayıt da aynı dosyada başka bir kırılıma taşınıyorsa
 * kırılım boşalıyordur ve çakışma yoktur (ör. iki satırın kırılımını takas
 * etmek). Bu yüzden karar tüm satırlar okunduktan sonra verilir.
 *
 * Satırlarda `_fileKey` (satırın yeni kırılımı) ve `_conflictOwnerId` (o
 * kırılımın DB'deki mevcut sahibi) geçici alanları beklenir; bu alanlar
 * temizlenerek döndürülür.
 */
function resolveKeyConflicts(results) {
  const newKeyById = new Map();
  for (const r of results) {
    if (r.targetId != null && r._fileKey) newKeyById.set(Number(r.targetId), r._fileKey);
  }

  for (const r of results) {
    const ownerId = r._conflictOwnerId;
    const fileKey = r._fileKey;
    delete r._conflictOwnerId;
    delete r._fileKey;
    if (ownerId == null || r.status !== 'ok') continue;

    // Sahibi kayıt bu dosyada başka bir kırılıma taşınıyorsa kırılım boşalıyor.
    const ownerNewKey = newKeyById.get(Number(ownerId));
    if (ownerNewKey !== undefined && ownerNewKey !== fileKey) continue;

    r.errors.push(`Bu kırılım ID ${ownerId} numaralı kayıtta zaten var; ID ${r.targetId} bu kırılıma taşınamaz.`);
    r.status = 'error';
    r.action = null;
    r.targetId = null;
    r.resolved = null;
  }
  return results;
}

/** Özet sayaçları (uyarı sayısı dahil) üretir. */
function summarize(results) {
  return {
    totalRows: results.length,
    validCount: results.filter((r) => r.status === 'ok').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    warningCount: results.filter((r) => (r.warnings || []).length > 0).length,
    rows: results
  };
}

module.exports = {
  ID_COLUMN,
  ID_HEADER_NOTE,
  norm,
  cellText,
  resolveColumnPositions,
  readRowTexts,
  interpretIdCell,
  decorateIdColumn,
  resolveKeyConflicts,
  summarize
};
