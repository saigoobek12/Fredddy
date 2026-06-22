'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preload scripts cannot require local modules, so the channel names
// are inlined here. Keep them in sync with ipc-channels.js (used by main.js).
const IPC = {
  SET_IGNORE_MOUSE: 'overlay:set-ignore-mouse',
  OVERLAY_STATUS: 'overlay:status',
  OVERLAY_UNLOCK: 'overlay:unlock',
  OVERLAY_TUTORIAL_PROMPT: 'overlay:tutorial-prompt',
  OVERLAY_TUTORIAL_STEPS: 'overlay:tutorial-steps'
};

/**
 * Secure IPC bridge for the OVERLAY renderer (Window B).
 *
 * contextIsolation is on and nodeIntegration is off, so the renderer has no
 * direct access to Node or the full ipcRenderer. We expose only a tiny,
 * explicit surface here. Channel names are fixed on this side, so the renderer
 * cannot send arbitrary IPC traffic to the main process.
 */
contextBridge.exposeInMainWorld('overlayAPI', {
  /**
   * Toggle the overlay's click-through behaviour. Pass `false` while the
   * cursor is over an interactive region (the chat widget) and `true` to make
   * the overlay transparent to mouse input again.
   * @param {boolean} ignore
   */
  setMouseIgnore(ignore) {
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE, Boolean(ignore));
  },

  /**
   * Send a "how do I…" question. The main process screenshots the screen, asks
   * a vision model, and replies via onTutorialSteps.
   * @param {string} text
   */
  sendTutorialPrompt(text) {
    if (typeof text !== 'string') return;
    ipcRenderer.send(IPC.OVERLAY_TUTORIAL_PROMPT, text);
  },

  /**
   * Subscribe to tutorial steps ([{ box, title, desc }]) from the vision model.
   * @param {(steps: Array<{ box: number[], title: string, desc: string }>) => void} callback
   * @returns {() => void} unsubscribe
   */
  onTutorialSteps(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, steps) => callback(steps);
    ipcRenderer.on(IPC.OVERLAY_TUTORIAL_STEPS, listener);
    return () => ipcRenderer.removeListener(IPC.OVERLAY_TUTORIAL_STEPS, listener);
  },

  /**
   * Subscribe to status updates ({ state, message }) from the main process.
   * @param {(status: { state: string, message: string }) => void} callback
   * @returns {() => void} unsubscribe
   */
  onStatus(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on(IPC.OVERLAY_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC.OVERLAY_STATUS, listener);
  },

  /**
   * Subscribe to the unlock signal (sequence finished or errored).
   * @param {() => void} callback
   * @returns {() => void} unsubscribe
   */
  onUnlock(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on(IPC.OVERLAY_UNLOCK, listener);
    return () => ipcRenderer.removeListener(IPC.OVERLAY_UNLOCK, listener);
  }
});
