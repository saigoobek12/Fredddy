# Setup Checklist for Freddy Assistant

## ✅ Pre-Launch Checklist

### Step 1: Prerequisites
- [ ] Python 3.8+ installed (`python --version`)
- [ ] Node.js installed (`node --version`)
- [ ] Git installed (optional, for version control)

### Step 2: Get API Key
Choose ONE:
- [ ] OpenRouter key from https://openrouter.ai/keys
- [ ] Groq key from https://console.groq.com/keys
- [ ] Gemini key from https://aistudio.google.com/apikey

### Step 3: Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Add API key to `.env` file
- [ ] (Optional) Add `PYWINAUTO_ENABLED=1` to `.env`

### Step 4: Install Dependencies
- [ ] Python: `pip install -r python-backend/requirements.txt`
- [ ] Node.js: `npm install`

### Step 5: Test Components
- [ ] Test Python service: Run `TEST_PYTHON_OCR.bat`
- [ ] Visit http://localhost:5555/health (should show "healthy")
- [ ] Test Node integration: `node test-pywinauto.js`

### Step 6: Launch
- [ ] Run `RUN_APP.bat` or `npm start`
- [ ] Look for `[PyWinAuto] Service initialized` message
- [ ] See transparent overlay bottom-right

---

## ✅ First Use Checklist

### When App Launches:
- [ ] Transparent overlay visible (bottom-right corner)
- [ ] Console shows `[assistant] AI provider: ...`
- [ ] Console shows `[PyWinAuto] Service initialized` (if enabled)
- [ ] No error messages

### Testing the App:
- [ ] Click on chat widget (bottom-right)
- [ ] Type: "how do I save a file?"
- [ ] Press Enter
- [ ] Wait for response (3-5 seconds first time)
- [ ] See steps appear with spotlight
- [ ] Press Enter to advance through steps
- [ ] Press Esc to cancel

### Expected Console Output:
```
[assistant] AI provider: OpenRouter
[PyWinAuto] Starting PyWinAuto OCR service...
[PyWinAuto] Service initialized successfully
[PyWinAuto] Retrieved 47 native elements
[PyWinAuto] Location results: 3/3 located
[OCR] Location method stats: {pywinauto: 2, python-ocr: 1, ai: 0}
```

---

## ✅ Troubleshooting Checklist

### If App Won't Start:
- [ ] Check `.env` file exists
- [ ] Check API key is set in `.env`
- [ ] Run `npm install` again
- [ ] Check for error messages in console

### If Python Service Fails:
- [ ] Run Command Prompt as Administrator
- [ ] Reinstall Python deps: `pip install -r python-backend/requirements.txt`
- [ ] Check Python version: `python --version` (need 3.8+)
- [ ] Try manual start: `cd python-backend && python start_service.py`

### If OCR Not Working:
- [ ] Check `PYWINAUTO_ENABLED=1` in `.env`
- [ ] Verify Python service started (look for `[PyWinAuto]` messages)
- [ ] Test service: Visit http://localhost:5555/health
- [ ] Check console for error messages

### If Elements Not Found:
- [ ] Normal for web browsers (uses OCR fallback)
- [ ] Normal for custom apps (uses AI boxes)
- [ ] Best results with native Windows apps (Notepad, File Explorer, etc.)

---

## ✅ Performance Checklist

### Expected Performance:
- [ ] First request: 3-8 seconds (service warmup)
- [ ] Subsequent requests: 1-3 seconds
- [ ] PyWinAuto detection: ~100-500ms
- [ ] Python OCR fallback: ~1-2 seconds

### If Too Slow:
- [ ] Keep app running (don't restart frequently)
- [ ] Use Groq API (fastest vision model)
- [ ] Check Python service is running (not restarting)
- [ ] Reduce screenshot size if possible

---

## ✅ Feature Checklist

### What Works:
- [x] Screen-aware tutorials
- [x] Native Windows UI detection (PyWinAuto)
- [x] Python Tesseract OCR fallback
- [x] AI vision model planning
- [x] Spotlight walkthrough
- [x] Multi-step tutorials
- [x] Click-through overlay

### What's In Progress:
- [ ] Complete Tesseract.js removal (migration)
- [ ] Additional element types
- [ ] Multi-monitor support
- [ ] Element state tracking
- [ ] Automation features

---

## ✅ Files Overview

### Ready to Use:
- [x] `RUN_APP.bat` - Start app
- [x] `TEST_PYTHON_OCR.bat` - Test Python
- [x] `HOW_TO_RUN.md` - Full instructions
- [x] `QUICK_START.txt` - Quick reference
- [x] `python-backend/ocr_service.py` - Python OCR
- [x] `locator-pywinauto.js` - Enhanced locator
- [x] `main.js` - Main app
- [x] `.env.example` - Config template

### For Migration (Optional):
- [x] `AI_CODER_INSTRUCTIONS.md` - For AI models
- [x] `MIGRATION_PLAN.md` - Technical details
- [x] `ARCHITECTURE_DIAGRAM.txt` - System design
- [x] `test-migration.js` - Migration tests

---

## ✅ Next Steps

### To Use Immediately:
1. [ ] Complete checklist above
2. [ ] Run `RUN_APP.bat`
3. [ ] Start using!

### To Complete Migration (Optional):
1. [ ] Read `AI_CODER_INSTRUCTIONS.md`
2. [ ] Follow steps 1-10
3. [ ] Or give to AI model to complete
4. [ ] Run `test-migration.js` to verify

### To Customize:
1. [ ] Edit `.env` for settings
2. [ ] Modify `python-backend/config.json` for Python service
3. [ ] Adjust priorities in `.env`: `OCRLOCATION_PRIORITY=...`

---

## 📊 Status

**Current Mode**: HYBRID (Both OCR systems available)
**PyWinAuto**: ✅ Integrated and working
**Tesseract.js**: ✅ Still present (legacy)
**Migration**: ⏸️ Paused (can resume anytime)

**You can use the app right now!** Just run `RUN_APP.bat` 🚀