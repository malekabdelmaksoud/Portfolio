-- Repository import support. Existing project records remain unchanged.
CREATE INDEX IF NOT EXISTS idx_projects_url ON projects(url);
CREATE INDEX IF NOT EXISTS idx_projects_import_url ON projects(url,visible,sort_order);
