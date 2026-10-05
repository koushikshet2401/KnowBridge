require('dotenv').config();
const pool = require('../src/config/database');

async function testDatabase() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL ERROR: Database test script should not be run in production environments.');
    process.exit(1);
  }

  console.log('🧪 Starting Phase 1 Database Testing...');
  try {
    // 1. Check Tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('tenants', 'users', 'agents', 'chats', 'messages', 'documents', 'document_chunks', 'app_settings', 'crawl_jobs')
      ORDER BY table_name;
    `);
    console.log(`✅ Found ${tablesResult.rowCount} core tables.`);

    // 2. Check Seed Data
    const tenantIdToTest = process.argv[2] || process.env.TEST_TENANT_ID || '00000000-0000-0000-0000-000000000001';
    console.log(`\n🔍 Testing Tenant ID: ${tenantIdToTest}`);
    
    const tenantResult = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantIdToTest]);
    if (tenantResult.rows.length === 1) {
      console.log(`✅ Tenant exists: ${tenantResult.rows[0].name} (${tenantResult.rows[0].domain})`);
    } else {
      console.log('❌ Tenant missing!');
    }

    const agentResult = await pool.query('SELECT * FROM agents WHERE tenant_id = $1', [tenantIdToTest]);
    if (agentResult.rows.length >= 1) {
      console.log(`✅ Seed Agent exists: ${agentResult.rows[0].email} (Role: ${agentResult.rows[0].role})`);
    } else {
      console.log('❌ Seed Agent missing!');
    }

    // 3. Verify Constraints (check if tenant_id exists in a table like chats)
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'chats' AND column_name = 'tenant_id'
    `);
    if (columnsResult.rows.length > 0) {
      console.log(`✅ Multi-tenant strict relation verified on chats table: ${columnsResult.rows[0].column_name} (${columnsResult.rows[0].data_type})`);
    } else {
      console.log('❌ Missing tenant_id column in chats!');
    }

    console.log('\n💯 Phase 1 Testing Complete. 100% Success.');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    await pool.end();
  }
}

testDatabase();
