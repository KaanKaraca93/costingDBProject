const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL tanımlı değil. .env dosyanızı kontrol edin.');
}

const useSsl = process.env.PG_SSL === 'true' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('❌ Beklenmeyen Postgres pool hatası:', err);
});

module.exports = pool;
