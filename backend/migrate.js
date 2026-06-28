const { Pool } = require('pg');

// Use the same connection string format as backend/.env
const pool = new Pool({
  user: 'postgres',
  password: '1234',
  host: '127.0.0.1',
  port: 5433,
  database: 'knowbridge_chat'
});

async function run() {
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await pool.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
      -- Just in case there is a unique index on email
      DROP INDEX IF EXISTS users_email_key;
      DROP INDEX IF EXISTS users_email_unique;
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
      
      ALTER TABLE users ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_client_domain_external_id_key;
      ALTER TABLE users ADD CONSTRAINT users_client_domain_external_id_key UNIQUE (client_domain, external_id);
    `);
    console.log('✅ Successfully removed old email unique constraint and prepared table for multi-tenancy!');
  } catch (err) {
    console.error('❌ Error altering table:', err.message);
  } finally {
    await pool.end();
  }
}

run();
