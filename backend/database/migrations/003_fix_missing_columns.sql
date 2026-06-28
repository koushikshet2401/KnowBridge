-- Fix missing columns for crawl_jobs table expected by Node.js backend

ALTER TABLE crawl_jobs RENAME COLUMN url TO base_url;
ALTER TABLE crawl_jobs RENAME COLUMN error_message TO error;

ALTER TABLE crawl_jobs 
ADD COLUMN IF NOT EXISTS skip_patterns JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS stop_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pages_failed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pages_found INTEGER DEFAULT 0;
