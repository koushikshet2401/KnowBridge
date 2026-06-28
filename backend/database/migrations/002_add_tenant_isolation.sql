-- ==================== MULTI-TENANT ISOLATION MIGRATION ====================
-- This migration transitions the centralized DB schema from a single-client model
-- to a robust domain-based multi-tenant model.
-- =========================================================================

-- 1. Safely add 'client_domain' to 'users' with a temporary default to support existing rows
ALTER TABLE users ADD COLUMN client_domain VARCHAR(255) NOT NULL DEFAULT 'http://localhost:8000';

-- 2. Drop the temporary default constraint to ensure future inserts must supply it
ALTER TABLE users ALTER COLUMN client_domain DROP DEFAULT;

-- 3. Drop legacy global unique constraints on 'external_id' and 'email'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_external_id_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- 4. Create secure composite tenant unique index constraints
-- This prevents collision when User ID "1" or "admin@demo.com" is registered across different clients
ALTER TABLE users ADD CONSTRAINT unique_tenant_external_user UNIQUE (client_domain, external_id);
ALTER TABLE users ADD CONSTRAINT unique_tenant_email UNIQUE (client_domain, email);

-- 5. Safely add 'client_domain' to 'chats' with a temporary default
ALTER TABLE chats ADD COLUMN client_domain VARCHAR(255) NOT NULL DEFAULT 'http://localhost:8000';
ALTER TABLE chats ALTER COLUMN client_domain DROP DEFAULT;

-- 6. Build optimized index paths for domain-based fast lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (client_domain);
CREATE INDEX IF NOT EXISTS idx_chats_tenant ON chats (client_domain);
CREATE INDEX IF NOT EXISTS idx_users_composite_identity ON users (client_domain, external_id);
CREATE INDEX IF NOT EXISTS idx_chats_composite_identity ON chats (client_domain, user_id);
