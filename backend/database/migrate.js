require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

async function runMigrations() {
  console.log('🔄 Starting database migrations...\n');

  try {
    // Ensure migrations tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration file(s) in directory.\n`);

    for (const file of files) {
      // Check if already executed
      const checkResult = await pool.query('SELECT id FROM migrations WHERE filename = $1', [file]);
      if (checkResult.rows.length > 0) {
        console.log(`⏭️  Skipped: ${file} (Already executed)`);
        continue;
      }

      // Legacy support: if 'users' table exists, assume 001 and 002 were manually applied previously
      if (file === '001_initial_schema.sql' || file === '002_add_tenant_isolation.sql') {
        const legacyCheck = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users')");
        if (legacyCheck.rows[0].exists) {
           await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
           console.log(`⏭️  Skipped: ${file} (Legacy DB detected, marked as executed)`);
           continue;
        }
      }

      console.log(`📄 Running: ${file}`);
      const filePath = path.join(migrationDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`✅ Completed: ${file}\n`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    console.log('🎉 All pending migrations completed successfully!');

    // Display table count
    const result = await pool.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(`📊 Total tables created: ${result.rows[0].table_count}`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigrations();
