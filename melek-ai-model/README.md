# Melek AI Model

Melek AI is an independent, owner-controlled research model project. It is **not** GLM, Llama, GPT, Gemini, Claude or another third-party pretrained model.

## Current status

**NOT TRAINED, NOT DEPLOYED.** The repository contains a reproducible PyTorch training and inference pipeline, but no checkpoint proves that from-scratch training occurred. The portfolio must display Melek AI as experimental and unavailable until a real checkpoint is created and locally tested.

## Architecture

- Decoder-only causal Transformer.
- Byte-level UTF-8 tokenizer with vocabulary size 256.
- Configurable width, attention heads, layers and context length.
- Random initialization.
- No pretrained weights or third-party model initialization.
- Targeted at a Lenovo LOQ RTX 2050: start with width 192, 4 layers, 4 heads and context 256.

For the RTX 2050 laptop GPU, the initial intended smoke configuration requires approximately 8-12 GB system/disk overhead and should fit 4-6 GB VRAM with batch size 1 or 2. Exact memory depends on PyTorch, drivers and the active GPU.

## Training

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python training/train.py --config model_config/melek_ai_v1.json
```

CPU training is supported but slow. Mixed precision should only be enabled on CUDA devices that support it.

## Dataset

Only `owned`, `permitted` or `public-domain` licensed rows may train. Private conversation data requires explicit consent and must not be committed.

Example:

```json
{"text":"This line is owned by the project author.","source":"owner-authored","license":"owned"}
```

No dataset is included claiming a real model was trained. `dataset/sample.jsonl` is documentation-only seed data and is too small for meaningful training.

## Checkpoints

Checkpoints are untracked. A real checkpoint must include:

- model state
- exact configuration
- tokenizer identity
- training metadata
- dataset manifest hash
- seed
- training and validation loss
- `trained_from_scratch: true`

## Inference service

The independent HTTP interface is implemented in `inference/server.py`.

```bash
.venv/bin/python inference/server.py --checkpoint checkpoints/melek-ai-v1.pt
```

Request:

```json
{"prompt":"Bonjour","mode":"chat","max_tokens":180}
```

The portfolio Worker calls this interface through `MELEK_AI_SERVICE_URL`. It never downloads model files or falls back to another model provider.

## Limitations

- No training result is claimed.
- A small educational model may produce incoherent or unsafe text.
- Factual portfolio answers must remain grounded in approved D1 facts and abstain when evidence is absent.
- A Worker deployment cannot be assumed to run PyTorch; use a separately managed CPU/GPU inference host or a compatible runtime.
