import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dataset.dataset import load_jsonl, validate_row
from model_config.validate_config import load_config, validate_config
from tokenizer.byte_utf8 import decode, encode


class ConfigTests(unittest.TestCase):
    def test_config_loads(self):
        config = load_config(ROOT / "model_config/melek_ai_v1.json")
        self.assertEqual(config["architecture"], "decoder-only-causal-transformer")
        self.assertFalse(config["trained_from_scratch"])
        self.assertEqual(config["training_status"], "untrained")
        self.assertEqual(config["vocab_size"], 256)

    def test_invalid_width_is_rejected(self):
        config = json.loads((ROOT / "model_config/melek_ai_v1.json").read_text())
        config["width"] = 195
        config["heads"] = 4
        self.assertTrue(validate_config(config))


class TokenizerTests(unittest.TestCase):
    def test_unicode_round_trip(self):
        text = "Melek مرحبا"
        self.assertEqual(decode(encode(text)), text)

    def test_invalid_byte_is_rejected(self):
        with self.assertRaises(ValueError):
            decode([256])


class DatasetTests(unittest.TestCase):
    def test_sample_dataset_is_valid(self):
        rows = load_jsonl(ROOT / "dataset/sample.jsonl")
        self.assertGreaterEqual(len(rows), 1)

    def test_unlicensed_row_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_row({"text": "x", "source": "unknown", "license": "unknown"}, 1)


class ParameterCountTests(unittest.TestCase):
    def test_documented_default_configuration_parameter_count(self):
        config = load_config(ROOT / "model_config/melek_ai_v1.json")
        width = config["width"]
        heads = config["heads"]
        layers = config["layers"]
        context = config["context"]
        vocab = config["vocab_size"]
        attention = 4 * width * width + width
        mlp = 2 * 4 * width * width + 4 * width + width
        norms = 4 * width
        block = attention + mlp + norms
        tied_count = vocab * width + context * width + layers * block + 2 * width
        self.assertEqual(tied_count, 1875840)


class ThirdPartyFallbackTests(unittest.TestCase):
    def test_production_files_have_no_third_party_model_names(self):
        worker = (ROOT.parent / "worker/src/index.js").read_text(encoding="utf-8")
        forbidden = ("env.AI", "env.AI.run", "SHARED_QUOTA")
        for value in forbidden:
            self.assertNotIn(value, worker)


if __name__ == "__main__":
    unittest.main()
