-- 004_add_client_domain.sql

-- Add client_domain to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);

-- Replace users_external_id_key unique constraint with composite unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_external_id_key;
ALTER TABLE users ADD CONSTRAINT users_client_domain_external_id_key UNIQUE (client_domain, external_id);

-- Add client_domain to chats table
ALTER TABLE chats ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);

-- Set a default client_domain for existing records (e.g. 'http://localhost:8000') to avoid null issues if the application assumes it
UPDATE users SET client_domain = 'http://localhost:8000' WHERE client_domain IS NULL;
UPDATE chats SET client_domain = 'http://localhost:8000' WHERE client_domain IS NULL;

-- Optional: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_client_domain ON users(client_domain);
CREATE INDEX IF NOT EXISTS idx_chats_client_domain ON chats(client_domain);
