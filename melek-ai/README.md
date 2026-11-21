# Melek AI — from-scratch research prototype

This directory is an independent, from-scratch language-model training project for the portfolio. It does **not** download pretrained weights, call a hosted AI API, or depend on Claude, ChatGPT, Ollama, or Hugging Face inference.

## Important quality boundary

A small model trained from scratch on a small personal dataset will not match ChatGPT. It is a research prototype and a foundation for experiments, not a claim of frontier-level intelligence.

The portfolio's strict factual mode must **not trust free-form model generations**. Visitor-facing factual answers must remain grounded in approved, retrieved portfolio evidence. The deployed Worker applies this evidence policy before calling either provider. If retrieval finds no adequate evidence, the assistant must abstain with: "This information is not available in the published portfolio." This is the key anti-hallucination control; training alone cannot guarantee truth.

## Design

- Unicode-character tokenizer: maps complete characters, so Arabic, French and Tunisian text is generated as valid Unicode rather than arbitrary Unicode characters.
- Small decoder-only Transformer (GPT-style) implemented in PyTorch from randomly initialized weights.
- JSONL training corpus with explicit provenance and consent requirements.
- Training and sampling scripts; checkpoint files are local and must not be committed.
- A future serving layer must enforce evidence retrieval, source allowlists, confidence thresholds and abstention before any answer is shown.

## Evidence retrieval behavior

The current evidence guard is a conservative lexical baseline, not semantic search:
- Normalizes Unicode accents and common Arabic letter variants.
- Removes common French, English, Spanish and Tunisian Arabic function words.
- Uses inverse-document-frequency weighting so common portfolio vocabulary carries less weight.
- Requires a minimum weighted query coverage before returning a fact.
- Returns only exact approved fact text and source identifiers; otherwise it abstains.

The regression suite covers unsupported requests, unapproved or source-less facts, multi-concept coverage, generic queries, French wording, Arabic diacritics and Tunisian Arabic question wording. This is not a guarantee against every false match; evaluate it against a reviewed question set before public deployment.

## Requirements

Python 3.10+ and PyTorch. The public-corpus downloader also uses Hugging Face Datasets. A CUDA GPU is optional; CPU training is intended only for smoke tests. The Lenovo RTX 2050 can be used for small experiments, but VRAM and available system RAM determine the practical batch/sequence/model sizes. It is not enough to promise ChatGPT-level performance.

Install:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
```

## Prepare data

Download a bounded, provenance-aware public corpus sample (English, French, Arabic and Tunisian Derja) with `python download_data.py --out data/train.jsonl`. The downloader only accepts a strict allowlist of public-domain, CC0, CC-BY-4.0, ODC-By-1.0, MIT and Apache-2.0 data and records source identifiers. Review [data/SOURCES.md](data/SOURCES.md) before use. You can also add your own JSONL documents with non-empty `text`, `source` and a supported license:

```json
{"text":"Example training text written by the project owner.","source":"owner-authored","license":"owned"}
```

Only use content you own or are allowed to train on. Do not add private personal data, passwords, tokens, or visitor conversations without informed consent. Keep the real dataset out of Git.

## Download public, license-filtered data

The repository includes a bounded downloader for selected public corpora: OpenAssistant conversations, PleIAs Common Corpus, University of Dubai Arabic legal text, Tunisian proverbs, and LINAGORA FineWeb2 Tunisian Arabic. It records source IDs and exact licenses in every row, skips non-commercial/unknown licenses, deduplicates text, filters obvious email/phone patterns, and applies a FineWeb2 language-confidence threshold. Read `data/SOURCES.md` before downloading; unreviewed social-media corpora and sources with unclear licensing are excluded.

```bash
python download_data.py --out data/train.jsonl --max-per-language 1500 --max-scan 200000
```

Common Corpus is very large; the script has a scan cap and may not find every language in one run. Increase the cap deliberately if needed. Inspect the generated counts and samples before training. The script does not fabricate substitute data.

## Train a small model from scratch

```bash
python train.py --data data/train.jsonl --out checkpoints/melek-ai.pt --steps 2000
python evaluate.py --data data/train.jsonl --checkpoint checkpoints/melek-ai.pt
python generate.py --checkpoint checkpoints/melek-ai.pt --prompt "Bonjour, je suis"
```

To continue a training run without starting over, pass `--resume checkpoints/melek-ai.pt` and keep the same architecture options (`--width`, `--heads`, `--layers`, `--context`, `--dropout`). Optimizer state is saved for continuation. `evaluate.py` measures character-level loss on the same deterministic held-out document split. Start with defaults only after preparing enough distinct documents. The trainer deduplicates identical text and creates a deterministic document-level train/validation split; it refuses to reuse training text as validation data. Both splits must contain more than `context + 1` UTF-8 bytes, so reduce `--context` or add more permitted documents if it stops early. Increase training steps only after validating dataset quality and monitoring both losses. Generated text is experimental and must not be treated as verified portfolio facts.

## Anti-hallucination policy for the deployed portfolio

1. Build the knowledge base only from admin-approved public portfolio fields.
2. Retrieve evidence for every factual question and retain source IDs internally.
3. Require sufficient retrieval score and coverage for every requested fact.
4. Return concise answers grounded in retrieved evidence; do not fill missing fields from model memory.
5. If evidence is absent, contradictory, stale, or incomplete, abstain and offer a contact link.
6. Never infer degrees, dates, employers, skills, project outcomes, personal details or availability.
7. Test adversarial prompts and unsupported questions before deployment.

## Run the custom checkpoint privately

The Worker exposes **MelekGPT** in the model selector as unavailable until both a trained checkpoint service URL and a private token are configured. It never silently substitutes another model when the user selects MelekGPT.

1. Create a substantial, reviewed `data/train.jsonl` using the format in [data/README.md](data/README.md). Only train on content you own or have permission to use.
2. Install dependencies and train:
   ```bash
   pip install -r requirements.txt
   python train.py --data data/train.jsonl --out checkpoints/melek-ai.pt --steps 2000
   ```
3. Generate a sample and evaluate it manually before serving:
   ```bash
   python generate.py --checkpoint checkpoints/melek-ai.pt --prompt "Bonjour, je suis" --tokens 120
   ```
4. Set a long random `MELEK_AI_TOKEN` in your local environment, then start the private server:
   ```bash
   # PowerShell example
   $env:MELEK_AI_TOKEN = "replace-with-a-long-random-secret"
   python serve.py
   ```
5. Put the server behind a **named Cloudflare Tunnel** with an HTTPS hostname. Do not expose port 8788 directly. Configure Worker secrets `MELEK_AI_URL` (the tunnel URL ending in `/v1/chat/completions`) and `MELEK_AI_TOKEN` (the same token), then deploy the Worker.
6. Keep the host machine running. If it is offline, the custom model will be unavailable; the free hosted model remains independently selectable.

The server loads only a checkpoint marked `trained_from_scratch` and requires bearer authentication. The current tiny character-level Transformer is experimental and is not comparable to Claude or other foundation models. It needs a large, varied corpus and evaluation; a small personal portfolio dataset will not teach it general conversation.

## Current status

The architecture, public-data pipeline, and private inference adapter are implemented. An earlier byte-level experimental checkpoint was trained and evaluated but rejected for serving because generated samples were poor. The improved Unicode-character checkpoint is being trained and evaluated in CI. No live model endpoint is configured, so MelekGPT remains unavailable in the website selector until a checkpoint passes review and a private service is configured.
