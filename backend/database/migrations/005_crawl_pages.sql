-- Create crawl_pages table for the crawler
CREATE TABLE IF NOT EXISTS crawl_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    url VARCHAR(2000) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    word_count INTEGER DEFAULT 0,
    error TEXT,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    crawled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crawl_pages_job_id ON crawl_pages(job_id);
