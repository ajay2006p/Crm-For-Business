@echo off
echo ==========================================
echo Google Maps Scraper CRM
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

echo.
echo Starting Server...
echo Please open http://127.0.0.1:8080 in your browser.
python api.py

pause
