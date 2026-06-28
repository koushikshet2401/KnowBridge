const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'knowbridge_chat',
  password: '1234',
  port: 5435,
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'document_chunks';
    `);
    console.log("document_chunks schema:", res.rows);

    const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'document_embeddings';
    `);
    console.log("document_embeddings schema:", res2.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
