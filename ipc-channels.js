'use strict';

/**
 * Single source of truth for IPC channel names shared across the main process
 * and the preload scripts. Keeping them here avoids magic strings drifting out
 * of sync between sender and receiver.
 */
module.exports = Object.freeze({
  // Overlay renderer -> main: toggle overlay click-through (true = ignore).
  SET_IGNORE_MOUSE: 'overlay:set-ignore-mouse',

  // Main -> overlay renderer: status updates ({ state, message }).
  OVERLAY_STATUS: 'overlay:status',
  // Main -> overlay renderer: re-enable the (locked) input UI.
  OVERLAY_UNLOCK: 'overlay:unlock',

  // Overlay renderer -> main: a "how do I…" question. Main screenshots the
  // whole screen, asks a vision model, and returns tutorial steps.
  OVERLAY_TUTORIAL_PROMPT: 'overlay:tutorial-prompt',
  // Main -> overlay renderer: ordered tutorial steps
  // ([{ box, title, desc, target, kind }]).
  OVERLAY_TUTORIAL_STEPS: 'overlay:tutorial-steps'
});
