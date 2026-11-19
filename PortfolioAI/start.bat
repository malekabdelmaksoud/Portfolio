@echo off
echo ============================================
echo   Portfolio AI – Melek Abdelmaksoud
echo ============================================

REM Check if venv exists
if not exist ".venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate venv
call .venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
pip install -r requirements.txt --quiet

REM Check for .env
if not exist ".env" (
    echo.
    echo [!] No .env file found.
    echo     Copy .env.example to .env and add your GEMINI_API_KEY
    echo     (you can still run without it - fallback mode will be used)
    echo.
)

REM Check for CV
if not exist "CV.pdf" (
    echo [!] CV.pdf not found. Place your resume PDF here as CV.pdf
    echo.
)

echo Starting server on http://127.0.0.1:5000 ...
python app.py
pause
