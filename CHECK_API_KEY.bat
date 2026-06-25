@echo off
echo ========================================
echo Checking API Key Configuration
echo ========================================
echo.

if not exist ".env" (
    echo ERROR: .env file not found!
    echo.
    echo Creating .env from template...
    copy .env.example .env
    echo.
    echo Please edit .env and add your API key!
    echo.
    pause
    exit /b 1
)

echo Checking .env file...
echo.

findstr /C:"OPENROUTER_API_KEY" .env >nul
if %errorlevel% equ 0 (
    echo [✓] Found OPENROUTER_API_KEY
    findstr /C:"OPENROUTER_API_KEY=your" .env >nul
    if %errorlevel% equ 0 (
        echo [✗] WARNING: Still has placeholder value!
        echo     Please replace with your actual key
    ) else (
        echo [✓] Key appears to be set
    )
) else (
    echo [✗] No OPENROUTER_API_KEY found
)

echo.

findstr /C:"GROQ_API_KEY" .env >nul
if %errorlevel% equ 0 (
    echo [✓] Found GROQ_API_KEY
    findstr /C:"GROQ_API_KEY=your" .env >nul
    if %errorlevel% equ 0 (
        echo [✗] WARNING: Still has placeholder value!
        echo     Please replace with your actual key
    ) else (
        echo [✓] Key appears to be set
    )
) else (
    echo [✗] No GROQ_API_KEY found
)

echo.

findstr /C:"GEMINI_API_KEY" .env >nul
if %errorlevel% equ 0 (
    echo [✓] Found GEMINI_API_KEY
    findstr /C:"GEMINI_API_KEY=your" .env >nul
    if %errorlevel% equ 0 (
        echo [✗] WARNING: Still has placeholder value!
        echo     Please replace with your actual key
    ) else (
        echo [✓] Key appears to be set
    )
) else (
    echo [✗] No GEMINI_API_KEY found
)

echo.
echo ========================================
echo Summary
echo ========================================
echo.
echo You need at least ONE valid API key.
echo.
echo Get keys from:
echo - OpenRouter: https://openrouter.ai/keys (RECOMMENDED)
echo - Groq: https://console.groq.com/keys (Free)
echo - Gemini: https://aistudio.google.com/apikey
echo.
echo After adding your key to .env, restart the app.
echo.
pause