# Melek AI — from-scratch research prototype

This directory is an independent, from-scratch language-model training project for the portfolio. It does **not** download pretrained weights, call a hosted AI API, or depend on Claude, ChatGPT, Ollama, or Hugging Face inference.

## Important quality boundary

A small model trained from scratch on a small personal dataset will not match ChatGPT. It is a research prototype and a foundation for experiments, not a claim of frontier-level intelligence.

The portfolio's strict factual mode must **not trust free-form model generations**. The model may be used for language experiments, but visitor-facing factual answers must be assembled from approved, retrieved portfolio evidence. If retrieval finds no adequate evidence, the assistant must abstain with: "This information is not available in the published portfolio." This is the key anti-hallucination control; training alone cannot guarantee truth.

## Design

- Byte-level UTF-8 tokenizer: handles French, English, Arabic and Tunisian Arabic without a pretrained tokenizer.
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

Python 3.10+ and PyTorch. A CUDA GPU is optional; CPU training is intended only for smoke tests. The Lenovo RTX 2050 can be used for small experiments, but VRAM and available system RAM determine the practical batch/sequence/model sizes. It is not enough to promise ChatGPT-level performance.

Install:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
```

## Prepare data

Create `data/train.jsonl` (one JSON object per line):

```json
{"text":"Example training text written by the project owner.","source":"owner-authored","license":"owned"}
```

Only use content you own or are allowed to train on. Do not add private personal data, passwords, tokens, or visitor conversations without informed consent. Keep the real dataset out of Git.

## Train a small model from scratch

```bash
python train.py --data data/train.jsonl --out checkpoints/melek-ai.pt --steps 2000
python generate.py --checkpoint checkpoints/melek-ai.pt --prompt "Bonjour, je suis"
```

Start with defaults for a smoke test. Increase training steps only after validating dataset quality and monitoring loss. Generated text is experimental and must not be treated as verified portfolio facts.

## Anti-hallucination policy for the deployed portfolio

1. Build the knowledge base only from admin-approved public portfolio fields.
2. Retrieve evidence for every factual question and retain source IDs internally.
3. Require sufficient retrieval score and coverage for every requested fact.
4. Return concise answers grounded in retrieved evidence; do not fill missing fields from model memory.
5. If evidence is absent, contradictory, stale, or incomplete, abstain and offer a contact link.
6. Never infer degrees, dates, employers, skills, project outcomes, personal details or availability.
7. Test adversarial prompts and unsupported questions before deployment.

## Current status

This is the model-training foundation only. It is not yet trained, fine-tuned, evaluated, hosted, or connected to the live portfolio. No performance claim should be made until those steps are completed and measured.
