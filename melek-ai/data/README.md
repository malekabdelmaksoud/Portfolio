# Training data

Place your own or explicitly permitted text records in `train.jsonl`, one JSON object per line:

```json
{"text":"A paragraph you wrote or have permission to use.","source":"owner-authored","license":"owned"}
```

Allowed license values are `owned`, `permitted`, and `public-domain`. Do not include visitor conversations, private personal data, passwords, API keys, or unapproved portfolio facts. The current Transformer is a tiny byte-level research model, not a pretrained foundation model. A few portfolio facts are not enough to teach it general conversation. Build a substantial, varied, reviewed corpus and evaluate it before serving it to visitors.

The actual dataset and checkpoints are git-ignored.
