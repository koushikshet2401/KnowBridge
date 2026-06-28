const pool = require('./src/config/database');
const { generateEmbeddings } = require('./src/services/embeddingService');

async function test() {
  try {
    const docResult = await pool.query(
      `INSERT INTO documents (title, source_type, file_path, mime_type, file_size, content, category, is_active, created_at, updated_at)
       VALUES ($1, 'test', $2, 'application/pdf', $3, $4, $5, true, NOW(), NOW()) RETURNING id`,
      ['Test Doc', 'test/path', 100, 'Test content', 'general']
    );
    const docId = docResult.rows[0].id;
    console.log("Created doc with ID:", docId);

    const embeddings = await generateEmbeddings(["test document content for debugging"]);

    console.log("Attempting insert into document_chunks...");
    await pool.query(
      `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, token_count)
       VALUES ($1, $2, $3::vector, $4, $5)`,
      [docId, "test content", JSON.stringify(embeddings[0]), 0, 10]
    );
    console.log("Insert successful!");
  } catch (err) {
    console.error("INSERT ERROR CAUGHT:");
    console.error(err);
  } finally {
    pool.end();
  }
}

test();
