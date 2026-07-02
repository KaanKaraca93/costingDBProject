/**
 * Basit migration runner: schema.sql ve seed.sql dosyalarını sırayla çalıştırır.
 * Kullanım: npm run migrate  (DATABASE_URL .env'den veya ortam değişkeninden okunur)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
  console.log(`✅ Çalıştırıldı: ${path.basename(filePath)}`);
}

async function migrate() {
  try {
    await runSqlFile(path.join(__dirname, 'schema.sql'));
    await runSqlFile(path.join(__dirname, 'seed.sql'));
    console.log('🎉 Migration tamamlandı.');
  } catch (err) {
    console.error('❌ Migration hatası:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
