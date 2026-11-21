param(
    [ValidateSet("3.11", "3.12")]
    [string]$PythonVersion = "3.11",
    [string]$TorchIndexUrl = "https://download.pytorch.org/whl/cu126"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Venv = Join-Path $RepoRoot ".venv-windows"
Set-Location $RepoRoot

Write-Host "Creating repository-local virtual environment at $Venv"
if (Get-Command py -ErrorAction SilentlyContinue) {
    py "-$PythonVersion" -m venv $Venv
} else {
    python -m venv $Venv
}

$Python = Join-Path $Venv "Scripts\python.exe"
& $Python -m pip install --upgrade pip setuptools wheel
Write-Host "Installing PyTorch from $TorchIndexUrl"
& $Python -m pip install "torch>=2.2,<3" --index-url $TorchIndexUrl
& $Python -m pip install psutil "numpy>=1.26,<3"
& $Python (Join-Path $RepoRoot "scripts\check_hardware.py")
