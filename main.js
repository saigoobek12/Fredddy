'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');

const IPC = require('./ipc-channels');
const { generateTutorial, activeProviderLabel } = require('./planner');
// OLD SYSTEM REMOVED: const { locateSteps } = require('./locator');
const { getPyWinAutoLocator, locateSteps } = require('./locator-pywinauto');

/**
 * Candidate directories to look for a .env file, in priority order. This makes
 * the packaged .exe friendly: the user can drop `.env` right next to
 * FredAssistant.exe (the most discoverable spot) instead of digging into
 * resources/app. In dev, the .env next to main.js is used.
 */
function dotEnvCandidates() {
  const dirs = [__dirname]; // next to main.js (dev, or resources/app when packaged)
  try {
    if (app.isPackaged) {
      const exeDir = path.dirname(app.getPath('exe'));
      dirs.push(exeDir); // the folder that contains FredAssistant.exe
    }
  } catch {
    // app path not available yet — __dirname is enough.
  }
  try {
    dirs.push(app.getPath('userData'));
  } catch {
    // ignore
  }
  return dirs.map((d) => path.join(d, '.env'));
}

/**
 * Minimal .env loader (no dependency). Reads KEY=VALUE lines from the first
 * .env file found among the candidate locations and copies them into
 * process.env without overriding values already set in the real environment.
 */
function loadDotEnv() {
  for (const file of dotEnvCandidates()) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue; // not here — try the next candidate
    }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break; // first .env wins
  }
}
loadDotEnv();

// Keep the entire overlay interactive (no click-through). Required on Linux
// (where Electron can't forward mouse-move while ignoring) and handy for tests.
const OVERLAY_INTERACTIVE = process.env.OVERLAY_INTERACTIVE === '1';

/** @type {BrowserWindow | null} The transparent click-through overlay. */
let overlayWindow = null;

/**
 * A transparent, frameless, always-on-top overlay that covers the
 * entire screen. It starts fully click-through; the renderer toggles
 * interactivity on a per-region basis (see IPC.SET_IGNORE_MOUSE).
 */
function createOverlayWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Keep the overlay pinned above normal windows, including full-screen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start fully click-through. `forward: true` keeps mouse-move events flowing
  // to the renderer so it can detect when the cursor enters the chat widget
  // and re-enable interactivity for that region only.
  //
  // NOTE: mouse-move forwarding while ignoring is only supported on Windows and
  // macOS. On Linux the renderer never sees the hover, so the widget would be
  // unreachable. Set OVERLAY_INTERACTIVE=1 to keep the whole overlay
  // interactive (no click-through) — useful on Linux and for testing.
  if (!OVERLAY_INTERACTIVE) {
    win.setIgnoreMouseEvents(true, { forward: true });
  }

  win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  win.on('closed', () => {
    overlayWindow = null;
  });

  return win;
}

function registerIpcHandlers() {
  // Overlay -> main: toggle the overlay's click-through behaviour. The renderer
  // calls this with `false` while the cursor is over the interactive chat
  // widget and `true` to make the overlay transparent to mouse input again.
  ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore) => {
    // In fully-interactive mode the overlay never toggles click-through.
    if (OVERLAY_INTERACTIVE) return;
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (ignore) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  });

  // Overlay -> main: a "how do I…" question. Screenshot the whole screen, ask a
  // vision model for an ordered tutorial, and send the steps back to the overlay
  // so it can draw the spotlight walkthrough.
  ipcMain.on(IPC.OVERLAY_TUTORIAL_PROMPT, async (_event, prompt) => {
    const text = typeof prompt === 'string' ? prompt.trim() : '';
    if (!text) {
      sendStatus('error', 'Empty prompt.');
      unlockOverlay();
      return;
    }

    try {
      sendStatus('thinking', 'Capturing screen…');
      const shot = await captureScreen();

      sendStatus('thinking', `Planning with ${activeProviderLabel()}…`);
      let steps = await generateTutorial(text, shot.dataUrl);

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

      sendStatus('running', `Guiding you through ${steps.length} step(s)…`);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        // Focus so the renderer can receive the Enter key that advances steps.
        overlayWindow.show();
        overlayWindow.focus();
        overlayWindow.webContents.send(IPC.OVERLAY_TUTORIAL_STEPS, steps);
      }
    } catch (err) {
      sendStatus('error', err && err.message ? err.message : String(err));
      unlockOverlay();
    }
  });
}

/**
 * Capture the primary display using desktopCapturer. The transparent overlay is
 * excluded by temporarily hiding it so it never appears in the screenshot.
 * Returns the PNG as both a data URL (for the vision model) and a raw buffer +
 * pixel dimensions (for OCR).
 * @returns {Promise<{dataUrl:string, buffer:Buffer, width:number, height:number}>}
 */
async function captureScreen() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const scale = display.scaleFactor || 1;

  const overlayWasVisible = overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible();
  if (overlayWasVisible) {
    overlayWindow.hide();
    // Give the compositor a moment so the overlay is gone from the capture.
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
    });
    if (!sources.length) throw new Error('No screen source available to capture.');
    const primary =
      sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    const size = primary.thumbnail.getSize();
    return {
      dataUrl: primary.thumbnail.toDataURL(),
      buffer: primary.thumbnail.toPNG(),
      width: size.width,
      height: size.height
    };
  } finally {
    if (overlayWasVisible) overlayWindow.show();
  }
}

/** Writable directory where Tesseract caches its language data. */
function tessCachePath() {
  try {
    const dir = path.join(app.getPath('userData'), 'tessdata');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return undefined;
  }
}

function sendStatus(state, message) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC.OVERLAY_STATUS, { state, message });
  }
}

function unlockOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC.OVERLAY_UNLOCK);
  }
}

app.whenReady().then(() => {
  // Startup diagnostic: which AI backend was detected from .env / the
  // environment. Helps users confirm their key was picked up.
  console.log(`[assistant] AI provider: ${activeProviderLabel()}`);
  registerIpcHandlers();
  overlayWindow = createOverlayWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});