# Melek AI Model

Melek AI is an independent, owner-controlled research model project. It is **not** GLM, Llama, GPT, Gemini, Claude or another third-party pretrained model.

## Current status

**TRAINED LOCALLY FOR RESEARCH, NOT DEPLOYED.** A real from-scratch RTX 2050 smoke run and 2000-step run produced checkpoints and validation metrics. The portfolio must remain experimental and deployment requires a managed inference host.

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

## First training experiment status

**LOCAL 2000-STEP TRAINING COMPLETED ON RTX 2050.**

- Owner corpus: prepared deterministically from `melek-ai/knowledge_base.json`.
- Corpus split: 58 training rows and 11 validation rows.
- Smoke configuration: 25 steps, batch 1, context 128.
- Full run: 2000 steps, batch 1, context 128, gradient accumulation 1, duration 89.665 seconds.
- Held-out validation perplexity: 7.882866628447803.
- The model remains experimental and the corpus is too small for a generally capable assistant.

## Local setup on Windows with RTX 2050

Open PowerShell or Command Prompt and run:

```powershell
cd C:\path\to\Portfolio
python -m venv melek-ai-model\.venv
melek-ai-model\.venv\Scripts\python.exe -m pip install --upgrade pip
melek-ai-model\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124
melek-ai-model\.venv\Scripts\python.exe -m pip install -r melek-ai-model\requirements.txt
melek-ai-model\.venv\Scripts\python.exe melek-ai-model\dataset\prepare.py --source melek-ai\knowledge_base.json --out melek-ai-model\dataset\owner-corpus --seed 42 --val-fraction 0.15
melek-ai-model\.venv\Scripts\python.exe melek-ai-model\training\train.py --config melek-ai-model\model_config\melek_ai_smoke.json --train melek-ai-model\dataset\owner-corpus\train.jsonl --validation melek-ai-model\dataset\owner-corpus\validation.jsonl --out melek-ai-model\checkpoints\melek-ai-v1-smoke.pt --log melek-ai-model\checkpoints\melek-ai-v1-smoke-loss.json
melek-ai-model\.venv\Scripts\python.exe melek-ai-model\evaluation\evaluate.py --checkpoint melek-ai-model\checkpoints\melek-ai-v1-smoke.pt
melek-ai-model\.venv\Scripts\python.exe melek-ai-model\inference\generate.py --checkpoint melek-ai-model\checkpoints\melek-ai-v1-smoke.pt --prompt "Bonjour"
```

Before training, verify `nvidia-smi` and CUDA. If CUDA is unavailable, use the CPU torch wheel and omit the `cu124` installation. Do not report a checkpoint until the training command completes and the checkpoint is loaded successfully.
