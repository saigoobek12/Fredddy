# COMPLETE MIGRATION PLAN: Remove Old Tesseract.js, Replace with PyWinAuto OCR

## Executive Summary

This plan outlines the complete removal of the old Tesseract.js-based OCR system and replacement with PyWinAuto as the primary OCR tracking system. The new system provides native Windows UI element detection with optional Tesseract fallback.

---

## Current State Analysis

### Old System (Tesseract.js - TO BE REMOVED)
- **File**: `locator.js` (323 lines)
- **Dependency**: `tesseract.js` npm package
- **Language Data**: `tessdata/eng.traineddata` (4.9MB)
- **Method**: Image-based OCR text recognition
- **Accuracy**: ~70% for text elements
- **Speed**: 500ms - 2s per screenshot
- **Limitations**: 
  - Text-only detection
  - No UI element metadata
  - No automation IDs
  - Fails with icons/images

### New System (PyWinAuto - PRIMARY)
- **Files**: 
  - `python-backend/ocr_service.py` (Python service)
  - `locator-pywinauto.js` (Node.js bridge)
  - `python-ipc.js` (IPC communication)
- **Dependencies**: Python packages (pywinauto, flask, etc.)
- **Method**: Windows UIA/Accessibility APIs + Optional OCR
- **Accuracy**: ~95% for native Windows applications
- **Speed**: 100-500ms after startup
- **Advantages**:
  - Native UI element detection
  - Rich metadata (automation IDs, control types)
  - Real-time element tracking
  - Extensible for automation

---

## Migration Strategy

### Option A: Complete Replacement (RECOMMENDED)
**Timeline**: 2-3 hours
**Risk**: Medium
**Benefit**: Clean codebase, best performance

**Steps**:
1. Make PyWinAuto primary OCR system
2. Remove Tesseract.js completely
3. Keep minimal Tesseract Python fallback in PyWinAuto service
4. Update all references throughout codebase

### Option B: Hybrid Approach (CURRENT STATE)
**Timeline**: Already implemented
**Risk**: Low
**Drawback**: Code duplication, larger bundle size

**Current State**:
- Both systems coexist
- PyWinAuto is optional (requires env flag)
- Tesseract.js always bundled

---

## Detailed Implementation Plan

### PHASE 1: Prepare PyWinAuto as Primary System
**Duration**: 30 minutes
**Goal**: Ensure PyWinAuto can handle all use cases

#### Step 1.1: Enhance PyWinAuto Service with OCR Fallback
**File**: `python-backend/ocr_service.py`
**Action**: ADD Tesseract Python integration as fallback

```python
# Add to ocr_service.py after line 15
import pytesseract
from PIL import Image, ImageGrab

# Add new method to PyWinAutoOCRService class (around line 250)
def ocr_text_from_image(self, image_buffer):
    """Use pytesseract as fallback for text-only elements"""
    try:
        img = Image.open(BytesIO(image_buffer))
        text_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        return self._parse_tesseract_data(text_data)
    except Exception as e:
        logger.error(f"Tesseract OCR failed: {e}")
        return []
```

**Why**: Provides Tesseract OCR capability within Python service, eliminating need for separate Tesseract.js

#### Step 1.2: Update PyWinAuto Locator Priority

**File**: `locator-pywinauto.js`
**Action**: MODIFY to make PyWinAuto primary, remove Tesseract.js calls

**Lines to Change**:
- Line 32: Change default `enabled: false` → `enabled: true`
- Line 33: Change priority to `pywinauto,python-ocr,ai`
- Line 211-225: Remove `_locateWithTesseract()` method (uses Tesseract.js)
- Replace with `_locateWithPythonOCR()` method (calls Python service)

**New Method**:
```javascript
async _locateWithPythonOCR(step, screenshotBase64, dimensions) {
    try {
        const response = await this.pywinautoService.ocrTextFromImage(screenshotBase64);
        // Parse response and locate text
        return this._parseOCRResults(response, step, dimensions);
    } catch (error) {
        logger.error('Python OCR failed:', error);
        return null;
    }
}
```

---

### PHASE 2: Remove Tesseract.js Dependencies
**Duration**: 20 minutes
**Goal**: Clean up old OCR system files and dependencies

#### Step 2.1: Remove Tesseract.js from package.json
**File**: `package.json`
**Action**: REMOVE dependency

**Line 21-23** (Current):
```json
"dependencies": {
  "tesseract.js": "^7.0.0"
}
```

**Change to**:
```json
"dependencies": {}
```

**Why**: Reduces bundle size by ~5MB, removes unused dependency

#### Step 2.2: Archive Old Locator File
**File**: `locator.js`
**Action**: RENAME to `locator-legacy.js.bak`

**Command**:

```bash
mv locator.js locator-legacy.js.bak
```

**Why**: Keeps backup of old system, but removes from active codebase

#### Step 2.3: Remove Tesseract Language Data (Optional)
**Directory**: `tessdata/`
**Files**: `eng.traineddata` (4.9MB)
**Action**: DELETE or KEEP for reference

**Options**:
1. **DELETE** - Free up 4.9MB, clean install
2. **KEEP** - Useful for debugging, reference comparison

**Recommendation**: KEEP initially, delete after testing phase

---

### PHASE 3: Update Main Application References
**Duration**: 30 minutes
**Goal**: Route all OCR requests through PyWinAuto system

#### Step 3.1: Update main.js Imports
**File**: `main.js`
**Line 8** (Current):
```javascript
const { locateSteps } = require('./locator');
const { getPyWinAutoLocator } = require('./locator-pywinauto');
```

**Change to**:
```javascript
// OLD: const { locateSteps } = require('./locator'); // REMOVED
const { getPyWinAutoLocator, locateSteps } = require('./locator-pywinauto');
```

**Why**: Use PyWinAuto as primary locator, export unified interface

#### Step 3.2: Simplify OCR Logic in main.js
**File**: `main.js`
**Lines 118-154** (Current - Complex conditional):
```javascript
const usePyWinAuto = process.env.PYWINAUTO_ENABLED === '1';

if (usePyWinAuto) {
  // PyWinAuto logic
} else {
  // Tesseract.js logic
}
```

**Change to** (Simplified):

```javascript
// Enhanced element location using PyWinAuto (native Windows UI + OCR fallback)
sendStatus('thinking', 'Locating elements on screen…');
try {
  const result = await locateSteps(
    steps,
    shot.buffer,
    { width: shot.width, height: shot.height },
    {
      langPath: path.join(__dirname, 'tessdata'), // Not used anymore
      gzip: false,
      cachePath: tessCachePath()
    }
  );
  
  steps = result.steps;
  
  // Log location statistics
  if (result.methodStats) {
    console.log('[OCR] Location method stats:', result.methodStats);
    console.log('[OCR] Average confidence:', result.confidence);
  }
} catch (error) {
  console.error('Element location failed:', error);
  // Keep the AI boxes if location refinement fails
}
```

**Why**: Single code path, cleaner logic, PyWinAuto handles all fallbacks internally

#### Step 3.3: Update Environment Variable Defaults
**File**: `.env.example`
**Lines 29-33** (Current):
```env
# PYWINAUTO_ENABLED=0   # 0 = disabled (default), 1 = enabled
```

**Change to**:
```env
# PYWINAUTO_ENABLED=1   # 1 = enabled (default), 0 = legacy mode
```

**File**: `locator-pywinauto.js`
**Line 32**:
```javascript
enabled: process.env.PYWINAUTO_ENABLED !== '0',  // Enabled by default
```

**Why**: Makes PyWinAuto default, opts-in users automatically

---

### PHASE 4: Enhance locator-pywinauto.js

**Duration**: 40 minutes
**Goal**: Make PyWinAuto locator feature-complete replacement

#### Step 4.1: Add Text Matching Functions from Old Locator
**File**: `locator-pywinauto.js`
**Action**: COPY useful utility functions from `locator.js`

**Functions to Port**:
1. `editDistance()` - Levenshtein distance (ALREADY EXISTS as `_calculateTextSimilarity`)
2. `fallbackPhrases()` - Extract phrases from titles (ADD NEW)
3. `wordMatches()` - Fuzzy word matching (ADD NEW)
4. `nearestWord()` - Snap to nearest text (ADD NEW)

**Add after line 450**:
```javascript
/**
 * Port of fallbackPhrases from old locator
 * Mine candidate phrases from title/desc when target not found
 */
_fallbackPhrases(step) {
    const phrases = [];
    const text = `${step.title || ''} \u0001 ${step.desc || ''}`;
    
    // Extract quoted strings (model often quotes exact UI labels)
    const quoted = text.match(/["'\u2018\u2019\u201c\u201d]([^"'\u2018\u2019\u201c\u201d]{2,40})["'\u2018\u2019\u201c\u201d]/g) || [];
    quoted.forEach((q) => {
        const words = this._normalizeText(q).split(' ').filter(Boolean);
        if (words.length) phrases.push(words.join(' '));
    });
    
    // Extract significant individual tokens
    const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'click', 'select', 'open']);
    this._normalizeText(text)
        .split(' ')
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
        .forEach((w) => phrases.push(w));
    
    return phrases;
}
```

**Why**: Improves text matching accuracy for complex UI labels

#### Step 4.2: Add Python OCR Fallback Method
**File**: `locator-pywinauto.js`
**Action**: REPLACE Tesseract.js calls with Python OCR


**Lines 205-225** (Current Tesseract.js method):
```javascript
async _locateWithTesseract(step, screenshotBase64, dimensions, options) {
    const { createWorker } = require('tesseract.js');
    // Uses Node.js Tesseract.js library
}
```

**Replace with**:
```javascript
async _locateWithPythonOCR(step, screenshotBase64, dimensions) {
    try {
        // Call Python service OCR endpoint
        const response = await this.pywinautoService._request(
            'POST',
            '/ocr/text-locate',
            {
                screenshot: screenshotBase64,
                target: step.target,
                targetBox: step.box,
                dimensions: dimensions
            }
        );
        
        if (response && response.located) {
            return {
                box: response.normalizedBox,
                confidence: response.confidence || 0.7,
                elementInfo: {
                    method: 'python-ocr',
                    matchedText: response.matchedText
                }
            };
        }
        
        return null;
    } catch (error) {
        console.error('[PyWinAuto] Python OCR failed:', error.message);
        return null;
    }
}
```

**Why**: Centralizes all OCR in Python service, removes Node.js dependency

#### Step 4.3: Update Priority Chain
**File**: `locator-pywinauto.js`
**Line 33**:
```javascript
priority: (process.env.OCRLOCATION_PRIORITY || 'pywinauto,python-ocr,ai').split(','),
```

**Update line 185** to use new method:

```javascript
// Try Python OCR if PyWinAuto failed
if (!locatedInfo && this.options.priority.includes('python-ocr')) {
    locatedInfo = await this._locateWithPythonOCR(step, screenshotBase64, dimensions);
    if (locatedInfo) {
        locationMethod = 'python-ocr';
        confidence = locatedInfo.confidence || 0.7;
    }
}
```

**Why**: Clean fallback chain entirely within Python ecosystem

---

### PHASE 5: Update Python OCR Service
**Duration**: 45 minutes
**Goal**: Add Tesseract OCR capability to Python service

#### Step 5.1: Add OCR Text Location Endpoint
**File**: `python-backend/ocr_service.py`
**Action**: ADD new Flask route for OCR text location

**Add after line 550** (after `/analyze-screen` route):
```python
@app.route('/ocr/text-locate', methods=['POST'])
def ocr_text_locate():
    """Locate text on screenshot using Tesseract OCR"""
    try:
        data = request.json
        screenshot_base64 = data.get('screenshot')
        target_text = data.get('target', '')
        target_box = data.get('targetBox', [])
        dimensions = data.get('dimensions', {})
        
        if not screenshot_base64 or not target_text:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Decode screenshot
        img_data = base64.b64decode(screenshot_base64)
        img = Image.open(BytesIO(img_data))
        
        # Run Tesseract OCR
        ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        
        # Find matching text
        result = ocr_service._locate_text_in_ocr_data(
            ocr_data,
            target_text,
            target_box,
            dimensions
        )
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"OCR text locate error: {e}")
        return jsonify({"error": str(e)}), 500
```


**Why**: Provides OCR capability within Python service

#### Step 5.2: Add OCR Helper Method
**File**: `python-backend/ocr_service.py`
**Action**: ADD helper method to PyWinAutoOCRService class

**Add after line 250** (in PyWinAutoOCRService class):
```python
def _locate_text_in_ocr_data(self, ocr_data, target_text, target_box, dimensions):
    """
    Find target text in Tesseract OCR data
    Returns normalized box if found
    """
    target_lower = target_text.lower()
    W = dimensions.get('width', 1920)
    H = dimensions.get('height', 1080)
    
    # Extract words with confidence > 40
    n_boxes = len(ocr_data['text'])
    candidates = []
    
    for i in range(n_boxes):
        text = ocr_data['text'][i].strip()
        conf = int(ocr_data['conf'][i])
        
        if conf < 40 or not text:
            continue
        
        if target_lower in text.lower():
            left = ocr_data['left'][i]
            top = ocr_data['top'][i]
            width = ocr_data['width'][i]
            height = ocr_data['height'][i]
            
            # Calculate normalized box
            norm_box = [
                max(0, min(1000, (top / H) * 1000)),
                max(0, min(1000, (left / W) * 1000)),
                max(0, min(1000, ((top + height) / H) * 1000)),
                max(0, min(1000, ((left + width) / W) * 1000))
            ]
            
            candidates.append({
                'text': text,
                'box': norm_box,
                'confidence': conf / 100.0,
                'rect': [left, top, left + width, top + height]
            })
    
    if not candidates:
        return {'located': False}
    
    # Pick best candidate (nearest to target box if provided)
    best = self._pick_nearest_candidate(candidates, target_box, W, H)
    
    return {
        'located': True,
        'normalizedBox': best['box'],
        'confidence': best['confidence'],
        'matchedText': best['text']
    }
```


**Why**: Core OCR text matching logic, Python-native implementation

---

### PHASE 6: Update Documentation
**Duration**: 20 minutes
**Goal**: Reflect new architecture in documentation

#### Step 6.1: Update README.md
**File**: `README.md`
**Action**: UPDATE architecture description

**Find section** (around line 25):
```markdown
### Two-stage targeting (vision + OCR)
```

**Replace with**:
```markdown
### Three-stage targeting (vision + Native UI + OCR)

The assistant uses a sophisticated three-stage element location strategy:

1. **WHAT to do — AI Vision Model** (`planner.generateTutorial()`)
   - Sends screenshot to vision model (Gemini/Groq/OpenRouter)
   - Returns ordered tutorial steps with target descriptions
   - Each step includes target text, kind (button/text/icon), and rough box

2. **WHERE it is — Native Windows UI** (`locator-pywinauto.js`)
   - Uses PyWinAuto to detect native Windows UI elements
   - Gets exact coordinates via Windows accessibility APIs
   - Captures automation IDs, control types, element hierarchy
   - **~95% accuracy** for standard Windows applications
   - Falls back to OCR for custom/non-native UI

3. **OCR Fallback — Python Tesseract** (`python-backend/ocr_service.py`)
   - Uses pytesseract for text-based element location
   - Finds text patterns in screenshot when native detection fails
   - **~70% accuracy** for text elements
   - Useful for web apps, custom UI, image-based controls

The language data ships in Python environment, so OCR works **offline**.
```

**Why**: Accurately reflects new three-tier architecture

#### Step 6.2: Update Installation Instructions
**File**: `README.md`
**Section**: "Configuration"

**Add before existing .env setup**:

```markdown
## Prerequisites

### Python Setup (Required for OCR)

The assistant uses Python-based OCR for enhanced element detection:

1. Install Python 3.8 or later from [python.org](https://www.python.org/downloads/)
2. Install Python dependencies:
   ```bash
   # Run setup script (Windows)
   setup-pywinauto.bat
   
   # Or manually
   cd python-backend
   python -m pip install -r requirements.txt
   ```

3. The Python OCR service starts automatically when you run the app

**Note**: The app will fall back to AI-only mode if Python is unavailable,
but OCR significantly improves element location accuracy.
```

**Why**: Makes Python setup explicit requirement

#### Step 6.3: Remove Old Tesseract.js References
**File**: `README.md`
**Action**: REMOVE/UPDATE references to Tesseract.js

**Search for**:
- "tesseract.js" (replace with "pytesseract")
- "Tesseract worker" (replace with "Python OCR service")
- "bundled language data" (update to "Python environment")
- "no CDN download" (still accurate)

**Why**: Removes confusion about which OCR system is used

---

### PHASE 7: Testing & Validation
**Duration**: 45 minutes
**Goal**: Ensure new system works correctly

#### Step 7.1: Create Migration Test Script
**File**: `test-migration.js` (NEW FILE)

```javascript
#!/usr/bin/env node
/**
 * Test script to validate Tesseract.js removal
 * and PyWinAuto OCR functionality
 */

const fs = require('node:fs');
const path = require('node:path');

async function testMigration() {
    console.log('Testing PyWinAuto Migration...\n');
    
    // Test 1: Verify old files removed
    console.log('1. Checking old system removed...');
    const oldFiles = [
        'locator.js',
        'node_modules/tesseract.js'
    ];
    
    for (const file of oldFiles) {
        const exists = fs.existsSync(path.join(__dirname, file));
        if (exists) {
            console.log(`  ✗ ${file} still exists (should be removed)`);
        } else {
            console.log(`  ✓ ${file} removed`);
        }
    }
    
    // Test 2: Verify new system exists
    console.log('\n2. Checking new system files...');
    const newFiles = [
        'locator-pywinauto.js',
        'python-ipc.js',
        'python-backend/ocr_service.py'
    ];
    
    for (const file of newFiles) {
        const exists = fs.existsSync(path.join(__dirname, file));
        console.log(`  ${exists ? '✓' : '✗'} ${file}`);
    }
    
    // Test 3: Try to load PyWinAuto system
    console.log('\n3. Testing PyWinAuto system load...');
    try {
        const { locateSteps } = require('./locator-pywinauto');
        console.log('  ✓ PyWinAuto locator loaded successfully');
    } catch (error) {
        console.log(`  ✗ Failed to load: ${error.message}`);
    }
    
    console.log('\nMigration test complete!');
}

testMigration().catch(console.error);
```

**Why**: Automated validation of migration steps


#### Step 7.2: Manual Testing Checklist

**Test Scenario 1**: Native Windows Application (e.g., Notepad)
- [ ] Start app with PyWinAuto enabled
- [ ] Ask: "how do I save a file"
- [ ] Verify: Detects "File" menu with PyWinAuto
- [ ] Verify: Console shows `[PyWinAuto]` messages
- [ ] Verify: Spotlight correctly highlights elements

**Test Scenario 2**: Web Browser (Chrome/Edge)
- [ ] Open browser with web page
- [ ] Ask: "how do I click the search button"
- [ ] Verify: Falls back to Python OCR for text
- [ ] Verify: Console shows fallback message
- [ ] Verify: Still locates elements correctly

**Test Scenario 3**: Python Service Down
- [ ] Stop Python service manually
- [ ] Ask tutorial question
- [ ] Verify: Falls back to AI boxes gracefully
- [ ] Verify: Error message shown to user
- [ ] Verify: App doesn't crash

**Test Scenario 4**: Fresh Install
- [ ] Clone repo to new directory
- [ ] Run `npm install`
- [ ] Run `setup-pywinauto.bat`
- [ ] Verify: Python dependencies install
- [ ] Verify: App starts successfully

---

### PHASE 8: Cleanup & Optimization
**Duration**: 15 minutes
**Goal**: Remove dead code, optimize bundle

#### Step 8.1: Remove tesseract.js from package-lock.json
**File**: `package-lock.json`
**Action**: DELETE tesseract.js entry

```bash
npm uninstall tesseract.js
```

**Why**: Cleans npm lock file, reduces install time

#### Step 8.2: Update .gitignore
**File**: `.gitignore`
**Action**: ADD legacy file patterns

**Append**:
```
# Legacy OCR system (removed)
locator-legacy.js.bak
tessdata/eng.traineddata.bak
```

**Why**: Prevents accidental commit of backup files

#### Step 8.3: Verify Bundle Size Reduction
**Command**:
```bash
npm run package:win
```

**Expected**:
- **Before**: ~150MB (with tesseract.js + WASM)
- **After**: ~145MB (5MB reduction)

**Why**: Confirms successful removal of old system

---

### PHASE 9: Update Build Scripts
**Duration**: 10 minutes
**Goal**: Ensure Python backend bundled correctly

#### Step 9.1: Update package.json Build Script
**File**: `package.json`
**Line 7** (package:win script):

**Current**:
```json
"package:win": "electron-packager . FredAssistant --platform=win32 --arch=x64 --out=dist --overwrite --asar=false --prune=true --ignore=\"(^/dist$|^/\\.git|test-|\\.md$|secret_to_upload)\""
```

**Update to**:
```json
"package:win": "electron-packager . FredAssistant --platform=win32 --arch=x64 --out=dist --overwrite --asar=false --prune=true --ignore=\"(^/dist$|^/\\.git|test-|\\.md$|secret_to_upload|locator-legacy)\"",
"package:win:python": "npm run package:win && cd dist/FredAssistant-win32-x64 && mkdir python-backend && xcopy /E /I ..\\..\\python-backend python-backend"
```

**Why**: Excludes legacy files, includes Python backend in distribution

---

## File Directory Structure (After Migration)

### Root Directory
```
Freddy/
├── .env.example              # Updated with PyWinAuto defaults
├── .gitignore               # Updated to exclude legacy files
├── ipc-channels.js          # Updated with PyWinAuto channels
├── locator-pywinauto.js     # PRIMARY OCR locator (enhanced)
├── locator-legacy.js.bak    # OLD SYSTEM (archived)

├── main.js                  # Updated to use PyWinAuto primary
├── package.json             # tesseract.js REMOVED
├── planner.js               # No changes needed
├── preload.js               # No changes needed
├── python-ipc.js            # IPC bridge to Python
├── README.md                # Updated architecture docs
├── setup-pywinauto.bat      # Setup script
├── test-migration.js        # NEW: Migration validation
├── test-pywinauto.js        # Integration tests
├── verify-integration.js    # Setup verification
│
├── python-backend/
│   ├── config.json          # Service configuration
│   ├── ocr_service.py       # ENHANCED: Added OCR endpoints
│   ├── requirements.txt     # Python dependencies
│   └── start_service.py     # Service launcher
│
├── renderer/
│   ├── overlay.html         # No changes needed
│   └── overlay.js           # No changes needed
│
└── tessdata/                # OPTIONAL: Can be removed
    └── eng.traineddata      # Not used anymore (Python has its own)
```

### Package.json Dependencies (After)
```json
{
  "dependencies": {
    // tesseract.js REMOVED
  },
  "devDependencies": {
    "@electron/packager": "^20.0.1",
    "electron": "^31.7.7"
  }
}
```

### Python Dependencies (requirements.txt)
```txt
pywinauto>=0.6.8        # Native Windows UI automation
pytesseract>=0.3.10     # OCR text detection (NEW)
Pillow>=10.0.0          # Image processing
flask>=3.0.0            # REST API server
flask-cors>=4.0.0       # CORS support
requests>=2.31.0        # HTTP client
numpy>=1.24.0           # Numerical operations
pytest>=7.4.0           # Testing
```

---

## Detailed Code Changes Checklist

### 1. `locator-pywinauto.js` Changes
**Lines to Modify**:
- [ ] Line 32: Change `enabled: false` → `enabled: true`
- [ ] Line 33: Change priority to `'pywinauto,python-ocr,ai'`
- [ ] Line 211-225: REMOVE `_locateWithTesseract()` method
- [ ] Line 226: ADD `_locateWithPythonOCR()` method (50 lines)
- [ ] Line 450: ADD `_fallbackPhrases()` helper (30 lines)
- [ ] Line 185: UPDATE to call `_locateWithPythonOCR()`

**Total Changes**: ~80 lines modified/added, ~20 lines removed

### 2. `python-backend/ocr_service.py` Changes
**Lines to Add**:
- [ ] After line 15: ADD `import pytesseract`
- [ ] After line 250: ADD `_locate_text_in_ocr_data()` method (60 lines)
- [ ] After line 310: ADD `_pick_nearest_candidate()` helper (30 lines)
- [ ] After line 550: ADD `/ocr/text-locate` Flask route (40 lines)

**Total Changes**: ~130 lines added

### 3. `main.js` Changes
**Lines to Modify**:
- [ ] Line 8: UPDATE imports (remove old locator)
- [ ] Line 118-154: SIMPLIFY OCR logic (remove conditional)
- [ ] Line 125: UPDATE status messages

**Total Changes**: ~15 lines modified, ~20 lines removed

### 4. `package.json` Changes
- [ ] Line 21-23: REMOVE tesseract.js dependency
- [ ] Line 7: UPDATE package:win script

**Total Changes**: 2 lines modified

### 5. `README.md` Changes
- [ ] Line 25-45: UPDATE architecture section
- [ ] Line 50-70: ADD Python prerequisites
- [ ] Search & replace: All "tesseract.js" → "pytesseract"

**Total Changes**: ~50 lines modified/added

---

## Migration Risks & Mitigation

### Risk 1: Python Not Installed
**Impact**: High - App won't work at all
**Mitigation**:
- Add clear Python installation instructions
- Check Python availability on startup
- Show user-friendly error message with download link
- Provide fallback to AI-only mode

**Code** (add to `main.js` startup):

```javascript
app.whenReady().then(async () => {
  console.log(`[assistant] AI provider: ${activeProviderLabel()}`);
  
  // Check Python availability
  const pyLocator = getPyWinAutoLocator();
  const pyStatus = await pyLocator.getServiceStatus();
  
  if (!pyStatus.available) {
    console.warn('[WARNING] Python OCR service unavailable');
    console.warn('[WARNING] Install Python 3.8+ for better accuracy');
    console.warn('[WARNING] Download: https://www.python.org/downloads/');
    console.warn('[WARNING] Falling back to AI-only mode...');
  } else {
    console.log('[assistant] Python OCR service ready');
  }
  
  registerIpcHandlers();
  overlayWindow = createOverlayWindow();
});
```

### Risk 2: Python Dependencies Installation Fails
**Impact**: Medium - Manual setup required
**Mitigation**:
- Provide detailed error messages
- Create automated installer script
- Pre-bundle Python wheels for common platforms
- Document manual installation steps

### Risk 3: Performance Regression
**Impact**: Low - Python startup overhead
**Mitigation**:
- Keep Python service running (don't restart each request)
- Implement element caching
- Use lightweight Flask server
- Profile and optimize hot paths

**Benchmark Target**:
- First request: < 3 seconds (service startup)
- Subsequent: < 500ms (cached)

### Risk 4: User Migration Issues
**Impact**: Medium - Existing users need to update
**Mitigation**:
- Provide clear upgrade instructions
- Keep backwards compatibility for 1 version
- Add migration script that auto-detects setup
- Update documentation with migration guide

---

## Rollback Plan

If migration causes critical issues:

### Quick Rollback (5 minutes)
1. Restore `locator.js` from `locator-legacy.js.bak`
2. Restore `package.json` (add tesseract.js back)
3. Run `npm install tesseract.js`
4. Update `main.js` line 8: `require('./locator')`
5. Set `PYWINAUTO_ENABLED=0` in .env

### Complete Rollback (15 minutes)
```bash
git checkout HEAD~1 -- locator.js package.json main.js
npm install
```

---

## Success Criteria

Migration is successful when:

✅ **Functionality**
- [ ] Native Windows apps detected with >90% accuracy
- [ ] Web apps detected with >70% accuracy via OCR fallback
- [ ] Tutorial walkthrough works end-to-end
- [ ] No crashes or fatal errors

✅ **Performance**
- [ ] Element location < 500ms after service warmup
- [ ] Bundle size reduced by ~5MB
- [ ] Memory usage < 200MB total

✅ **User Experience**
- [ ] Setup completed in < 5 minutes
- [ ] Clear error messages if Python missing
- [ ] Graceful degradation if service down

✅ **Code Quality**
- [ ] No tesseract.js references remain
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Code follows project style

---

## Post-Migration Tasks

### Week 1: Monitoring
- [ ] Monitor error logs for issues
- [ ] Collect user feedback
- [ ] Fix any critical bugs
- [ ] Update docs based on feedback

### Week 2: Optimization
- [ ] Profile Python service performance
- [ ] Optimize element caching
- [ ] Reduce memory footprint
- [ ] Add performance metrics

### Month 1: Enhancement
- [ ] Add more UI element types
- [ ] Improve OCR accuracy
- [ ] Add element state tracking
- [ ] Consider adding automation features

---

## Timeline Summary

| Phase | Duration | Complexity | Risk |
|-------|----------|------------|------|
| 1. Prepare PyWinAuto | 30 min | Medium | Low |
| 2. Remove Tesseract.js | 20 min | Low | Low |
| 3. Update Main App | 30 min | Medium | Medium |
| 4. Enhance Locator | 40 min | High | Medium |
| 5. Update Python Service | 45 min | High | Medium |
| 6. Update Docs | 20 min | Low | Low |
| 7. Testing | 45 min | Medium | Low |
| 8. Cleanup | 15 min | Low | Low |
| 9. Build Scripts | 10 min | Low | Low |
| **TOTAL** | **~4 hours** | **Medium-High** | **Medium** |

---

## Execution Order (Step-by-Step)


For another coder to execute this plan:

1. **Backup Current State** (5 min)
   ```bash
   git checkout -b migration-remove-tesseract
   git add .
   git commit -m "Backup before Tesseract.js removal"
   ```

2. **Phase 5: Update Python Service First** (45 min)
   - Modify `python-backend/ocr_service.py`
   - Add OCR endpoint and helpers
   - Test Python service independently

3. **Phase 4: Enhance locator-pywinauto.js** (40 min)
   - Add Python OCR fallback method
   - Port utility functions from old locator
   - Update priority chain

4. **Phase 3: Update Main Application** (30 min)
   - Modify `main.js` imports and logic
   - Update `.env.example` defaults
   - Simplify OCR routing

5. **Phase 2: Remove Old System** (20 min)
   - Archive `locator.js` → `locator-legacy.js.bak`
   - Remove tesseract.js from package.json
   - Run `npm uninstall tesseract.js`

6. **Phase 7: Test Everything** (45 min)
   - Create `test-migration.js`
   - Run manual test scenarios
   - Fix any bugs found

7. **Phase 6: Update Documentation** (20 min)
   - Update README.md
   - Update .env.example
   - Add migration notes

8. **Phase 8-9: Cleanup & Build** (25 min)
   - Clean up dead code
   - Update build scripts
   - Test package creation

9. **Final Validation** (10 min)
   ```bash
   npm run package:win
   test dist/FredAssistant-win32-x64/FredAssistant.exe
   ```

10. **Commit & Document** (10 min)
    ```bash
    git add .
    git commit -m "Complete migration: Remove Tesseract.js, PyWinAuto primary"
    git tag -a v2.0.0 -m "PyWinAuto OCR system"
    ```

---

## Key Files Summary

### Files to MODIFY:
1. `python-backend/ocr_service.py` - Add OCR endpoints (+130 lines)
2. `locator-pywinauto.js` - Add Python OCR fallback (+80 lines, -20 lines)
3. `main.js` - Simplify OCR logic (+15 lines, -20 lines)
4. `package.json` - Remove tesseract.js (-3 lines)
5. `README.md` - Update architecture (+50 lines)
6. `.env.example` - Update defaults (+5 lines)

### Files to CREATE:
1. `test-migration.js` - Migration validation script (50 lines)

### Files to REMOVE/ARCHIVE:
1. `locator.js` → `locator-legacy.js.bak`
2. `node_modules/tesseract.js/*` (via npm uninstall)
3. (Optional) `tessdata/eng.traineddata`

### Files UNCHANGED:
- `preload.js`
- `planner.js`
- `renderer/overlay.html`
- `renderer/overlay.js`
- `ipc-channels.js` (already updated)

---

## Environment Variables (Updated Defaults)

**New .env Template**:
```env
# AI Provider (required)
OPENROUTER_API_KEY=your_key_here

# PyWinAuto OCR (enabled by default)
PYWINAUTO_ENABLED=1              # Changed from 0
PYWINAUTO_PORT=5555
PYWINAUTO_BACKEND=uia
OCRLOCATION_PRIORITY=pywinauto,python-ocr,ai  # Changed from pywinauto,tesseract,ai

# Overlay settings
OVERLAY_INTERACTIVE=0
```

---

## Questions for Code Review

Before executing migration, verify:

1. **Is Python 3.8+ available on target systems?**
   - If no: Add Python runtime bundler

2. **Should we keep tesseract.js as emergency fallback?**
   - Recommendation: No, adds complexity

3. **Bundle size acceptable?** (+Python backend, -Tesseract.js = ~same size)
   - Yes: Python service is small

4. **Performance acceptable?** (100-500ms Python vs 500-2000ms Tesseract.js)
   - Yes: Significant improvement

5. **Documentation complete?**
   - Yes: README, inline comments, migration plan

---

## END OF MIGRATION PLAN

**Total Estimated Time**: 4 hours for complete migration
**Complexity Level**: Medium-High
**Risk Level**: Medium (with rollback plan)
**Recommended Approach**: Incremental with testing at each phase

**Next Steps**: Review this plan, then begin execution with Phase 5 (Python service)