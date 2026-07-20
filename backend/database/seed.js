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

    // Check if admin@demo.com exists
    const adminCheck = await pool.query('SELECT id FROM agents WHERE email = $1', ['admin@demo.com']);

    if (adminCheck.rows.length === 0) {
      console.log('👤 Creating default admin user (admin@demo.com)...');
      const hashedPassword = await bcrypt.hash('password123', 10);
      
      await pool.query(`
        INSERT INTO agents (name, email, password_hash, role, status, is_available)
        VALUES ($1, $2, $3, $4, 'offline', true)
      `, ['Super Admin', 'admin@demo.com', hashedPassword, 'super_admin']);
      
      console.log('✅ Default admin user created successfully.');
    } else {
      console.log('⏭️ Default admin user already exists. Skipping.');
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
