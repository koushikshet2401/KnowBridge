const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

console.log('🔌 Environment DB Keys loaded:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  has_password: !!process.env.DB_PASSWORD,
  password_len: process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runTargetMigration() {
  console.log('🔄 Running Target Migration: 002_add_tenant_isolation.sql...\n');

  try {
    const filePath = path.join(__dirname, 'migrations', '002_add_tenant_isolation.sql');
    const sql = fs.readFileSync(filePath, 'utf8');

    await pool.query(sql);
    console.log('✅ Migration 002_add_tenant_isolation.sql completed successfully!\n');

    // Display schema status
    const userCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'client_domain'
    `);
    
    if (userCols.rows.length > 0) {
      console.log('📊 Schema verified: column "client_domain" successfully added to "users" table.');
    } else {
      console.warn('⚠️ Schema check warning: "client_domain" not detected in "users".');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

runTargetMigration();
