-- Apply old schema fixes for V2 and V3 crawler update
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Try to enable vector extension if available, otherwise it's fine
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN undefined_file THEN
    -- Ignore if pgvector is not installed on this system
END;
$$;

-- 1. Create document_chunks table (if not exists)
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    -- We use REAL[] as fallback, or vector if extension is enabled
    embedding REAL[],
    chunk_index INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

-- 2. Drop and Recreate notifications table to match the backend code
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('assignment', 'escalation', 'message', 'system')),
  message TEXT NOT NULL,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- 3. Create knowledge_base_documents table
CREATE TABLE IF NOT EXISTS knowledge_base_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'error')),
  chunks_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES agents(id),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_status ON knowledge_base_documents(status);
CREATE INDEX IF NOT EXISTS idx_kb_uploaded_by ON knowledge_base_documents(uploaded_by);

-- 4. Add missing agent fields to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);

-- 5. Add missing assignment fields to chats table
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES agents(id);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_chats_assigned_to ON chats(assigned_to);
