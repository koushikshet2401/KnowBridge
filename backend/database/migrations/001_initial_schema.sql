-- ==================== MULTI-TENANT ARCHITECTURE SCHEMA ====================
-- This schema establishes a strict, highly performant multi-tenant database.
-- Every core table contains a tenant_id foreign key.
-- Indexes are optimized with tenant_id as the leading column to support
-- millions of requests per minute efficiently.
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== TENANTS TABLE ====================
-- Represents a single company/customer using the SaaS product
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE, -- Optional: used for identifying widget domains
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
    settings JSONB DEFAULT '{}', -- Tenant-wide configuration (e.g., custom branding)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_domain ON tenants(domain);

-- ==================== USERS TABLE ====================
-- End users / customers who chat with a specific tenant
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- ID from the tenant's own system (e.g., Shopify ID)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    avatar_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- A user is unique per tenant by external_id or email
    CONSTRAINT unique_tenant_external_user UNIQUE (tenant_id, external_id),
    CONSTRAINT unique_tenant_email UNIQUE (tenant_id, email)
);

-- Highly optimized indexes for fast lookups during chat sessions
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_external ON users(tenant_id, external_id);
CREATE INDEX idx_users_tenant_created ON users(tenant_id, created_at DESC);

-- ==================== AGENTS TABLE ====================
-- Support staff / admins belonging to a specific tenant
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'agent', -- 'admin', 'agent'
    is_available BOOLEAN DEFAULT true,
    avatar_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'offline',
    max_concurrent_chats INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}',
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- An agent email must be unique across the entire platform for global login
    CONSTRAINT unique_agent_email UNIQUE (email)
);

CREATE INDEX idx_agents_tenant_status ON agents(tenant_id, status);
CREATE INDEX idx_agents_tenant_role ON agents(tenant_id, role);

-- ==================== CHATS TABLE ====================
-- Chat sessions between a user and a tenant's AI/Agents
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'pending', 'closed'
    channel VARCHAR(50) DEFAULT 'web',
    priority VARCHAR(20) DEFAULT 'normal',
    escalated_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crucial for dashboard performance (querying all active/pending chats for a tenant)
CREATE INDEX idx_chats_tenant_status_created ON chats(tenant_id, status, created_at DESC);
CREATE INDEX idx_chats_tenant_agent ON chats(tenant_id, assigned_agent_id);
CREATE INDEX idx_chats_tenant_user ON chats(tenant_id, user_id);

-- ==================== MESSAGES TABLE ====================
-- Individual messages inside a chat
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- 'user', 'ai', 'agent'
    sender_id UUID, -- user_id or agent_id
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fast retrieval of messages for a specific chat
CREATE INDEX idx_messages_chat_created ON messages(chat_id, created_at ASC);
-- Useful for analytics (e.g., counting AI messages per tenant)
CREATE INDEX idx_messages_tenant_sender ON messages(tenant_id, sender_type);

-- ==================== DOCUMENTS TABLE (KNOWLEDGE BASE) ====================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'pdf', 'url', 'text'
    source_url VARCHAR(1000),
    file_path VARCHAR(500),
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_docs_tenant_active ON documents(tenant_id, is_active);

-- ==================== DOCUMENT CHUNKS (FOR RAG) ====================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding vector(1536), -- Hardware-accelerated pgvector
    token_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Strict isolation index: all vector searches MUST filter by tenant_id first
CREATE INDEX idx_chunks_tenant_doc ON document_chunks(tenant_id, document_id);

-- ==================== APP SETTINGS TABLE ====================
CREATE TABLE app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES agents(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_setting UNIQUE (tenant_id, key)
);

CREATE INDEX idx_settings_tenant_key ON app_settings(tenant_id, key);

-- ==================== CRAWL JOBS ====================
CREATE TABLE crawl_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    base_url VARCHAR(1000) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    pages_crawled INTEGER DEFAULT 0,
    max_pages INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crawl_tenant_status ON crawl_jobs(tenant_id, status);

-- ==================== TRIGGERS ====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chats_updated BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_docs_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


