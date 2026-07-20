-- Add missing multi-tenant and feedback columns expected by the controllers

ALTER TABLE users ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);
ALTER TABLE chats ADD COLUMN IF NOT EXISTS client_domain VARCHAR(255);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS is_positive BOOLEAN;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS website_domain VARCHAR(255);
