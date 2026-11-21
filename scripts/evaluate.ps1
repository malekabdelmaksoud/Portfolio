param(
    [string]$Checkpoint = "melek-ai-model\checkpoints\melek-ai-v1.pt",
    [string]$HeldOutData = "melek-ai-model\dataset\owner-corpus\validation.jsonl"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $RepoRoot ".venv-windows\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Missing $Python. Run .\scripts\setup_windows.ps1 first." }
Set-Location $RepoRoot
& $Python (Join-Path $RepoRoot "melek-ai-model\evaluation\evaluate.py") --checkpoint (Join-Path $RepoRoot $Checkpoint) --data (Join-Path $RepoRoot $HeldOutData)
