/**
 * Tema Plan verisinin BİR KERELİK içe aktarımı.
 *
 * IpekyolRangeSayac projesindeki RangeSayacv3_yeni_taslakv2.xlsx dosyasını okur
 * ve theme_plan_parametreleri tablosuna yazar. Excel kolon adları birebir
 * korunur; ID'ler zaten Excel'de mevcut olduğu için PLM çözümlemesi gerekmez.
 *
 * Kullanım:
 *   DATABASE_URL=... node scripts/import-tema-plan.js <excel-yolu> [--kuru]
 *
 *   --kuru   Hiçbir şey yazmaz; ne olacağını raporlar.
 *
 * Tekrar çalıştırılabilir: kayıtlar kırılıma göre upsert edilir
 * (theme_id + sub_category_id + season_id + alt_sezon), kopya oluşmaz.
 */
require('dotenv').config();

const path = require('path');
const ExcelJS = require('exceljs');
const service = require('../src/services/themePlanParameterService');
const { cellText } = require('../src/services/importSheetUtils');
const pool = require('../src/config/db');

const args = process.argv.slice(2);
const kuru = args.includes('--kuru');
const excelPath = args.find((a) => !a.startsWith('--'));

if (!excelPath) {
  console.error('Kullanım: node scripts/import-tema-plan.js <excel-yolu> [--kuru]');
  process.exit(1);
}

// Excel kolonu -> DB kolonu. Excel'de boş "Opt Say" planlanmamış kırılım demektir (0).
function toDbRow(r) {
  const themeId = r['ThemeId'];
  const optSay = r['Opt Say'];
  return {
    marka: r['MARKA'] ?? null,
    brand_id: r['BrandId'] ?? null,
    season_id: r['SeasonId'] ?? null,
    free_field_three: r['FreeFieldThree'] ?? null,
    tema_adi: r['Tema Adı'] ?? null,
    theme_id: (themeId === undefined || themeId === '' || Number(themeId) <= 0) ? null : Number(themeId),
    kategori: r['Kategori'] ?? null,
    sub_category_id: r['SubCategoryId'] ?? null,
    alt_sezon: r['Alt_Sezon'] ?? null,
    opt_say: (optSay === undefined || optSay === '') ? 0 : Number(optSay)
  };
}

/**
 * Excel'i başlık adlarına göre okur (kolon sırasına güvenmez).
 * Boş hücreler undefined döner — böylece "Opt Say" boşluğu 0'a çevrilebilir.
 */
async function readExcelRows(abs) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(abs);
  const sheet = workbook.getWorksheet('Sayfa1') || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel dosyasında sayfa bulunamadı.');

  const headers = {};
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const h = cellText(cell.value);
    if (h) headers[colNumber] = h;
  });

  const sayisal = new Set(['BrandId', 'SeasonId', 'ThemeId', 'SubCategoryId', 'Opt Say']);
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let dolu = false;
    for (const [colNumber, header] of Object.entries(headers)) {
      const text = cellText(row.values[colNumber]);
      if (text === '') continue;
      obj[header] = sayisal.has(header) ? Number(text) : text;
      dolu = true;
    }
    if (dolu) rows.push(obj);
  });
  return rows;
}

async function main() {
  const abs = path.resolve(excelPath);
  const excelRows = await readExcelRows(abs);

  console.log(`📄 ${path.basename(abs)}: ${excelRows.length} satır okundu`);

  const rows = excelRows.map(toDbRow);

  // Zorunlu alan kontrolü (DB'ye gitmeden önce)
  const gecersiz = rows
    .map((r, i) => ({ r, satir: i + 2 }))
    .filter(({ r }) => r.brand_id == null || r.sub_category_id == null || r.season_id == null);
  if (gecersiz.length) {
    console.error(`❌ ${gecersiz.length} satırda BrandId/SubCategoryId/SeasonId eksik. İlk 5:`);
    gecersiz.slice(0, 5).forEach(({ satir }) => console.error(`   Excel satır ${satir}`));
    process.exitCode = 1;
    return;
  }

  const toplamOpt = rows.reduce((s, r) => s + r.opt_say, 0);
  const temaSayisi = new Set(rows.map((r) => r.theme_id).filter(Boolean)).size;
  console.log(`   ${temaSayisi} benzersiz tema, toplam Opt Say = ${toplamOpt}`);

  if (kuru) {
    console.log('\n🧪 Kuru çalışma — hiçbir şey yazılmadı.');
    console.log('   İlk 2 satır:');
    rows.slice(0, 2).forEach((r) => console.log('   ', JSON.stringify(r)));
    return;
  }

  let eklenen = 0;
  let guncellenen = 0;
  const hatalar = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const sonuc = await service.upsertParameter(rows[i], 'import-tema-plan');
      if (sonuc.inserted) eklenen++; else guncellenen++;
    } catch (err) {
      hatalar.push({ satir: i + 2, error: err.message });
    }
  }

  console.log(`\n✅ Eklenen: ${eklenen} | Güncellenen: ${guncellenen} | Hatalı: ${hatalar.length}`);
  if (hatalar.length) {
    console.log('İlk 5 hata:');
    hatalar.slice(0, 5).forEach((h) => console.log(`   Excel satır ${h.satir}: ${h.error}`));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('❌ İçe aktarma hatası:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
