-- ==================== ENABLE EXTENSIONS ====================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension for RAG/embeddings (Optional fallback to REAL[])
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ==================== USERS TABLE ====================
-- End users / customers who use the chat

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE, -- ID from Laravel/main app
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    avatar_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_email ON users(email);

-- ==================== AGENTS TABLE ====================
-- Support staff / admins

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'agent', -- 'admin', 'agent', 'supervisor'
    is_available BOOLEAN DEFAULT true,
    avatar_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline', 'busy'
    max_concurrent_chats INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}',
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agents_email ON agents(email);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_is_available ON agents(is_available);

-- ==================== CHATS TABLE ====================
-- Chat sessions

CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'pending', 'closed', 'resolved'
    channel VARCHAR(50) DEFAULT 'web', -- 'web', 'mobile', 'api'
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    escalated_at TIMESTAMP WITH TIME ZONE,
    escalation_reason TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    rating_comment TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_assigned_agent_id ON chats(assigned_agent_id);
CREATE INDEX idx_chats_status ON chats(status);
CREATE INDEX idx_chats_created_at ON chats(created_at DESC);

-- ==================== MESSAGES TABLE ====================
-- Individual messages in chats

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- 'user', 'ai', 'agent'
    sender_id UUID, -- user_id or agent_id
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file', 'system'
    attachments JSONB DEFAULT '[]',
    ai_model VARCHAR(100), -- 'gpt-4', 'claude-3-sonnet', etc.
    ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
    kb_sources JSONB DEFAULT '[]', -- Knowledge base sources used
    metadata JSONB DEFAULT '{}',
    is_internal BOOLEAN DEFAULT false, -- Internal notes visible only to agents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ==================== FEEDBACK TABLE ====================
-- User feedback on AI responses (thumbs up/down)

CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating VARCHAR(20) NOT NULL, -- 'positive', 'negative'
    comment TEXT,
    action_taken VARCHAR(50), -- 'retried', 'escalated', 'resolved'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_message_id ON feedback(message_id);
CREATE INDEX idx_feedback_chat_id ON feedback(chat_id);
CREATE INDEX idx_feedback_rating ON feedback(rating);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);

-- ==================== DOCUMENTS TABLE ====================
-- Knowledge base documents

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    source_type VARCHAR(50) NOT NULL, -- 'pdf', 'url', 'text', 'manual'
    source_url VARCHAR(1000),
    file_path VARCHAR(500),
    file_size INTEGER,
    mime_type VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    category VARCHAR(100),
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    last_updated_by UUID REFERENCES agents(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_documents_is_active ON documents(is_active);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ==================== DOCUMENT EMBEDDINGS TABLE ====================
-- Vector embeddings for RAG (Retrieval Augmented Generation)

CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding REAL[], -- Fallback to float array instead of vector type
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_embeddings_document_id ON document_embeddings(document_id);
-- CREATE INDEX idx_embeddings_embedding ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ==================== CRAWL JOBS TABLE ====================
-- Track website crawling jobs

CREATE TABLE crawl_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url VARCHAR(1000) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    pages_crawled INTEGER DEFAULT 0,
    pages_indexed INTEGER DEFAULT 0,
    max_pages INTEGER DEFAULT 50,
    max_depth INTEGER DEFAULT 3,
    started_by UUID REFERENCES agents(id),
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

-- ==================== APP SETTINGS TABLE ====================
-- Application configuration and branding

CREATE TABLE app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false, -- Can be accessed by frontend
    updated_by UUID REFERENCES agents(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_settings_key ON app_settings(key);
CREATE INDEX idx_app_settings_is_public ON app_settings(is_public);

-- ==================== NOTIFICATIONS TABLE ====================
-- Agent notifications

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'chat_assigned', 'chat_escalated', 'mention', 'system'
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notifications_agent_id ON notifications(agent_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ==================== AUDIT LOG TABLE ====================
-- Track important actions

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type VARCHAR(20) NOT NULL, -- 'agent', 'system'
    actor_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- ==================== FUNCTIONS ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==================== TRIGGERS ====================

-- Add updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== INITIAL DATA ====================

-- Insert default app settings
INSERT INTO app_settings (key, value, description, is_public) VALUES
('app_name', '"Chat Assistant"', 'Application name displayed in UI', true),
('logo_url', '""', 'Logo URL for branding', true),
('welcome_message', '"Hello! How can I help you today?"', 'Initial greeting message', true),
('ai_model', '"gpt-4-turbo-preview"', 'AI model to use for responses', false),
('ai_temperature', '0.7', 'AI response creativity (0-1)', false),
('ai_max_tokens', '2000', 'Maximum tokens for AI responses', false),
('auto_escalation_enabled', 'true', 'Enable automatic escalation on negative feedback', false),
('max_retry_attempts', '2', 'Maximum AI retry attempts before escalation', false),
('business_hours', '{"start": "09:00", "end": "18:00", "timezone": "UTC", "days": [1,2,3,4,5]}', 'Business hours configuration', false)
ON CONFLICT (key) DO NOTHING;

-- Create a default admin user (password: admin123 - hashed with bcrypt)
INSERT INTO agents (name, email, password_hash, role, is_available, status) VALUES
('System Admin', 'admin@eductrl.com', '$2a$10$rqK4wYZ0yvCQjH.6qKqWYOZPvfPHH5Kx6YxJ8nHfQzXYLx0I7aN4C', 'admin', true, 'online')
ON CONFLICT (email) DO NOTHING;

-- ==================== COMMENTS ====================

COMMENT ON TABLE users IS 'End users/customers who interact with the chat system';
COMMENT ON TABLE agents IS 'Support staff and administrators';
COMMENT ON TABLE chats IS 'Chat sessions between users and AI/agents';
COMMENT ON TABLE messages IS 'Individual messages within chats';
COMMENT ON TABLE feedback IS 'User feedback on AI responses (thumbs up/down)';
COMMENT ON TABLE documents IS 'Knowledge base documents for RAG';
COMMENT ON TABLE document_embeddings IS 'Vector embeddings for semantic search';
COMMENT ON TABLE crawl_jobs IS 'Website crawling jobs for knowledge base';
COMMENT ON TABLE app_settings IS 'Application configuration and branding';
COMMENT ON TABLE notifications IS 'Agent notifications for chat assignments and updates';
COMMENT ON TABLE audit_log IS 'Audit trail for important actions';
