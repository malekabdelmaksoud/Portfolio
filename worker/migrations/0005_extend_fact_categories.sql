-- Extend the knowledge base categories without deleting or re-seeding existing facts.
-- Rebuild only the facts table to update its CHECK constraint; preserve every existing column and row.
CREATE TABLE facts_replacement (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('profile','contact','education','skills','experience','project','languages','certifications','achievements')),
  text_fr TEXT NOT NULL,
  text_en TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  source_file TEXT NOT NULL,
  source_selector TEXT NOT NULL,
  public_url TEXT,
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  text_ar TEXT NOT NULL DEFAULT ''
);
INSERT INTO facts_replacement(id,category,text_fr,text_en,aliases_json,source_file,source_selector,public_url,approved,updated_at,text_ar)
SELECT id,category,text_fr,text_en,aliases_json,source_file,source_selector,public_url,approved,updated_at,text_ar FROM facts;
DROP TABLE facts;
ALTER TABLE facts_replacement RENAME TO facts;
CREATE INDEX IF NOT EXISTS idx_facts_approved ON facts(approved,category);
