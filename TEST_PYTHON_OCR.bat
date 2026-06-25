@echo off
echo ========================================
echo Testing Python OCR Service
echo ========================================
echo.

cd python-backend

echo Installing dependencies (if needed)...
python -m pip install -r requirements.txt >nul 2>&1

echo.
echo Starting PyWinAuto OCR Service...
echo Service will run on http://localhost:5555
echo.
echo Press Ctrl+C to stop
echo.

python start_service.py --port 5555 --host 127.0.0.1 --backend uia

pause