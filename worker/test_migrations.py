import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        for migration in MIGRATIONS:
            self.db.executescript(migration.read_text(encoding="utf-8"))

    def tearDown(self):
        self.db.close()

    def test_all_23_facts_imported_unapproved_with_arabic_text(self):
        count, approved, missing_arabic = self.db.execute(
            "SELECT COUNT(*), SUM(approved), SUM(CASE WHEN text_ar IS NULL OR trim(text_ar)='' THEN 1 ELSE 0 END) FROM facts"
        ).fetchone()
        self.assertEqual(count, 23)
        self.assertEqual(approved, 0)
        self.assertEqual(missing_arabic, 0)

    def test_all_eight_existing_public_projects_preserve_visibility(self):
        count, visible = self.db.execute("SELECT COUNT(*), SUM(visible) FROM projects").fetchone()
        self.assertEqual(count, 8)
        self.assertEqual(visible, 8)

    def test_new_project_default_is_hidden(self):
        self.db.execute(
            "INSERT INTO projects(id,title,type,description_fr,description_en,url) VALUES(?,?,?,?,?,?)",
            ("new-project", "New", "WEB", "Projet", "Project", "https://example.com")
        )
        visible = self.db.execute("SELECT visible FROM projects WHERE id='new-project'").fetchone()[0]
        self.assertEqual(visible, 0)

    def test_fact_approval_defaults_to_false(self):
        self.db.execute(
            "INSERT INTO facts(id,category,text_fr,text_en,source_file,source_selector,text_ar) VALUES(?,?,?,?,?,?,?)",
            ("extra-001", "profile", "Texte", "Text", "index.html", "#about", "نص")
        )
        approved = self.db.execute("SELECT approved FROM facts WHERE id='extra-001'").fetchone()[0]
        self.assertEqual(approved, 0)


if __name__ == "__main__":
    unittest.main()
