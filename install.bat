@echo off
REM LinkFinder - Windows Installation Script

echo ========================================
echo    LinkFinder Installation Script
echo ========================================
echo.

REM Check Python version
echo Checking Python version...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found
    echo Please install Python 3.9+ from python.org
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo [OK] Python %PYTHON_VERSION%

REM Check Ollama
echo.
echo Checking Ollama...
where ollama >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Ollama not found
    echo Please install from: https://ollama.ai
    echo Then run: ollama pull phi3
    pause
    exit /b 1
)
echo [OK] Ollama installed

REM Check phi3 model
echo Checking phi3 model...
ollama list | findstr "phi3" >nul 2>&1
if errorlevel 1 (
    echo Pulling phi3 model...
    ollama pull phi3
)
echo [OK] phi3 model ready

REM Setup backend
echo.
echo Setting up backend...
cd backend

REM Create virtual environment
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate and install
call venv\Scripts\activate.bat
echo Installing dependencies...
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo [OK] Backend setup complete

REM Run tests
echo.
echo Running tests...
cd ..\tests
pip install -q -r requirements-test.txt
pytest test_normalization.py -q
if errorlevel 1 (
    echo [ERROR] Tests failed
    pause
    exit /b 1
)
echo [OK] Tests passed

cd ..\backend

REM Start server
echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo Starting backend server...
echo Backend will be available at: http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.
echo Next steps:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Enable 'Developer mode'
echo 3. Click 'Load unpacked'
echo 4. Select the 'extension' folder
echo 5. Click the extension icon and configure your profile
echo.
echo Press Ctrl+C to stop the server
echo.

python main.py
