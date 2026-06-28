const pool = require('./src/config/database');
const { generateEmbeddings } = require('./src/services/embeddingService');

async function test() {
  try {
    console.log("Generating embedding...");
    const embeddings = await generateEmbeddings(["test document content for debugging"]);
    console.log("Embedding generated. Length:", embeddings[0].length);

    console.log("Attempting insert into document_chunks...");
    await pool.query(
      `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, token_count)
       VALUES ($1, $2, $3::vector, $4, $5)`,
      ['00000000-0000-0000-0000-000000000000', "test content", JSON.stringify(embeddings[0]), 0, 10]
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
