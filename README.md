# electron-assistant-overlay

A screen-aware Electron overlay that watches your real screen and walks you
through any app, one step at a time — a transparent "always-on-top" assistant
that spotlights the exact UI element you need to click next.

## How it works

You type a *"how do I…"* question. The app screenshots your screen, asks a
**vision model** for the ordered steps, then uses **local OCR** to find each
step's target text on the screenshot and draws a pixel-accurate spotlight over
it. Press **Enter** to advance through the steps.

## Architecture

A single window spawned from `main.js`:

- **Assistant Overlay** (`renderer/overlay.html`): `transparent`, `frame: false`,
  `alwaysOnTop`, covering the entire screen. It is fully click-through
  (`setIgnoreMouseEvents(true, { forward: true })`) **except** the small chat
  widget in the bottom-right corner, so your real apps stay fully usable
  underneath it.

### Click-through region

The overlay starts click-through with `forward: true`, so mouse-move events
still reach the renderer. `renderer/overlay.js` watches the cursor and, while it
is over a `[data-interactive]` element (the chat widget / tooltip), asks the
main process to disable click-through; it re-enables it everywhere else. While a
walkthrough is on screen the whole overlay captures input (so **Enter** / **Esc**
work).

### Secure IPC bridge

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload
script exposes a narrow API via `contextBridge`; raw `ipcRenderer` is never
handed to the renderer. Channel names live in `ipc-channels.js`.

```
overlay.js --overlayAPI.sendTutorialPrompt(text)--> preload.js
           --ipc: 'overlay:tutorial-prompt'------> main.js
   main.js: hide overlay -> desktopCapturer screenshot of the primary display
           -> planner.generateTutorial(prompt, png)   (vision model: WHAT to do)
           -> locator.locateSteps(steps, png)          (local OCR: WHERE it is)
           --ipc: 'overlay:tutorial-steps'-------> overlay.js (spotlight walkthrough)

overlay.js --overlayAPI.setMouseIgnore()----------> preload.js
           --ipc: 'overlay:set-ignore-mouse'-----> main.js (setIgnoreMouseEvents)
```

### Two-stage targeting (vision + OCR)

Asking a vision model to *both* reason about a workflow *and* output exact pixel
coordinates produces sloppy boxes. So the two jobs are split:

1. **WHAT to do — vision model.** `planner.generateTutorial()` sends the
   screenshot + your question to a vision model and gets back ordered steps. Each
   step names its **`target`** (the *exact visible text* of the element, e.g.
   `"Image"`, `"Opacity: 100%"`), a **`kind`** (`text` | `icon` | `region`), a
   fallback **`box`**, plus a **`title`** and **`desc`**.

2. **WHERE it is — local OCR.** `locator.locateSteps()` runs Tesseract
   (`tesseract.js`) on the screenshot, finds the step's `target` text, and
   returns its exact pixel box. This is free, offline, and ~pixel-accurate. When
   a word appears more than once, the model's rough `box` disambiguates (nearest
   match wins). `icon`/`region` targets (and any text OCR can't read) gracefully
   fall back to the model's box.

The language data ships in `tessdata/eng.traineddata` (loaded with
`langPath` + `gzip: false`), so OCR works **offline with no CDN download**. The
Tesseract worker is created once and reused across steps.

Steps use a **0–1000 normalized grid** (`box: [ymin, xmin, ymax, xmax]`,
Gemini's documented convention) so they render correctly at any resolution.
`renderer/overlay.js` converts them to pixels and draws a **spotlight**: the
screen darkens except a glowing hole over the target, with a tooltip (title,
description, `Step n / N`) and a ghost cursor. **Enter** (or the **Next** button)
advances; **Esc** cancels. The last step clears the spotlight, unlocks the
input, and shows "Tutorial complete."

### Vision provider (pluggable)

`planner.js` chooses a backend via `AI_PROVIDER` (or auto-detects from whichever
key is set):

| Provider | Key env var | Vision model (default) | Override |
|----------|-------------|------------------------|----------|
| `openrouter` (recommended) | `OPENROUTER_API_KEY` | `qwen/qwen2.5-vl-72b-instruct` | `OPENROUTER_MODEL` |
| `groq` | `GROQ_API_KEY` | `meta-llama/llama-4-scout-17b-16e-instruct` | `GROQ_MODEL` |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` | `GEMINI_MODEL` |

> **OpenRouter / Qwen2.5-VL note:** Qwen2.5-VL grounds UI elements much better
> than Llama-4 Scout, so it's the default. It is **not free** (~$0.80/M input
> tokens — a single tutorial call costs a fraction of a cent), so your
> OpenRouter account needs a small credit balance. To stay 100% free, set
> `OPENROUTER_MODEL` to a free vision model such as
> `nvidia/nemotron-nano-12b-v2-vl:free`.

All providers are called over their REST APIs with the built-in `fetch` (no
extra dependency). Gemini uses a strict `responseSchema` and sends the
screenshot as `inlineData`; Groq/OpenRouter use an `image_url` data URL +
JSON mode.

> Note on Gemini quota: `gemini-1.5-pro` / `gemini-2.0-flash` may have `limit: 0`
> free-tier quota on some keys (you'll see a `429`). `gemini-2.5-flash` (the
> default here) generally has free-tier quota — keep the default unless you have
> a reason to change it.

## Configuration

Copy `.env.example` to `.env` and set **one** provider's key (the `.env` file is
gitignored). For OpenRouter:

```
OPENROUTER_API_KEY=sk-or-your_key   # from https://openrouter.ai/keys
# AI_PROVIDER=openrouter            # optional; auto-detected from the key above
# OPENROUTER_MODEL=qwen/qwen2.5-vl-72b-instruct   # optional override (default)
```

The provider is auto-detected from whichever key is present (priority
`groq` > `openrouter` > `gemini`); set `AI_PROVIDER` to force one.

## Run

There are two ways to run this, both shipped in the release zip:

### A) Prebuilt Windows app (no Node/npm needed)

The `WindowsApp/` folder is a fully self-contained build — Electron, all npm
packages, and the OCR language data are bundled inside it. Nothing is
downloaded at runtime.

1. Put your key in a file named `.env` **next to `FredAssistant.exe`** (inside
   `WindowsApp/`):
   ```
   OPENROUTER_API_KEY=sk-or-your_key
   ```
2. Double-click **`FredAssistant.exe`**.

The app looks for `.env` next to the executable first, so that's the only file
you need to add.

### B) Run from source with npm (for development)

```bash
npm install
npm start                # normal desktop
npm run start:headless   # under xvfb (no display)
```

## Building the executable yourself

```bash
npm install
npm run package:win      # -> dist/FredAssistant-win32-x64/FredAssistant.exe
npm run package:linux    # -> dist/FredAssistant-linux-x64/FredAssistant
```

Packaging uses `@electron/packager` with `asar` disabled so the bundled
`tesseract.js` worker, its WebAssembly core, and `tessdata/eng.traineddata`
load reliably from disk. The build is self-contained: no `npm install` or
network download is required to run it.

### Runtime flags

| Env var | Default | Effect |
|---------|---------|--------|
| `OVERLAY_INTERACTIVE` | `0` | Set to `1` to keep the whole overlay interactive (no click-through). **Required on Linux**, where Electron cannot forward mouse-move events while ignoring them, so the click-through hover detection never fires. On Windows/macOS leave this unset for proper click-through. |

Windows:

```powershell
cd "C:\path\to\electron-assistant-overlay"
npm install
npm start
```

Linux:

```bash
OVERLAY_INTERACTIVE=1 npm start
```

Then type a question like *"how do I change the opacity of my layer"*, hit
**Send**, and step through the spotlight with **Enter**.
## PyWinAuto OCR Integration (Enhanced Windows Automation)

The app now includes optional PyWinAuto integration for enhanced UI element detection on Windows. This provides more accurate element location using native Windows accessibility APIs, with graceful fallback to Tesseract OCR.

### **Features**

- **Native UI Element Detection**: Uses Windows UIA/IAccessible APIs via PyWinAuto
- **Hybrid Location Strategy**: PyWinAuto → Tesseract OCR → AI bounding box fallback
- **Enhanced Element Info**: Captures automation IDs, control types, hierarchy
- **Real-time Window Analysis**: Detects active window and its UI structure
- **Performance Caching**: Caches element detection results for faster operation
- **Graceful Degradation**: Falls back to OCR-only mode if Python unavailable

### **Setup Instructions**

#### **1. Install Python Dependencies**

```bash
# Run the setup script from the project root
node install-python-deps.js

# Or manually install:
cd python-backend
python -m pip install -r requirements.txt
```

**Requirements:**
- Python 3.8 or later
- Windows 10/11
- Administrative privileges (for some UI automation)

#### **2. Enable PyWinAuto in .env**

Add to your `.env` file:

```
# Enable PyWinAuto enhanced detection
PYWINAUTO_ENABLED=1

# Service configuration (optional)
PYWINAUTO_PORT=5555
PYWINAUTO_BACKEND=uia

# Location method priority
OCRLOCATION_PRIORITY=pywinauto,tesseract,ai
```

#### **3. Configuration Options**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PYWINAUTO_ENABLED` | `0` (off) | Enable PyWinAuto integration (`1` = on) |
| `PYWINAUTO_PORT` | `5555` | Python service port |
| `PYWINAUTO_BACKEND` | `uia` | PyWinAuto backend (`uia` or `win32`) |
| `OCRLOCATION_PRIORITY` | `pywinauto,tesseract,ai` | Element location method priority |

### **How It Works**

#### **Location Strategy Chain**

1. **PyWinAuto Native Detection** (Highest priority, ~95% confidence):
   - Connects to active window via Windows accessibility APIs
   - Extracts UI elements with properties (name, automation ID, control type)
   - Gets exact screen coordinates from Windows
   - Works best with standard Windows applications

2. **Tesseract OCR** (Fallback, ~70% confidence):
   - Traditional OCR text recognition
   - Finds text patterns in screenshot
   - Good for custom UI, web apps, non-standard controls

3. **AI Bounding Box** (Last resort, ~30% confidence):
   - Uses the vision model's original bounding box
   - Applied when both PyWinAuto and OCR fail

#### **Enhanced Element Information**

When PyWinAuto is enabled, tutorial steps include additional metadata:

```javascript
{
  "target": "Save Button",
  "kind": "button",
  "box": [500, 500, 550, 600],
  "title": "Save your work",
  "desc": "Click the Save button",
  "locatedBy": "pywinauto", // Detection method
  "confidence": 0.95, // Location confidence
  "elementInfo": {
    "automationId": "btnSave",
    "controlType": "Button",
    "rectangle": [1920, 1080, 2000, 1120],
    "childrenCount": 0
  },
  "method": "pywinauto"
}
```

### **Testing the Integration**

```bash
# Run test script
node test-pywinauto.js

# Check logs in app (look for [PyWinAuto] messages)
```

### **Troubleshooting**

#### **Common Issues**

1. **"Python not found"**
   - Install Python 3.8+ from [python.org](https://www.python.org/downloads/)
   - Ensure Python is in PATH (`python --version` should work)

2. **"Failed to install dependencies"**
   - Run Command Prompt as Administrator
   - Install Visual C++ Build Tools
   - Install Windows SDK

3. **"Service connection refused"**
   - Check if port 5555 is in use
   - Verify Python service started (check logs)
   - Try different port: `PYWINAUTO_PORT=5556`

4. **"No elements detected"**
   - Application may not support UIA automation
   - Try `PYWINAUTO_BACKEND=win32`
   - Some apps require elevated privileges

#### **Logs and Monitoring**

The service logs to console with `[PyWinAuto]` prefix:
- `Service initialized successfully` - Good
- `Failed to get native elements` - Warning
- `Enhanced location failed, falling back to OCR` - Error (fallback working)
- `Location method stats` - Performance metrics

### **Performance Considerations**

- **First run**: Slower due to Python service startup (~2-3 seconds)
- **Subsequent runs**: Fast due to caching (~100-500ms)
- **Memory**: Python service uses ~50-100MB RAM
- **CPU**: Minimal when idle, spikes during element detection

### **Limitations**

1. **Windows Only**: PyWinAuto only works on Windows
2. **Application Support**: Some apps don't expose UI elements to accessibility APIs
3. **Elevated Privileges**: Some system apps require admin rights
4. **Dynamic Content**: Web apps with heavy JavaScript may not be fully accessible

### **Disabling PyWinAuto**

If you experience issues, disable PyWinAuto by:

1. Set `PYWINAUTO_ENABLED=0` in `.env`
2. Or remove the variable (defaults to disabled)
3. The app will use Tesseract-only mode

### **Development Notes**

#### **File Structure**

```
python-backend/
├── ocr_service.py     # Main PyWinAuto service
├── start_service.py   # Service launcher
├── requirements.txt   # Python dependencies
└── config.json       # Service configuration

locator-pywinauto.js   # Enhanced locator module
python-ipc.js         # Electron-Python IPC bridge
```

#### **Extending Functionality**

To add new element types or detection methods:

1. Edit `python-backend/ocr_service.py` to add detection logic
2. Update `locator-pywinauto.js` to handle new element types
3. Add configuration options to `config.json`

#### **Debug Mode**

Enable detailed logging:

```bash
# Set in .env
PYWINAUTO_DEBUG=1

# Or start Python service manually with debug
cd python-backend
python start_service.py --debug
```