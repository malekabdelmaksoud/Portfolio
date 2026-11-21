import json
import tempfile
import unittest
from pathlib import Path

from dataset import load_documents, normalize_license, split_documents


class DatasetTests(unittest.TestCase):
    def write_rows(self, rows):
        temp = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        with temp:
            for row in rows:
                temp.write(json.dumps(row, ensure_ascii=False) + "\\n")
        self.addCleanup(Path(temp.name).unlink, missing_ok=True)
        return Path(temp.name)

    def row(self, text, **extra):
        return {"text": text, "source": "owner-authored", "license": "owned", **extra}

    def test_loads_only_distinct_documents(self):
        path = self.write_rows([self.row("Bonjour"), self.row("bonjour"), self.row("Hello")])
        self.assertEqual(load_documents(path), ["Bonjour", "Hello"])

    def test_accepts_canonical_cc_by_license(self):
        path = self.write_rows([
            self.row("Un texte autorisé", license="CC BY 4.0"),
            self.row("Another authorized text", license="cc-by-4.0"),
        ])
        self.assertEqual(len(load_documents(path)), 2)

    def test_normalizes_known_license_aliases(self):
        self.assertEqual(normalize_license("CC BY 4.0"), "cc-by-4.0")
        self.assertEqual(normalize_license("Public Domain"), "public-domain")
        self.assertIsNone(normalize_license("CC BY-NC 4.0"))
        self.assertIsNone(normalize_license("unknown"))

    def test_rejects_missing_source(self):
        path = self.write_rows([{"text": "A", "license": "owned"}, self.row("B")])
        with self.assertRaisesRegex(ValueError, "source"):
            load_documents(path)

    def test_rejects_noncommercial_license(self):
        path = self.write_rows([self.row("A", license="CC BY-NC 4.0"), self.row("B")])
        with self.assertRaisesRegex(ValueError, "unsupported or unclear license"):
            load_documents(path)

    def test_rejects_malformed_json(self):
        path = self.write_rows([self.row("A"), self.row("B")])
        path.write_text('{"text": "broken"\\n', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Invalid JSON"):
            load_documents(path)

    def test_requires_two_distinct_documents(self):
        path = self.write_rows([self.row("Same"), self.row("Same")])
        with self.assertRaisesRegex(ValueError, "two distinct"):
            load_documents(path)

    def test_split_is_deterministic_and_disjoint(self):
        docs = [f"document {index}" for index in range(20)]
        train, validation = split_documents(docs, seed=7)
        train_again, validation_again = split_documents(docs, seed=7)
        self.assertEqual((train, validation), (train_again, validation_again))
        self.assertFalse(set(train) & set(validation))
        self.assertEqual(set(train) | set(validation), set(docs))
        self.assertGreaterEqual(len(validation), 1)


if __name__ == "__main__":
    unittest.main()
