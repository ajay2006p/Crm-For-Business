@echo off
echo ==========================================
echo RecruitKr Business OS
echo Owner: Ajay
echo ==========================================
echo.
echo Checking environment...

if not exist ".venv\" (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing requirements...
pip install -r requirements.txt

echo Installing Playwright browsers...
playwright install chromium

if not exist ".env" (
    echo Creating .env from .env.example...
    copy .env.example .env
)

echo.
echo Starting Server...
echo Please open http://127.0.0.1:8080 in your browser.
.\.venv\Scripts\python.exe run.py

pause

@REM .\.venv\Scripts\python.exe run.py
