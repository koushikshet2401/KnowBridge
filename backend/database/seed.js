require('dotenv').config();
const bcrypt = require('bcryptjs'); // Package uses bcryptjs per package.json
const pool = require('../src/config/database');

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Check if agents table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'agents'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Agents table does not exist. Please run migrations first.');
      process.exit(1);
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@demo.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'password123';
    
    // Check if admin exists
    const adminCheck = await pool.query('SELECT id FROM agents WHERE email = $1', [adminEmail]);

    if (adminCheck.rows.length === 0) {
      console.log(`👤 Creating default admin user (${adminEmail})...`);
      
      // First, find or create a default tenant
      let tenantResult = await pool.query(`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`);
      let defaultTenantId;
      
      if (tenantResult.rows.length > 0) {
        defaultTenantId = tenantResult.rows[0].id;
      } else {
        tenantResult = await pool.query(`
          INSERT INTO tenants (name, domain) 
          VALUES ('System Default Tenant', 'system.local') 
          RETURNING id
        `);
        defaultTenantId = tenantResult.rows[0].id;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await pool.query(`
        INSERT INTO agents (tenant_id, name, email, password_hash, role, status, is_available)
        VALUES ($1, $2, $3, $4, $5, 'offline', true)
      `, [defaultTenantId, 'Super Admin', adminEmail, hashedPassword, 'super_admin']);
      
      console.log('✅ Default admin user created successfully.');
    } else {
      console.log(`⏭️ Default admin user (${adminEmail}) already exists. Skipping.`);
    }

    console.log('\n🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    process.exit(1);
  } finally {
    // Let pool test connection finish if it hasn't, then end
    setTimeout(async () => {
        await pool.end();
        process.exit(0);
    }, 500);
  }
}

seedDatabase();
