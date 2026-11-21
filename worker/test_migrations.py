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

    def test_new_certification_and_achievement_categories_are_supported(self):
        self.db.execute(
            "INSERT INTO facts(id,category,text_fr,text_en,source_file,source_selector,text_ar) VALUES(?,?,?,?,?,?,?)",
            ("cert-001", "certifications", "Certificat", "Certificate", "admin", "reviewed", "شهادة")
        )
        self.db.execute(
            "INSERT INTO facts(id,category,text_fr,text_en,source_file,source_selector,text_ar) VALUES(?,?,?,?,?,?,?)",
            ("achievement-001", "achievements", "Réalisation", "Achievement", "admin", "reviewed", "إنجاز")
        )
        rows = self.db.execute("SELECT category, approved FROM facts WHERE id IN (?,?) ORDER BY id", ("achievement-001", "cert-001")).fetchall()
        self.assertEqual(rows, [("achievements", 0), ("certifications", 0)])

    def test_chat_retention_indexes_exist(self):
        indexes = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("idx_chats_retention_order", indexes)
        self.assertIn("idx_chat_messages_chat_owner", indexes)

    def test_retention_candidates_delete_oldest_but_keep_one_chat_per_user(self):
        self.db.execute("PRAGMA foreign_keys = ON")
        chats = [
            ("a-old", "a@example.test", "2026-01-01 00:00:00"),
            ("a-new", "a@example.test", "2026-01-03 00:00:00"),
            ("b-old", "b@example.test", "2026-01-02 00:00:00"),
            ("b-new", "b@example.test", "2026-01-04 00:00:00"),
        ]
        self.db.executemany("INSERT INTO chats(id,user_email,title,updated_at) VALUES(?,?,?,?)",
                            [(chat_id, email, chat_id, updated) for chat_id, email, updated in chats])
        for chat_id, email, content in [
            ("a-old", "a@example.test", "A" * 100),
            ("a-new", "a@example.test", "B" * 100),
            ("b-old", "b@example.test", "C" * 100),
            ("b-new", "b@example.test", "D" * 100),
        ]:
            self.db.execute("INSERT INTO chat_messages(id,chat_id,user_email,role,content) VALUES(?,?,?,?,?)",
                            ("msg-" + chat_id, chat_id, email, "user", content))

        candidates = self.db.execute("""
            WITH per_chat AS (
              SELECT c.id,c.user_email,c.updated_at,COALESCE(SUM(length(CAST(m.content AS BLOB))),0) AS bytes
              FROM chats c LEFT JOIN chat_messages m ON m.chat_id=c.id AND m.user_email=c.user_email
              GROUP BY c.id
            ), ranked AS (
              SELECT *,ROW_NUMBER() OVER(PARTITION BY user_email ORDER BY updated_at DESC,id DESC) AS user_rank
              FROM per_chat
            ), eligible AS (
              SELECT * FROM ranked WHERE user_rank>1 AND id<>?
            ), accumulated AS (
              SELECT *,SUM(bytes) OVER(ORDER BY updated_at ASC,id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_bytes
              FROM eligible
            )
            SELECT id,user_email,bytes FROM accumulated
            WHERE running_bytes-bytes<? ORDER BY updated_at ASC,id ASC LIMIT 100
        """, ("a-new", 150)).fetchall()
        self.assertEqual([row[0] for row in candidates], ["a-old", "b-old"])
        for chat_id, email, _ in candidates:
            self.db.execute("DELETE FROM chat_messages WHERE chat_id=? AND user_email=?", (chat_id, email))
            self.db.execute("DELETE FROM chats WHERE id=? AND user_email=?", (chat_id, email))
        remaining = {row[0] for row in self.db.execute("SELECT id FROM chats")}
        self.assertEqual(remaining, {"a-new", "b-new"})

    def test_fact_approval_defaults_to_false(self):
        self.db.execute(
            "INSERT INTO facts(id,category,text_fr,text_en,source_file,source_selector,text_ar) VALUES(?,?,?,?,?,?,?)",
            ("extra-001", "profile", "Texte", "Text", "index.html", "#about", "نص")
        )
        approved = self.db.execute("SELECT approved FROM facts WHERE id='extra-001'").fetchone()[0]
        self.assertEqual(approved, 0)


if __name__ == "__main__":
    unittest.main()
