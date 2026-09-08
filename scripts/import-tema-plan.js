/**
 * Tema Plan verisinin BİR KERELİK içe aktarımı.
 *
 * IpekyolRangeSayac projesindeki RangeSayacv3_yeni_taslakv2.xlsx dosyasını okur
 * ve theme_plan_parametreleri tablosuna yazar. Excel kolon adları birebir
 * korunur; ID'ler zaten Excel'de mevcut olduğu için PLM çözümlemesi gerekmez.
 *
 * İki çalışma modu var:
 *
 *   API   (önerilen — veritabanı şifresi gerekmez)
 *     node scripts/import-tema-plan.js <excel> --api https://costingdb-....herokuapp.com
 *     Widget'ın kullandığı /import/commit ucundan gider; satırlar parça parça
 *     gönderilir (Heroku'nun 30 sn istek sınırına takılmamak için).
 *
 *   DB    (doğrudan Postgres)
 *     DATABASE_URL=... node scripts/import-tema-plan.js <excel>
 *
 * Ortak seçenekler:
 *   --kuru        Hiçbir şey yazmaz; ne olacağını raporlar.
 *   --parca <n>   API modunda parça boyutu (varsayılan 50).
 *
 * Tekrar çalıştırılabilir: kayıtlar kırılıma göre upsert edilir
 * (theme_id + sub_category_id + season_id + alt_sezon), kopya oluşmaz.
 */
require('dotenv').config();

const path = require('path');
const ExcelJS = require('exceljs');
const { cellText } = require('../src/services/importSheetUtils');

const args = process.argv.slice(2);
const kuru = args.includes('--kuru');

function secenek(ad) {
  const i = args.indexOf(ad);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

const apiUrl = secenek('--api');
const parcaBoyu = Number(secenek('--parca') || 50);
const excelPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--api' && args[i - 1] !== '--parca');

if (!excelPath) {
  console.error('Kullanım: node scripts/import-tema-plan.js <excel-yolu> [--api <url>] [--parca <n>] [--kuru]');
  process.exit(1);
}

// Excel kolonu -> DB alanı. Excel'de boş "Opt Say" planlanmamış kırılım demektir (0).
function toRow(r) {
  const themeId = r['ThemeId'];
  const optSay = r['Opt Say'];
  return {
    marka: r['MARKA'] ?? null,
    brandId: r['BrandId'] ?? null,
    seasonId: r['SeasonId'] ?? null,
    freeFieldThree: r['FreeFieldThree'] ?? null,
    temaAdi: r['Tema Adı'] ?? null,
    themeId: (themeId === undefined || themeId === '' || Number(themeId) <= 0) ? null : Number(themeId),
    kategori: r['Kategori'] ?? null,
    subCategoryId: r['SubCategoryId'] ?? null,
    altSezon: r['Alt_Sezon'] ?? null,
    optSay: (optSay === undefined || optSay === '') ? 0 : Number(optSay)
  };
}

/**
 * Excel'i başlık adlarına göre okur (kolon sırasına güvenmez).
 * Boş hücreler atlanır — böylece "Opt Say" boşluğu 0'a çevrilebilir.
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

// ── API modu ───────────────────────────────────────────────────────────────
async function yazApi(rows) {
  const base = apiUrl.replace(/\/+$/, '');
  const url = `${base}/api/theme-plan-parametreleri/import/commit`;
  let eklenen = 0;
  let guncellenen = 0;
  const hatalar = [];

  for (let i = 0; i < rows.length; i += parcaBoyu) {
    const parca = rows.slice(i, i + parcaBoyu);
    const no = Math.floor(i / parcaBoyu) + 1;
    const toplamParca = Math.ceil(rows.length / parcaBoyu);
    process.stdout.write(`   parça ${no}/${toplamParca} (${parca.length} satır)… `);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: parca, updatedBy: 'import-tema-plan' })
    });
    if (!resp.ok) {
      const metin = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${metin.slice(0, 200)}`);
    }
    const sonuc = await resp.json();
    eklenen += sonuc.inserted || 0;
    guncellenen += sonuc.updated || 0;
    (sonuc.failed || []).forEach((f) => hatalar.push(f));
    console.log(`+${sonuc.inserted || 0} yeni, ~${sonuc.updated || 0} güncel` +
      ((sonuc.failed || []).length ? `, ${sonuc.failed.length} hatalı` : ''));
  }
  return { eklenen, guncellenen, hatalar };
}

// ── DB modu ────────────────────────────────────────────────────────────────
async function yazDb(rows) {
  const service = require('../src/services/themePlanParameterService');
  let eklenen = 0;
  let guncellenen = 0;
  const hatalar = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const sonuc = await service.upsertParameter(rows[i], 'import-tema-plan');
      if (sonuc.inserted) eklenen++; else guncellenen++;
    } catch (err) {
      hatalar.push({ row: rows[i], error: err.message });
    }
  }
  return { eklenen, guncellenen, hatalar };
}

async function main() {
  const abs = path.resolve(excelPath);
  const excelRows = await readExcelRows(abs);
  console.log(`📄 ${path.basename(abs)}: ${excelRows.length} satır okundu`);

  const rows = excelRows.map(toRow);

  const gecersiz = rows
    .map((r, i) => ({ r, satir: i + 2 }))
    .filter(({ r }) => r.brandId == null || r.subCategoryId == null || r.seasonId == null);
  if (gecersiz.length) {
    console.error(`❌ ${gecersiz.length} satırda BrandId/SubCategoryId/SeasonId eksik. İlk 5:`);
    gecersiz.slice(0, 5).forEach(({ satir }) => console.error(`   Excel satır ${satir}`));
    process.exitCode = 1;
    return;
  }

  const toplamOpt = rows.reduce((s, r) => s + r.optSay, 0);
  const temaSayisi = new Set(rows.map((r) => r.themeId).filter(Boolean)).size;
  const markalar = [...new Set(rows.map((r) => r.marka))].join(', ');
  console.log(`   ${temaSayisi} benzersiz tema · ${markalar} · toplam Opt Say = ${toplamOpt}`);
  console.log(`   hedef: ${apiUrl ? 'API — ' + apiUrl : 'DATABASE_URL (doğrudan Postgres)'}`);

  if (kuru) {
    console.log('\n🧪 Kuru çalışma — hiçbir şey yazılmadı.');
    console.log('   İlk 2 satır:');
    rows.slice(0, 2).forEach((r) => console.log('   ', JSON.stringify(r)));
    return;
  }

  console.log('');
  const { eklenen, guncellenen, hatalar } = apiUrl ? await yazApi(rows) : await yazDb(rows);

  console.log(`\n✅ Eklenen: ${eklenen} | Güncellenen: ${guncellenen} | Hatalı: ${hatalar.length}`);
  if (hatalar.length) {
    console.log('İlk 5 hata:');
    hatalar.slice(0, 5).forEach((h) => console.log(`   ${h.error} — ${JSON.stringify(h.row).slice(0, 120)}`));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('❌ İçe aktarma hatası:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    // DB modunda havuzu kapat; API modunda pg hiç yüklenmez.
    if (!apiUrl) {
      try { require('../src/config/db').end(); } catch (_) { /* yok sayılır */ }
    }
  });
