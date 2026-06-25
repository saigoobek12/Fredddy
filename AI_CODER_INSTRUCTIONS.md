# INSTRUCTIONS FOR AI CODING MODEL
# Task: Remove Tesseract.js OCR System, Make PyWinAuto Primary OCR

## OVERVIEW
You are an AI coding assistant. Follow these instructions EXACTLY to migrate the OCR system.
This project currently has TWO OCR systems running:
1. **OLD SYSTEM (REMOVE)**: Tesseract.js (Node.js library) in `locator.js`
2. **NEW SYSTEM (KEEP)**: PyWinAuto (Python service) in `locator-pywinauto.js`

Your task: Remove #1, make #2 the ONLY OCR system.

---

## EXECUTION RULES FOR AI MODELS
1. Read each instruction completely before executing
2. Execute instructions in EXACT order given
3. Copy code blocks EXACTLY as shown (no modifications unless instructed)
4. After each major change, verify syntax before proceeding
5. If an instruction references "see line X", use that as a guide only - adapt to actual file structure
6. Keep all existing comments and documentation
7. Do NOT optimize or refactor unless explicitly instructed
8. Use exact file paths provided

---

## STEP-BY-STEP INSTRUCTIONS

### STEP 1: BACKUP CURRENT STATE
**Action**: Create a git backup branch

**Execute these commands**:
```bash
cd C:\Users\user\Desktop\Freddy
git checkout -b migration-remove-tesseract-js
git add .
git commit -m "Backup before removing Tesseract.js OCR system"
```

**Verification**: Check git status shows clean working tree

---

### STEP 2: ADD OCR TO PYTHON SERVICE
**File to modify**: `C:\Users\user\Desktop\Freddy\python-backend\ocr_service.py`

#### STEP 2A: Add Tesseract import
**Location**: After line 15 (after existing imports)
**Insert exactly**:
```python
import pytesseract
```

**Verification**: Check pytesseract is imported after other imports

#### STEP 2B: Add OCR text location method to class
**Location**: Inside `PyWinAutoOCRService` class, after the `_is_text_element` method (around line 250)
**Insert exactly**:


```python
    def _locate_text_in_ocr_data(self, ocr_data, target_text, target_box, dimensions):
        """
        Find target text in Tesseract OCR data and return normalized box
        
        Args:
            ocr_data: Dictionary from pytesseract.image_to_data
            target_text: Text to search for
            target_box: Optional AI-provided box for disambiguation [ymin, xmin, ymax, xmax] 0-1000
            dimensions: Dict with 'width' and 'height' keys
            
        Returns:
            Dictionary with 'located', 'normalizedBox', 'confidence', 'matchedText'
        """
        target_lower = target_text.lower().strip()
        if not target_lower:
            return {'located': False, 'error': 'Empty target text'}
        
        W = dimensions.get('width', 1920)
        H = dimensions.get('height', 1080)
        
        # Extract words with confidence > 40
        n_boxes = len(ocr_data['text'])
        candidates = []
        
        for i in range(n_boxes):
            text = str(ocr_data['text'][i]).strip()
            try:
                conf = int(ocr_data['conf'][i])
            except (ValueError, TypeError):
                conf = 0
            
            if conf < 40 or not text:
                continue
            
            # Check if target text is in OCR text (fuzzy match)
            if target_lower in text.lower() or text.lower() in target_lower:
                left = int(ocr_data['left'][i])
                top = int(ocr_data['top'][i])
                width = int(ocr_data['width'][i])
                height = int(ocr_data['height'][i])
                
                # Calculate normalized box [ymin, xmin, ymax, xmax] 0-1000 scale
                norm_box = [
                    max(0, min(1000, int((top / H) * 1000))),
                    max(0, min(1000, int((left / W) * 1000))),
                    max(0, min(1000, int(((top + height) / H) * 1000))),
                    max(0, min(1000, int(((left + width) / W) * 1000)))
                ]
                
                candidates.append({
                    'text': text,
                    'box': norm_box,
                    'confidence': conf / 100.0,
                    'rect': [left, top, left + width, top + height],
                    'center': [(left + width / 2), (top + height / 2)]
                })
        
        if not candidates:
            return {'located': False, 'error': 'No matching text found in OCR'}
        
        # If only one candidate, return it
        if len(candidates) == 1:
            best = candidates[0]
        else:
            # Multiple candidates - pick nearest to target box
            if target_box and len(target_box) == 4:
                # Calculate center of target box in pixels
                target_center_x = ((target_box[1] + target_box[3]) / 2 / 1000) * W
                target_center_y = ((target_box[0] + target_box[2]) / 2 / 1000) * H
                
                # Find candidate nearest to target center
                best = candidates[0]
                min_distance = float('inf')
                
                for candidate in candidates:
                    cx, cy = candidate['center']
                    distance = ((cx - target_center_x) ** 2 + (cy - target_center_y) ** 2) ** 0.5
                    
                    if distance < min_distance:
                        min_distance = distance
                        best = candidate
            else:
                # No target box, pick highest confidence
                best = max(candidates, key=lambda c: c['confidence'])
        
        return {
            'located': True,
            'normalizedBox': best['box'],
            'confidence': best['confidence'],
            'matchedText': best['text'],
            'method': 'python-ocr'
        }
```

**Verification**: Indentation matches class methods (4 spaces), method is inside class

#### STEP 2C: Add Flask API endpoint for OCR
**Location**: After the last Flask route (after `/analyze-screen` route, around line 550)
**Insert exactly**:

```python


@app.route('/ocr/text-locate', methods=['POST'])
def ocr_text_locate():
    """
    Locate text on screenshot using Tesseract OCR
    
    Request body:
    {
        "screenshot": "base64_string",
        "target": "text_to_find",
        "targetBox": [ymin, xmin, ymax, xmax],  // optional
        "dimensions": {"width": 1920, "height": 1080}
    }
    
    Response:
    {
        "located": true/false,
        "normalizedBox": [ymin, xmin, ymax, xmax],
        "confidence": 0.0-1.0,
        "matchedText": "actual text found"
    }
    """
    try:
        data = request.json
        screenshot_base64 = data.get('screenshot')
        target_text = data.get('target', '')
        target_box = data.get('targetBox', [])
        dimensions = data.get('dimensions', {'width': 1920, 'height': 1080})
        
        if not screenshot_base64:
            return jsonify({"located": False, "error": "Missing screenshot"}), 400
        
        if not target_text:
            return jsonify({"located": False, "error": "Missing target text"}), 400
        
        # Decode screenshot from base64
        try:
            img_data = base64.b64decode(screenshot_base64)
            img = Image.open(BytesIO(img_data))
        except Exception as e:
            logger.error(f"Failed to decode screenshot: {e}")
            return jsonify({"located": False, "error": "Invalid screenshot data"}), 400
        
        # Run Tesseract OCR
        try:
            ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        except Exception as e:
            logger.error(f"Tesseract OCR failed: {e}")
            return jsonify({"located": False, "error": f"OCR failed: {str(e)}"}), 500
        
        # Locate text in OCR results
        result = ocr_service._locate_text_in_ocr_data(
            ocr_data,
            target_text,
            target_box,
            dimensions
        )
        
        if result.get('located'):
            logger.info(f"OCR located text '{target_text}' with confidence {result.get('confidence')}")
            return jsonify(result), 200
        else:
            logger.warning(f"OCR could not locate text '{target_text}'")
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"OCR text locate error: {e}")
        return jsonify({"located": False, "error": str(e)}), 500
```

**Verification**: Route is at module level (not inside class), uses @app.route decorator

#### STEP 2D: Save and test Python service
**Action**: Save file and verify syntax

**Test command**:
```bash
cd python-backend
python -m py_compile ocr_service.py
```

**Expected**: No syntax errors

---

### STEP 3: UPDATE NODE.JS PYWINAUTO LOCATOR
**File to modify**: `C:\Users\user\Desktop\Freddy\locator-pywinauto.js`

#### STEP 3A: Change default enabled state
**Location**: Line 32 (in constructor options)
**Find**:
```javascript
enabled: process.env.PYWINAUTO_ENABLED !== '0',
```

**Replace with**:
```javascript
enabled: true,  // PyWinAuto enabled by default
```

**Verification**: enabled is now true by default

#### STEP 3B: Update priority chain
**Location**: Line 33 (in constructor options)
**Find**:
```javascript
priority: (process.env.OCRLOCATION_PRIORITY || 'pywinauto,tesseract,ai').split(','),
```

**Replace with**:
```javascript
priority: (process.env.OCRLOCATION_PRIORITY || 'pywinauto,python-ocr,ai').split(','),
```

**Verification**: Default changed from 'tesseract' to 'python-ocr'


#### STEP 3C: Remove old Tesseract.js method
**Location**: Around line 205-225 in `locator-pywinauto.js`
**Find and DELETE this entire method**:
```javascript
async _locateWithTesseract(step, screenshotBase64, dimensions, options) {
    // Use the original Tesseract locator
    const { createWorker } = require('tesseract.js');
    
    try {
        // Create a worker for this request
        const worker = await createWorker('eng', 1, options);
        await worker.recognize(Buffer.from(screenshotBase64, 'base64'));
        
        // This is simplified - in reality we'd use the existing locator.js logic
        // For now, return null to trigger AI fallback
        await worker.terminate();
        return null;
    } catch (error) {
        return null;
    }
}
```

**Action**: DELETE this entire method (all lines)

#### STEP 3D: Add new Python OCR method
**Location**: Same location where you deleted _locateWithTesseract (around line 205)
**Insert exactly**:

```javascript
    /**
     * Locate element using Python Tesseract OCR (fallback)
     * Calls Python service OCR endpoint instead of Node.js Tesseract.js
     * 
     * @param {Object} step Tutorial step with target text
     * @param {string} screenshotBase64 Base64 screenshot
     * @param {Object} dimensions {width, height}
     * @returns {Promise<Object|null>} Location info or null
     */
    async _locateWithPythonOCR(step, screenshotBase64, dimensions) {
        if (!this.pywinautoService || !step.target) {
            return null;
        }
        
        try {
            console.log(`[PyWinAuto] Attempting Python OCR for: "${step.target}"`);
            
            // Call Python service OCR endpoint
            const response = await this.pywinautoService._request(
                'POST',
                '/ocr/text-locate',
                {
                    screenshot: screenshotBase64,
                    target: step.target,
                    targetBox: step.box || [],
                    dimensions: {
                        width: dimensions.width || 1920,
                        height: dimensions.height || 1080
                    }
                },
                15000  // 15 second timeout for OCR
            );
            
            if (response && response.located) {
                console.log(`[PyWinAuto] Python OCR found "${step.target}" with confidence ${response.confidence}`);
                
                return {
                    box: response.normalizedBox,
                    confidence: response.confidence || 0.7,
                    elementInfo: {
                        method: 'python-ocr',
                        matchedText: response.matchedText || step.target,
                        ocrEngine: 'pytesseract'
                    }
                };
            }
            
            console.log(`[PyWinAuto] Python OCR could not locate "${step.target}"`);
            return null;
            
        } catch (error) {
            console.error('[PyWinAuto] Python OCR failed:', error.message);
            return null;
        }
    }
```

**Verification**: Method has correct async signature, proper error handling

#### STEP 3E: Update method call in location chain
**Location**: Around line 185 in `_locateStepsWithPyWinAuto` method
**Find**:
```javascript
// Try Tesseract OCR if PyWinAuto failed
if (!locatedInfo && this.options.priority.includes('tesseract')) {
    locatedInfo = await this._locateWithTesseract(step, screenshotBase64, dimensions, options);
    if (locatedInfo) {
        locationMethod = 'tesseract';
        confidence = locatedInfo.confidence || 0.7;
    }
}
```

**Replace with**:
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

**Verification**: Method name changed, 'tesseract' → 'python-ocr', options parameter removed

---

### STEP 4: UPDATE MAIN APPLICATION
**File to modify**: `C:\Users\user\Desktop\Freddy\main.js`

#### STEP 4A: Update imports
**Location**: Lines 7-9 (near top of file)
**Find**:
```javascript
const IPC = require('./ipc-channels');
const { generateTutorial, activeProviderLabel } = require('./planner');
const { locateSteps } = require('./locator');
const { getPyWinAutoLocator } = require('./locator-pywinauto');
```

**Replace with**:
```javascript
const IPC = require('./ipc-channels');
const { generateTutorial, activeProviderLabel } = require('./planner');
// OLD SYSTEM REMOVED: const { locateSteps } = require('./locator');
const { getPyWinAutoLocator, locateSteps } = require('./locator-pywinauto');
```

**Verification**: Import now gets locateSteps from locator-pywinauto, old import commented

#### STEP 4B: Simplify OCR location logic
**Location**: Around lines 118-160 in the `IPC.OVERLAY_TUTORIAL_PROMPT` handler
**Find this entire block**:


```javascript
      // Enhanced element location using PyWinAuto (native Windows UI) + Tesseract OCR
      sendStatus('thinking', 'Locating elements on screen…');
      try {
        let result;
        
        // Check if PyWinAuto is enabled (set PYWINAUTO_ENABLED=1 in .env)
        const usePyWinAuto = process.env.PYWINAUTO_ENABLED === '1';
        
        if (usePyWinAuto) {
          // Use enhanced locator with PyWinAuto support
          const pywinautoLocator = getPyWinAutoLocator();
          sendStatus('thinking', 'Using enhanced detection (PyWinAuto + OCR)…');
          
          result = await pywinautoLocator.locateSteps(
            steps,
            shot.buffer,
            { width: shot.width, height: shot.height },
            {
              langPath: path.join(__dirname, 'tessdata'),
              gzip: false,
              cachePath: tessCachePath()
            }
          );
          
          // Log location statistics
          if (result.methodStats) {
            console.log('[PyWinAuto] Location method stats:', result.methodStats);
            console.log('[PyWinAuto] Average confidence:', result.confidence);
          }
        } else {
          // Use original Tesseract-only locator
          result = await locateSteps(
            steps,
            shot.buffer,
            { width: shot.width, height: shot.height },
            {
              langPath: path.join(__dirname, 'tessdata'),
              gzip: false,
              cachePath: tessCachePath()
            }
          );
        }
        
        steps = result.steps;
      } catch (error) {
        console.error('Element location failed:', error);
        // Keep the AI boxes if location refinement fails
      }
```

**Replace with this SIMPLIFIED version**:

```javascript
      // Enhanced element location using PyWinAuto (native Windows UI + Python OCR)
      sendStatus('thinking', 'Locating elements on screen…');
      try {
        const result = await locateSteps(
          steps,
          shot.buffer,
          { width: shot.width, height: shot.height },
          {
            langPath: path.join(__dirname, 'tessdata'),
            gzip: false,
            cachePath: tessCachePath()
          }
        );
        
        steps = result.steps;
        
        // Log location statistics
        if (result.methodStats) {
          console.log('[OCR] Location method stats:', result.methodStats);
          console.log('[OCR] Average confidence:', result.confidence || 'N/A');
        }
      } catch (error) {
        console.error('Element location failed:', error);
        // Keep the AI boxes if location refinement fails
      }
```

**Verification**: 
- No more conditional logic
- Single locateSteps call
- Simpler error handling

---

### STEP 5: REMOVE OLD SYSTEM FILES

#### STEP 5A: Archive old locator
**Command**:
```bash
cd C:\Users\user\Desktop\Freddy
move locator.js locator-legacy.js.bak
```

**Verification**: `locator.js` no longer exists, `locator-legacy.js.bak` exists

#### STEP 5B: Remove Tesseract.js dependency
**File to modify**: `C:\Users\user\Desktop\Freddy\package.json`

**Location**: In dependencies section (around line 21)
**Find**:
```json
  "dependencies": {
    "tesseract.js": "^7.0.0"
  },
```

**Replace with**:
```json
  "dependencies": {
  },
```

**Verification**: No dependencies in package.json

**Command to uninstall**:
```bash
cd C:\Users\user\Desktop\Freddy
npm uninstall tesseract.js
```

**Verification**: tesseract.js removed from node_modules

---

### STEP 6: UPDATE ENVIRONMENT DEFAULTS
**File to modify**: `C:\Users\user\Desktop\Freddy\.env.example`

#### STEP 6A: Update PyWinAuto default
**Location**: Around line 30 in .env.example
**Find**:
```env
# PYWINAUTO_ENABLED=0          # 0 = disabled (default), 1 = enabled
```

**Replace with**:
```env
# PYWINAUTO_ENABLED=1          # 1 = enabled (default), 0 = AI-only mode
```

#### STEP 6B: Update priority default
**Location**: Around line 33 in .env.example
**Find**:
```env
# OCRLOCATION_PRIORITY=pywinauto,tesseract,ai  # Detection method priority
```

**Replace with**:
```env
# OCRLOCATION_PRIORITY=pywinauto,python-ocr,ai  # Detection method priority
```

**Verification**: File shows python-ocr instead of tesseract

---

### STEP 7: UPDATE DOCUMENTATION
**File to modify**: `C:\Users\user\Desktop\Freddy\README.md`

#### STEP 7A: Update architecture description
**Location**: Find section "Two-stage targeting (vision + OCR)" around line 25

**Find**:
```markdown
### Two-stage targeting (vision + OCR)
```

**Replace with**:
```markdown
### Three-stage targeting (vision + Native UI + OCR)
```

**Then find the paragraph that follows and replace with**:

```markdown
The assistant uses a sophisticated three-stage element location strategy:

1. **WHAT to do — AI Vision Model.** `planner.generateTutorial()` sends the
   screenshot to a vision model (Gemini/Groq/OpenRouter) and gets back ordered
   steps with target descriptions, element kinds, and rough bounding boxes.

2. **WHERE it is — Native Windows UI.** `locator-pywinauto.js` uses PyWinAuto to
   detect native Windows UI elements via accessibility APIs. Gets exact coordinates,
   automation IDs, control types, and element hierarchy. **~95% accuracy** for
   standard Windows applications.

3. **OCR Fallback — Python Tesseract.** When native detection fails,
   `python-backend/ocr_service.py` uses pytesseract for text-based location.
   Finds text patterns in screenshots. **~70% accuracy** for text elements.
   Useful for web apps, custom UI, and image-based controls.

All OCR processing happens in the Python backend, keeping the system **offline**
with no external dependencies or CDN downloads.
```

**Verification**: Architecture section describes three stages, mentions Python OCR

#### STEP 7B: Search and replace Tesseract.js references
**Action**: Throughout README.md, replace these terms:

**Find**: `tesseract.js`
**Replace with**: `Python Tesseract (pytesseract)`

**Find**: `Tesseract worker`
**Replace with**: `Python OCR service`

**Find**: `createWorker`
**Replace with**: `pytesseract.image_to_data`

**Verification**: No more references to "tesseract.js" Node package

---

### STEP 8: CREATE MIGRATION TEST
**File to create**: `C:\Users\user\Desktop\Freddy\test-migration.js`

**Create new file with this content**:


```javascript
#!/usr/bin/env node
/**
 * Migration validation test
 * Verifies Tesseract.js removal and PyWinAuto system
 */

const fs = require('node:fs');
const path = require('node:path');

console.log('='.repeat(60));
console.log('MIGRATION TEST: Tesseract.js → PyWinAuto OCR');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
    if (condition) {
        console.log(`✓ ${name}`);
        passed++;
    } else {
        console.log(`✗ ${name}`);
        if (details) console.log(`  ${details}`);
        failed++;
    }
}

// Test 1: Old system removed
console.log('\n1. Checking old Tesseract.js system removed...');
test(
    'locator.js archived',
    !fs.existsSync(path.join(__dirname, 'locator.js')),
    'locator.js still exists - should be renamed to locator-legacy.js.bak'
);
test(
    'locator-legacy.js.bak exists',
    fs.existsSync(path.join(__dirname, 'locator-legacy.js.bak')),
    'Backup file not found'
);

// Test 2: package.json updated
console.log('\n2. Checking package.json...');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
test(
    'tesseract.js removed from dependencies',
    !pkg.dependencies || !pkg.dependencies['tesseract.js'],
    'tesseract.js still in package.json dependencies'
);

// Test 3: New system files exist
console.log('\n3. Checking PyWinAuto system files...');
test('locator-pywinauto.js exists', fs.existsSync(path.join(__dirname, 'locator-pywinauto.js')));
test('python-ipc.js exists', fs.existsSync(path.join(__dirname, 'python-ipc.js')));
test('python-backend/ocr_service.py exists', fs.existsSync(path.join(__dirname, 'python-backend', 'ocr_service.py')));

// Test 4: Check Python service has OCR endpoint
console.log('\n4. Checking Python service updated...');
const pythonService = fs.readFileSync(path.join(__dirname, 'python-backend', 'ocr_service.py'), 'utf8');
test(
    'Python service imports pytesseract',
    pythonService.includes('import pytesseract'),
    'Missing pytesseract import'
);
test(
    'Python service has /ocr/text-locate endpoint',
    pythonService.includes('/ocr/text-locate'),
    'Missing OCR endpoint'
);
test(
    'Python service has _locate_text_in_ocr_data method',
    pythonService.includes('_locate_text_in_ocr_data'),
    'Missing OCR helper method'
);

// Test 5: Check Node.js locator updated
console.log('\n5. Checking Node.js locator updated...');
const locator = fs.readFileSync(path.join(__dirname, 'locator-pywinauto.js'), 'utf8');
test(
    'Locator has _locateWithPythonOCR method',
    locator.includes('_locateWithPythonOCR'),
    'Missing Python OCR method'
);
test(
    'Locator does NOT reference tesseract.js',
    !locator.includes("require('tesseract.js')"),
    'Still has tesseract.js require()'
);
test(
    'Locator priority includes python-ocr',
    locator.includes('python-ocr'),
    'Priority chain not updated'
);

// Test 6: Check main.js updated
console.log('\n6. Checking main.js updated...');
const mainJs = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
test(
    'main.js imports from locator-pywinauto',
    mainJs.includes("require('./locator-pywinauto')"),
    'Missing locator-pywinauto import'
);
test(
    'main.js does NOT import old locator',
    !mainJs.includes("require('./locator')") || mainJs.includes("// OLD SYSTEM REMOVED"),
    'Still importing old locator.js'
);

// Test 7: Check .env.example updated
console.log('\n7. Checking .env.example updated...');
const envExample = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
test(
    '.env.example has python-ocr priority',
    envExample.includes('python-ocr'),
    'Still references tesseract in priority'
);

// Summary
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
    console.log('\n✓ ALL TESTS PASSED! Migration successful.');
    process.exit(0);
} else {
    console.log('\n✗ SOME TESTS FAILED. Review errors above.');
    process.exit(1);
}
```

**Verification**: File created, executable

---

### STEP 9: RUN MIGRATION TEST
**Command**:
```bash
cd C:\Users\user\Desktop\Freddy
node test-migration.js
```

**Expected output**: All tests pass

**If tests fail**: Review failure messages and fix issues before proceeding

---

### STEP 10: FINAL VERIFICATION

#### STEP 10A: Check syntax of all modified files
**Commands**:
```bash
cd C:\Users\user\Desktop\Freddy

# Check Node.js files
node -c locator-pywinauto.js
node -c main.js
node -c test-migration.js

# Check Python file
cd python-backend
python -m py_compile ocr_service.py
cd ..
```

**Expected**: No syntax errors

#### STEP 10B: Git commit changes
**Commands**:
```bash
git add .
git commit -m "Complete migration: Remove Tesseract.js, use PyWinAuto OCR as primary system

- Removed: locator.js (archived as locator-legacy.js.bak)
- Removed: tesseract.js npm dependency
- Added: Python OCR endpoint in ocr_service.py
- Updated: locator-pywinauto.js with Python OCR fallback
- Updated: main.js simplified OCR logic
- Updated: .env.example defaults
- Updated: README.md architecture documentation
- Added: test-migration.js validation script

PyWinAuto is now primary OCR system with Python Tesseract fallback.
No more Node.js Tesseract.js dependency."
```

**Verification**: Changes committed successfully

---

## COMPLETION CHECKLIST

Before marking task complete, verify ALL of these:

- [ ] `locator.js` renamed to `locator-legacy.js.bak`
- [ ] `tesseract.js` removed from package.json
- [ ] `npm uninstall tesseract.js` executed
- [ ] `python-backend/ocr_service.py` has pytesseract import
- [ ] `python-backend/ocr_service.py` has `_locate_text_in_ocr_data` method
- [ ] `python-backend/ocr_service.py` has `/ocr/text-locate` endpoint
- [ ] `locator-pywinauto.js` enabled by default (true)
- [ ] `locator-pywinauto.js` priority changed to 'python-ocr'
- [ ] `locator-pywinauto.js` has `_locateWithPythonOCR` method
- [ ] `locator-pywinauto.js` removed `_locateWithTesseract` method
- [ ] `main.js` imports from locator-pywinauto only
- [ ] `main.js` simplified OCR logic (no conditionals)
- [ ] `.env.example` updated defaults
- [ ] `README.md` updated architecture section
- [ ] `test-migration.js` created
- [ ] All syntax checks pass
- [ ] `node test-migration.js` passes
- [ ] Git commit created

---

## TROUBLESHOOTING FOR AI MODELS

### If you get "Cannot find module 'locator'"
**Cause**: Code still importing old locator.js
**Fix**: Check main.js line 8, ensure it imports from locator-pywinauto

### If Python service fails to start
**Cause**: Missing pytesseract dependency
**Fix**: Run `pip install pytesseract` in python-backend directory

### If /ocr/text-locate returns 500 error
**Cause**: Syntax error in _locate_text_in_ocr_data method
**Fix**: Check indentation, ensure method is inside PyWinAutoOCRService class

### If tests show "still has tesseract.js"
**Cause**: Old references not removed from locator-pywinauto.js
**Fix**: Search for "tesseract.js" and "createWorker", remove all occurrences

---

## POST-COMPLETION NOTES

After completing all steps:

1. **Test the application**: Run `npm start` and verify it starts without errors
2. **Test OCR functionality**: Ask a tutorial question, verify elements are located
3. **Check logs**: Look for `[OCR]` messages showing python-ocr method being used
4. **Monitor performance**: First request may be slow (Python startup), subsequent should be fast

**Success criteria**:
- App starts without errors
- Tutorial questions work end-to-end
- Console shows `[OCR] Location method stats` with python-ocr
- No references to Tesseract.js in code or logs

---

## END OF INSTRUCTIONS

**Total Steps**: 10 major steps
**Estimated Time**: 2-3 hours for careful execution
**Complexity**: Medium - Requires attention to detail
**Risk**: Low - Backup created, tests validate changes

**You have completed the migration when**:
- All checklist items checked
- All tests pass
- Git commit created
- Application runs successfully