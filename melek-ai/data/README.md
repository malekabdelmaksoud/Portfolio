# Training data

The corpus downloader obtains a bounded sample from public Hugging Face datasets with explicit provenance and license metadata:

```bash
pip install -r requirements.txt
python download_data.py --out data/train.jsonl --max-per-language 1200 --max-scan 150000
```

Every JSONL row contains `text`, `source`, `license`, and `language`. The downloader keeps only an allowlist of public-domain, CC0, CC-BY-4.0, ODC-By-1.0, MIT and Apache-2.0 data, records source identifiers, deduplicates text and filters obvious email/phone patterns. Automatic filters are not a substitute for reviewing samples.

See [SOURCES.md](SOURCES.md) for source repositories, license conditions, attribution and exclusions. The downloaded corpus and checkpoints are git-ignored; do not commit them.

Never include visitor chats, private personal data, passwords, API keys, or unapproved portfolio facts. The current Transformer is a tiny byte-level research model, not a pretrained foundation model. A few portfolio facts are not enough to teach it general conversation.
