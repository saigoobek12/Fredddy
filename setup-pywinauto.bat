@echo off
echo ========================================
echo PyWinAuto Setup Script
echo ========================================
echo.
echo This script will help you set up PyWinAuto
echo enhanced UI detection for the Assistant.
echo.

REM Check if Python is installed
echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found!
    echo Please install Python 3.8+ from: https://www.python.org/downloads/
    echo Then re-run this script.
    pause
    exit /b 1
)

python --version
echo.

REM Install Python dependencies
echo Installing Python dependencies...
cd python-backend
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Failed to install dependencies.
    echo You may need to run as Administrator.
    echo.
    echo Try manually: python -m pip install -r requirements.txt
    cd ..
    pause
    exit /b 1
)
cd ..

REM Create .env file with PyWinAuto enabled if it doesn't exist
if not exist ".env" (
    echo Creating .env file with PyWinAuto enabled...
    copy ".env.example" ".env" >nul
    echo PYWINAUTO_ENABLED=1 >> .env
    echo.
    echo .env file created with PyWinAuto enabled.
) else (
    echo.
    echo .env file already exists.
    echo Please add these lines to enable PyWinAuto:
    echo PYWINAUTO_ENABLED=1
    echo PYWINAUTO_PORT=5555
    echo PYWINAUTO_BACKEND=uia
    echo OCRLOCATION_PRIORITY=pywinauto,tesseract,ai
)

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo PyWinAuto is now ready to use.
echo.
echo To start the Assistant with PyWinAuto:
echo 1. Run: npm start
echo 2. Look for "[PyWinAuto]" messages in console
echo 3. Test with: node test-pywinauto.js
echo.
pause