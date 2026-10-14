-- ==================== RESTORE TABLES/COLUMNS USED BY THE CODE ====================
-- The squashed 001 schema dropped tables and columns that the backend still
-- reads and writes. Without these, feedback, notifications, chat ratings,
-- crawling and document upload fail with 500 errors on a fresh database.
-- =================================================================================

-- ---------- users ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ---------- agents ----------
ALTER TABLE agents ADD COLUMN IF NOT EXISTS website_domain VARCHAR(255);

-- ---------- chats ----------
ALTER TABLE chats ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS rating_comment TEXT;

-- ---------- messages ----------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kb_sources JSONB DEFAULT '[]';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);

-- ---------- documents ----------
-- crawlerService and KnowledgeBase model insert `type`/`status` without `source_type`
ALTER TABLE documents ALTER COLUMN source_type DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN source_type SET DEFAULT 'text';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'processed';

-- ---------- crawl_jobs ----------
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS pages_found INTEGER DEFAULT 0;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS pages_failed INTEGER DEFAULT 0;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS stop_requested BOOLEAN DEFAULT false;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS skip_patterns JSONB DEFAULT '[]';

-- ---------- feedback (thumbs up/down on AI replies) ----------
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating VARCHAR(20) NOT NULL, -- 'positive', 'negative'
    is_positive BOOLEAN,
    comment TEXT,
    action_taken VARCHAR(50),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_chat ON feedback(chat_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating_created ON feedback(rating, created_at DESC);

-- ---------- notifications (agent alerts) ----------
-- Notification model uses agent_id, chatService uses user_id; both point at agents.
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_agent_created ON notifications(agent_id, created_at DESC);

-- ---------- vector search ----------
-- HNSW index for the cosine-distance (<=>) search in embeddingService
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
    ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- ---------- hardening ----------
ALTER FUNCTION update_updated_at_column() SET search_path = public;
