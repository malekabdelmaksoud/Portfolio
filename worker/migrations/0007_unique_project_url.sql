-- Enforce database-level uniqueness on project URLs to prevent race conditions during import.
-- Existing project records remain unchanged.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_url_unique ON projects(url);
