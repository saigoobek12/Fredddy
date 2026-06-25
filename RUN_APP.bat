@echo off
echo ========================================
echo Starting Freddy Assistant
echo ========================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env
    echo.
    echo IMPORTANT: Edit .env and add your API key!
    echo Press any key to continue...
    pause >nul
)

REM Check if Python dependencies are installed
echo Checking Python dependencies...
cd python-backend
python -c "import pywinauto, flask, pytesseract" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Python dependencies not found. Installing...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo.
        echo Failed to install Python dependencies!
        echo Please run: pip install -r python-backend\requirements.txt
        pause
        exit /b 1
    )
)
cd ..

REM Check if npm dependencies are installed
if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install
)

echo.
echo ========================================
echo Starting Application...
echo ========================================
echo.
echo PyWinAuto OCR will start automatically.
echo Look for [PyWinAuto] messages in console.
echo.
echo Press Ctrl+C to stop the app.
echo.

REM Start the Electron app
npm start