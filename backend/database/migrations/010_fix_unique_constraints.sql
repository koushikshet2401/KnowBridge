-- Fix missing unique constraints because migration 002 was skipped incorrectly

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_external_id_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Add missing constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_tenant_external_user'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT unique_tenant_external_user UNIQUE (client_domain, external_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_tenant_email'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT unique_tenant_email UNIQUE (client_domain, email);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (client_domain);
CREATE INDEX IF NOT EXISTS idx_chats_tenant ON chats (client_domain);
CREATE INDEX IF NOT EXISTS idx_users_composite_identity ON users (client_domain, external_id);
CREATE INDEX IF NOT EXISTS idx_chats_composite_identity ON chats (client_domain, user_id);
