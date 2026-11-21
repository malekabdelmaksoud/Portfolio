import unittest

import torch

from model import MelekGPT


class DynamicVocabularyModelTests(unittest.TestCase):
    def test_forward_uses_checkpoint_vocabulary_size(self):
        model = MelekGPT(width=16, heads=4, layers=1, context=8, dropout=0.0, vocab_size=31)
        tokens = torch.randint(0, 31, (2, 8))
        logits, loss = model(tokens, tokens)
        self.assertEqual(tuple(logits.shape), (2, 8, 31))
        self.assertTrue(torch.isfinite(loss).item())

    def test_generation_returns_valid_vocabulary_ids(self):
        model = MelekGPT(width=16, heads=4, layers=1, context=8, dropout=0.0, vocab_size=31)
        prompt = torch.tensor([[1, 2, 3]], dtype=torch.long)
        generated = model.generate(prompt, max_new_tokens=3, top_k=5)
        self.assertEqual(tuple(generated.shape), (1, 6))
        self.assertTrue(torch.all(generated >= 0).item())
        self.assertTrue(torch.all(generated < 31).item())


if __name__ == "__main__":
    unittest.main()
