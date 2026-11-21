import unittest

from tokenizer import TOKENIZER_TYPE, build_tokenizer, decode, encode


class UnicodeTokenizerTests(unittest.TestCase):
    def test_builds_unicode_character_vocabulary(self):
        tokenizer = build_tokenizer(["Bonjour", "مرحبا", "تونسي"])
        self.assertEqual(tokenizer["type"], TOKENIZER_TYPE)
        self.assertEqual(tokenizer["itos"][0], "<unk>")
        self.assertGreater(len(tokenizer["itos"]), 10)

    def test_round_trip_preserves_arabic_french_and_tunisian(self):
        text = "Bonjour, مرحبا! شنوّة أحوالك؟"
        tokenizer = build_tokenizer([text])
        self.assertEqual(decode(encode(text, tokenizer), tokenizer), text)

    def test_unknown_characters_use_safe_fallback(self):
        tokenizer = build_tokenizer(["hello"])
        encoded = encode("hello مرحبا", tokenizer)
        self.assertEqual(encoded[:5], [tokenizer["itos"].index(char) for char in "hello"])
        self.assertEqual(decode(encoded, tokenizer), "hello" + "�" * 6)

    def test_rejects_empty_training_corpus(self):
        with self.assertRaisesRegex(ValueError, "empty training corpus"):
            build_tokenizer([])


if __name__ == "__main__":
    unittest.main()
