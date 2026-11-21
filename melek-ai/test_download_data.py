import unittest

from download_data import LANGUAGE_ALIASES, clean_text, safe_tunisian_text, record_key


class PublicCorpusFilterTests(unittest.TestCase):
    def test_language_aliases_cover_arabic_french_and_english(self):
        self.assertEqual(LANGUAGE_ALIASES["arabic"], "ar")
        self.assertEqual(LANGUAGE_ALIASES["fr"], "fr")
        self.assertEqual(LANGUAGE_ALIASES["English"], "en")

    def test_text_is_normalized_and_whitespace_collapsed(self):
        self.assertEqual(clean_text("  " + "Bonjour monde. " * 30), ("Bonjour monde. " * 30).strip())

    def test_short_text_is_rejected(self):
        self.assertEqual(clean_text("Too short"), "")

    def test_email_and_phone_patterns_are_rejected(self):
        self.assertEqual(clean_text(("Contact " * 30) + "name@example.com"), "")
        self.assertEqual(clean_text(("Call " * 30) + "+216 22 123 456"), "")

    def test_overlong_text_is_rejected(self):
        self.assertEqual(clean_text("x" * 12001), "")

    def test_tunisian_proverb_blocklist_is_applied(self):
        self.assertFalse(safe_tunisian_text("اضرب القطوسة تتأدب العروسة"))
        self.assertFalse(safe_tunisian_text("طاعة النساء تدخل النار"))

    def test_safe_tunisian_text_is_kept(self):
        self.assertTrue(safe_tunisian_text("اللي فات مات واللي جاي غيب"))

    def test_deduplication_key_is_case_insensitive(self):
        self.assertEqual(record_key("Hello"), record_key("hello"))


if __name__ == "__main__":
    unittest.main()
