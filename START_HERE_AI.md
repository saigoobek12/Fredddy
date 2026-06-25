# START HERE - FOR AI CODING MODELS

## PROMPT TO GIVE AI MODEL:

```
You are an AI coding assistant. I need you to complete a code migration task.

PROJECT: Electron screen assistant app with OCR element detection
TASK: Remove old Tesseract.js (Node.js) OCR system, make PyWinAuto (Python) the primary OCR

INSTRUCTIONS FILE: Read and follow "AI_CODER_INSTRUCTIONS.md" EXACTLY
- Execute steps in exact order (1 through 10)
- Copy all code blocks EXACTLY as shown
- Do not skip any steps
- Verify each step before moving to next
- Run test-migration.js at the end

START WITH: Step 1 (create git backup branch)
END WITH: Step 10 (git commit)

RULES:
- Follow instructions precisely
- Don't optimize or refactor
- Keep all comments
- Use exact file paths provided
- If unclear, ask before proceeding
```

## FILES OVERVIEW

**Main instruction file**: `AI_CODER_INSTRUCTIONS.md` (complete step-by-step guide)
**Migration plan**: `MIGRATION_PLAN.md` (detailed technical plan for reference)
**Quick start**: `QUICK_START_MIGRATION.md` (overview for humans)

## WHAT THE TASK DOES

**Current state**: 2 OCR systems running (Tesseract.js + PyWinAuto)
**Goal state**: 1 OCR system (PyWinAuto only)

**Changes**:
1. Remove: `locator.js` (old system)
2. Remove: `tesseract.js` npm package
3. Add: Python OCR endpoint to existing Python service
4. Update: Node.js locator to call Python OCR
5. Update: All references throughout codebase

## KEY DIRECTORIES

```
Freddy/
├── locator.js                    # DELETE (archive)
├── locator-pywinauto.js          # UPDATE (primary system)
├── main.js                       # UPDATE (simplify)
├── package.json                  # UPDATE (remove dependency)
├── python-backend/
│   └── ocr_service.py            # UPDATE (add OCR)
├── .env.example                  # UPDATE (defaults)
└── README.md                     # UPDATE (docs)
```

## EXPECTED TIME

**For AI Model**: 30-60 minutes (if following instructions exactly)
**For Human**: 2-3 hours

## VALIDATION

After completion, the AI should run:
```bash
node test-migration.js
```

All tests must pass for successful migration.

## IMPORTANT NOTES FOR AI

1. **Read instructions FIRST** before executing
2. **Follow order exactly** - don't jump ahead
3. **Copy code verbatim** - don't modify
4. **Verify each step** before proceeding
5. **Run tests** at the end

## WHAT SUCCESS LOOKS LIKE

✓ test-migration.js passes all checks
✓ npm start works without errors
✓ App detects UI elements using PyWinAuto
✓ Console shows "[OCR] Location method stats" with python-ocr
✓ No Tesseract.js references in code

## IF STUCK

**Problem**: Tests fail
**Solution**: Read error messages, review step that failed, fix issue

**Problem**: Syntax errors
**Solution**: Check indentation, brackets, ensure exact code copying

**Problem**: Import errors
**Solution**: Verify file paths, ensure all files created/modified

## SUMMARY

This is a straightforward refactoring task:
- Old system: Tesseract.js (Node.js library)
- New system: PyWinAuto (Python service) with Python Tesseract
- Goal: Consolidate to single Python-based OCR system
- Benefit: Cleaner code, better performance, smaller bundle

**NEXT**: Open AI_CODER_INSTRUCTIONS.md and start with STEP 1