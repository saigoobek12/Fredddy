# HOW TO RUN FREDDY ASSISTANT

## Quick Start (Easiest Way)

### Method 1: Double-Click to Run
1. **Double-click**: `RUN_APP.bat`
2. Wait for dependencies to install (first time only)
3. App will start automatically

### Method 2: Manual Steps
```bash
# 1. Open Command Prompt in this folder
cd C:\Users\user\Desktop\Freddy

# 2. Install Python dependencies (first time only)
cd python-backend
pip install -r requirements.txt
cd ..

# 3. Install Node.js dependencies (first time only)
npm install

# 4. Create .env file
copy .env.example .env
# Edit .env and add your API key (see below)

# 5. Start the app
npm start
```

---

## Configuration

### Required: Add API Key to .env

Open `.env` file and add ONE of these:

**Option A: OpenRouter (Recommended)**
```env
OPENROUTER_API_KEY=sk-or-your_key_here
```
Get key from: https://openrouter.ai/keys

**Option B: Groq (Free)**
```env
GROQ_API_KEY=your_groq_key_here
```
Get key from: https://console.groq.com/keys

**Option C: Gemini**
```env
GEMINI_API_KEY=your_gemini_key_here
```
Get key from: https://aistudio.google.com/apikey

### Optional: Enable PyWinAuto (Enhanced OCR)

Add to `.env`:
```env
PYWINAUTO_ENABLED=1
```

---

## How It Works

### Current Mode: HYBRID (Both OCR Systems Available)

When `PYWINAUTO_ENABLED=1`:
1. **PyWinAuto** tries native Windows UI detection (95% accurate)
2. Falls back to **Python Tesseract** OCR (70% accurate)
3. Falls back to **AI bounding boxes** (30% accurate)

When `PYWINAUTO_ENABLED=0` or not set:
1. **Tesseract.js** OCR only (70% accurate)
2. Falls back to **AI bounding boxes** (30% accurate)

---

## Testing Components Separately

### Test 1: Test Python OCR Service Only
```bash
# Double-click this file:
TEST_PYTHON_OCR.bat

# Or manually:
cd python-backend
python start_service.py
```

Visit: http://localhost:5555/health
Should see: `{"status": "healthy"}`

### Test 2: Test Node.js Integration
```bash
node test-pywinauto.js
```

Should see: Test results and status messages

### Test 3: Run Full App
```bash
npm start
```

---

## What to Expect

### When App Starts:
```
[assistant] AI provider: OpenRouter
[PyWinAuto] Starting PyWinAuto OCR service...
[PyWinAuto] Service initialized successfully
```

### When You Ask a Question:
1. Transparent overlay appears bottom-right
2. Type: "how do I save a file?"
3. Press Enter
4. App screenshots your screen
5. AI plans the steps
6. OCR locates elements
7. Spotlight guides you through steps

### Console Messages:
```
[assistant] AI provider: OpenRouter
[PyWinAuto] Starting PyWinAuto OCR service...
[PyWinAuto] Retrieved 47 native elements
[PyWinAuto] Location results: 3/3 located
[PyWinAuto] Methods: 2 native, 1 OCR, 0 AI
[OCR] Location method stats: {pywinauto: 2, python-ocr: 1, ai: 0}
[OCR] Average confidence: 0.85
```

---

## Troubleshooting

### Problem: "Python not found"
**Solution**: Install Python 3.8+ from https://www.python.org/downloads/

### Problem: "pip install fails"
**Solution**: Run Command Prompt as Administrator, then:
```bash
cd C:\Users\user\Desktop\Freddy\python-backend
pip install -r requirements.txt
```

### Problem: "PyWinAuto service failed to start"
**Solution**: 
1. Check if port 5555 is in use
2. Try different port in .env: `PYWINAUTO_PORT=5556`
3. Or disable PyWinAuto: `PYWINAUTO_ENABLED=0`

### Problem: "No API key set"
**Solution**: Edit `.env` file and add your API key (see Configuration section)

### Problem: "Service connection refused"
**Solution**:
```bash
# Test Python service manually:
cd python-backend
python start_service.py
# Should start on http://localhost:5555
```

### Problem: App works but OCR is inaccurate
**Solutions**:
- **For native Windows apps**: Enable PyWinAuto (`PYWINAUTO_ENABLED=1`)
- **For web browsers**: OCR fallback is normal (lower accuracy expected)
- **For custom apps**: AI bounding boxes are used (lowest accuracy)

---

## Performance Tips

### First Run:
- Python service startup: ~2-3 seconds
- Total first request: ~5-8 seconds

### Subsequent Runs:
- Element detection: ~100-500ms
- Much faster after warmup!

### To Speed Up:
1. Keep app running (don't restart frequently)
2. Enable PyWinAuto for native apps
3. Use fast AI model (Groq is fastest)

---

## File Structure

```
Freddy/
├── RUN_APP.bat              ← Double-click to start
├── TEST_PYTHON_OCR.bat      ← Test Python service
├── .env                     ← Your API keys here
├── main.js                  ← Main Electron app
├── locator-pywinauto.js     ← Enhanced OCR locator
├── locator-legacy.js.bak    ← Old system (backup)
├── python-ipc.js            ← Python communication
├── package.json             ← Node dependencies
│
├── python-backend/
│   ├── ocr_service.py       ← Python OCR service
│   ├── start_service.py     ← Service launcher
│   └── requirements.txt     ← Python dependencies
│
└── renderer/
    ├── overlay.html         ← UI overlay
    └── overlay.js           ← UI logic
```

---

## Next Steps

### To Use the App:
1. Run `RUN_APP.bat`
2. Wait for overlay to appear
3. Type your question in bottom-right corner
4. Press Enter
5. Follow the spotlight through steps

### To Complete Migration (Remove Old OCR):
1. Review `AI_CODER_INSTRUCTIONS.md`
2. Run remaining migration steps
3. Or give to another AI model to complete

### To Customize:
- Edit `.env` for settings
- Check `MIGRATION_PLAN.md` for architecture
- See `README.md` for full documentation

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start app | `npm start` or `RUN_APP.bat` |
| Test Python | `TEST_PYTHON_OCR.bat` |
| Install deps | `npm install` and `pip install -r python-backend/requirements.txt` |
| Check health | Visit `http://localhost:5555/health` |
| View logs | Look for `[PyWinAuto]` and `[OCR]` in console |
| Stop app | Press `Ctrl+C` in terminal |

---

## Support

- **Documentation**: `README.md`, `MIGRATION_PLAN.md`
- **Instructions for AI**: `AI_CODER_INSTRUCTIONS.md`
- **Architecture**: `ARCHITECTURE_DIAGRAM.txt`
- **Tests**: `test-pywinauto.js`, `test-migration.js`

---

**Ready to go!** Just double-click `RUN_APP.bat` to start! 🚀