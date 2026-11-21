param(
    [string]$ResumeCheckpoint = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $RepoRoot ".venv-windows\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Missing $Python. Run .\scripts\setup_windows.ps1 first." }
Set-Location $RepoRoot

$Arguments = @(
    (Join-Path $RepoRoot "melek-ai-model\training\train.py"),
    "--config", (Join-Path $RepoRoot "melek-ai-model\model_config\melek_ai_v1.json"),
    "--train", (Join-Path $RepoRoot "melek-ai-model\dataset\owner-corpus\train.jsonl"),
    "--validation", (Join-Path $RepoRoot "melek-ai-model\dataset\owner-corpus\validation.jsonl"),
    "--out", (Join-Path $RepoRoot "melek-ai-model\checkpoints\melek-ai-v1.pt"),
    "--log", (Join-Path $RepoRoot "melek-ai-model\checkpoints\melek-ai-v1-loss.json")
)
if ($ResumeCheckpoint) {
    $Arguments += @("--resume", $ResumeCheckpoint)
}
& $Python $Arguments
