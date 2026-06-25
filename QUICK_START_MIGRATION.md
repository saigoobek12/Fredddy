# QUICK START: Remove Tesseract.js, Use PyWinAuto OCR

## 🎯 Goal
Remove old Tesseract.js Node.js OCR system, make PyWinAuto (Python-based) the primary OCR engine.

## ⏱️ Time Required
**~4 hours** for complete migration

## 📋 Prerequisites
- Python 3.8+ installed
- Git for version control
- Node.js and npm
- Text editor (VS Code recommended)

---

## 🚀 Quick Execution Steps

### 1. Backup (2 minutes)
```bash
cd "C:\Users\user\Desktop\Freddy"
git checkout -b remove-tesseract-js
git add .
git commit -m "Backup before removing Tesseract.js"
```

### 2. Phase Order (Follow This Exact Sequence)

#### ✅ STEP 1: Python Service OCR Endpoint (45 min)
**File**: `python-backend/ocr_service.py`

**Add after line 15**:
```python
import pytesseract
```

**Add after line 250** (in PyWinAutoOCRService class):
```python
def _locate_text_in_ocr_data(self, ocr_data, target_text, target_box, dimensions):
    """Find target text in Tesseract OCR data"""
    # Copy full implementation from MIGRATION_PLAN.md Phase 5.2
    pass
```

**Add after line 550** (new Flask route):
```python
@app.route('/ocr/text-locate', methods=['POST'])
def ocr_text_locate():
    """Locate text using Tesseract"""
    # Copy full implementation from MIGRATION_PLAN.md Phase 5.1
    pass
```

**Test**: Start Python service, verify endpoint responds
```bash
cd python-backend
python start_service.py
# Visit http://localhost:5555/health
```

---

#### ✅ STEP 2: Update locator-pywinauto.js (40 min)
**File**: `locator-pywinauto.js`

**Line 32**: Change default enabled
```javascript
enabled: true,  // Changed from false
```

**Line 33**: Update priority
```javascript
priority: (process.env.OCRLOCATION_PRIORITY || 'pywinauto,python-ocr,ai').split(','),
```

**Line 211-225**: DELETE _locateWithTesseract() method entirely

**Line 211**: ADD new method
```javascript
async _locateWithPythonOCR(step, screenshotBase64, dimensions) {
    // Copy full implementation from MIGRATION_PLAN.md Phase 4.2
}
```

**Line 185**: Update to call new method
```javascript
if (!locatedInfo && this.options.priority.includes('python-ocr')) {
    locatedInfo = await this._locateWithPythonOCR(step, screenshotBase64, dimensions);
    if (locatedInfo) {
        locationMethod = 'python-ocr';
        confidence = locatedInfo.confidence || 0.7;
    }
}
```

---

#### ✅ STEP 3: Update main.js (15 min)