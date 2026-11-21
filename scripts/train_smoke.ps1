$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $RepoRoot ".venv-windows\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Missing $Python. Run .\scripts\setup_windows.ps1 first." }

Set-Location $RepoRoot
$Hardware = & $Python (Join-Path $RepoRoot "scripts\check_hardware.py") | ConvertFrom-Json
$Smoke = $Hardware.recommended_smoke

& $Python (Join-Path $RepoRoot "melek-ai-model\training\train.py") `
    --config (Join-Path $RepoRoot "melek-ai-model\model_config\melek_ai_smoke.json") `
    --train (Join-Path $RepoRoot "melek-ai-model\dataset\owner-corpus\train.jsonl") `
    --validation (Join-Path $RepoRoot "melek-ai-model\dataset\owner-corpus\validation.jsonl") `
    --out (Join-Path $RepoRoot "melek-ai-model\checkpoints\melek-ai-v1-smoke.pt") `
    --log (Join-Path $RepoRoot "melek-ai-model\checkpoints\melek-ai-v1-smoke-loss.json") `
    --context $Smoke.context `
    --batch-size $Smoke.batch_size `
    --gradient-accumulation $Smoke.gradient_accumulation `
    --steps 25
