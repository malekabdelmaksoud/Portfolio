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


    def test_seeded_projects_have_real_technology_labels(self):
        labels = dict(self.db.execute("SELECT id, type FROM projects").fetchall())
        self.assertEqual(labels["project-001"], "JAVA · E-LEARNING")
        self.assertEqual(labels["project-005"], "TYPESCRIPT · MCP · CLOUDFLARE")
        self.assertEqual(labels["project-008"], "C# · .NET")

    def test_new_project_default_is_hidden(self):
        self.db.execute(
            "INSERT INTO projects(id,title,type,description_fr,description_en,url) VALUES(?,?,?,?,?,?)",
            ("new-project", "New", "WEB", "Projet", "Project", "https://example.com")
        )
        visible = self.db.execute("SELECT visible FROM projects WHERE id='new-project'").fetchone()[0]
        self.assertEqual(visible, 0)


    def test_user_chat_history_is_partitioned_by_verified_email(self):
        tables = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertIn("chats", tables)
        self.assertIn("chat_messages", tables)
        self.db.execute("INSERT INTO chats(id,user_email,title) VALUES(?,?,?)", ("chat-a", "a@example.test", "A"))
        self.db.execute("INSERT INTO chats(id,user_email,title) VALUES(?,?,?)", ("chat-b", "b@example.test", "B"))
        self.db.execute("INSERT INTO chat_messages(id,chat_id,user_email,role,content) VALUES(?,?,?,?,?)",
                        ("msg-a", "chat-a", "a@example.test", "user", "Private question"))
        own = self.db.execute("SELECT content FROM chat_messages WHERE user_email=?", ("a@example.test",)).fetchall()
        other = self.db.execute("SELECT content FROM chat_messages WHERE user_email=?", ("b@example.test",)).fetchall()
        self.assertEqual(own, [("Private question",)])
        self.assertEqual(other, [])

    def test_fact_approval_defaults_to_false(self):
        self.db.execute(
            "INSERT INTO facts(id,category,text_fr,text_en,source_file,source_selector,text_ar) VALUES(?,?,?,?,?,?,?)",
            ("extra-001", "profile", "Texte", "Text", "index.html", "#about", "نص")
        )
        approved = self.db.execute("SELECT approved FROM facts WHERE id='extra-001'").fetchone()[0]
        self.assertEqual(approved, 0)

    def test_repository_import_indexes_exist_and_original_projects_are_insert_only(self):
        indexes = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("idx_projects_url", indexes)
        original = self.db.execute(
            "SELECT id,title,type,url,visible,sort_order FROM projects ORDER BY sort_order"
        ).fetchall()
        self.assertEqual(len(original), 8)
        self.db.execute(
            "INSERT INTO projects(id,title,type,description_fr,description_en,url,visible,sort_order) "
            "VALUES(?,?,?,?,?,?,1,90)",
            ("import-github-test", "Test", "GitHub · JavaScript", "Projet public", "Public project",
             "https://github.com/owner/test")
        )
        count = self.db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        self.assertEqual(count, 9)
        unchanged = self.db.execute(
            "SELECT id,title,type,url,visible,sort_order FROM projects WHERE id LIKE 'project-%' ORDER BY sort_order"
        ).fetchall()
        self.assertEqual(unchanged, original)


if __name__ == "__main__":
    unittest.main()
