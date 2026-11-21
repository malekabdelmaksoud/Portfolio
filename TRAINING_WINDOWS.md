# Melek AI: Windows 10/11 RTX 2050 Training

This guide prepares local, from-scratch training only. It does not deploy to the portfolio and it does not add a hosted model fallback.

## Requirements

- Windows 10 or 11, 64-bit.
- Python 3.11 or 3.12 from `python.org` or the Windows package manager.
- NVIDIA RTX 2050 laptop GPU and a current NVIDIA driver.
- At least 8 GB system RAM; 16 GB is preferable.
- 8-12 GB free disk for the environment and checkpoints.

The RTX 2050 is a 4 GB-class GPU in this configuration. Use batch 1, context 128, and no larger smoke context initially.

## Supported PyTorch setup

The setup script uses PyTorch's CUDA 12.6 wheel index as a concrete compatible wheel family for a modern NVIDIA PyTorch build:

```text
https://download.pytorch.org/whl/cu126
```

CUDA 12.6 is a wheel/runtime selection, not a claim that every installed NVIDIA driver supports it. The NVIDIA driver must support the wheel, and `scripts\check_hardware.py` must report `cuda_available: true`.

If this wheel index is unavailable or incompatible with the newest installed NVIDIA driver/Python version, stop and use the official PyTorch install selector. Do not install a third-party pretrained model package or claim CUDA works from `nvidia-smi` alone.

## 1. Open PowerShell in the repository

```powershell
cd C:\path\to\Portfolio
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup_windows.ps1
```

Optional: select a different official PyTorch wheel index already verified for the installed Python:

```powershell
.\scripts\setup_windows.ps1 -TorchIndexUrl "https://download.pytorch.org/whl/cu126"
```

## 2. Check hardware

```powershell
.venv-windows\Scripts\python.exe scripts\check_hardware.py
```

The script reports:

- PyTorch version
- CUDA runtime reported by PyTorch
- CUDA availability
- GPU name
- VRAM
- system RAM
- VRAM-aware smoke recommendations

## 3. Prepare the owned dataset

The 69-row corpus is derived only from `melek-ai\knowledge_base.json`, repository-owned public portfolio content. It is not sufficient for a capable general assistant.

```powershell
.venv-windows\Scripts\python.exe melek-ai-model\dataset\prepare.py --source melek-ai\knowledge_base.json --out melek-ai-model\dataset\owner-corpus --seed 42 --val-fraction 0.15
```

Do not add copyrighted, scraped, private or unlicensed material. Any future dataset row requires `text`, `source`, `license`, and permitted license metadata.

## 4. Smoke-training command

Start with 25 steps:

```powershell
.\scripts\train_smoke.ps1
```

This one-command launcher selects VRAM-aware settings. On a 4 GB RTX 2050 it uses context 128, batch 1 and gradient accumulation 1. Only the first smoke run may generate a real checkpoint.

Direct equivalent:

```powershell
.venv-windows\Scripts\python.exe melek-ai-model\training\train.py --config melek-ai-model\model_config\melek_ai_smoke.json --train melek-ai-model\dataset\owner-corpus\train.jsonl --validation melek-ai-model\dataset\owner-corpus\validation.jsonl --out melek-ai-model\checkpoints\melek-ai-v1-smoke.pt --log melek-ai-model\checkpoints\melek-ai-v1-smoke-loss.json --context 128 --batch-size 1 --gradient-accumulation 1 --steps 25
```

Do not call a successful command a trained model until the checkpoint file loads, contains `trained_from_scratch: true`, and is marked `training_status: trained`.

## 5. Evaluate a trained checkpoint

```powershell
.\scripts\evaluate.ps1 -Checkpoint "melek-ai-model\checkpoints\melek-ai-v1-smoke.pt"
```

## 6. Generate text

```powershell
.\scripts\generate.ps1 -Checkpoint "melek-ai-model\checkpoints\melek-ai-v1-smoke.pt" -Prompt "Bonjour" -Tokens 120
```

## 7. Full training

Only run after a successful smoke checkpoint and loss review:

```powershell
.\scripts\train_full.ps1
```

Resume from a periodic `.resume.pt` file:

```powershell
.\scripts\train_full.ps1 -ResumeCheckpoint "melek-ai-model\checkpoints\melek-ai-v1.resume.pt"
```

The full script uses batch 2, context 256 and gradient accumulation 4. It may exceed a 4 GB GPU on the RTX 2050; monitor VRAM and reduce context through `train.py --context 128 --batch-size 1 --gradient-accumulation 1 --steps 2000`.

## CPU fallback

CPU setup:

```powershell
.\scripts\setup_windows.ps1 -TorchIndexUrl "https://download.pytorch.org/whl/cpu"
```

CPU mode is much slower and is appropriate only for short smoke experiments.

## What is not trained

- No checkpoint exists in this repository before you execute training.
- No training loss or duration exists before execution.
- No accuracy, capability or ChatGPT-like quality is claimed.
- No third-party pretrained weights are loaded or downloaded.
