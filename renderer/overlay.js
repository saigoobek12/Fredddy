'use strict';

// Overlay renderer logic (Window B).
//
// Two responsibilities:
//  1. Toggle click-through so the overlay only captures the mouse over the
//     interactive chat widget; everywhere else input passes to the window
//     behind it.
//  2. Send typed commands to the main process via the secure overlayAPI bridge.
(function () {
  const api = window.overlayAPI;
  if (!api) return;

  const widget = document.getElementById('chat-widget');

  const promptForm = document.getElementById('prompt-form');
  const promptInput = document.getElementById('prompt-input');
  const promptSend = document.getElementById('prompt-send');
  const statusEl = document.getElementById('status');

  // Tutorial layer elements.
  const tutorialLayer = document.getElementById('tutorial-layer');
  const tHighlight = document.getElementById('tutorial-highlight');
  const tCursor = document.getElementById('tutorial-cursor');
  const tTooltip = document.getElementById('tutorial-tooltip');
  const tCounter = document.getElementById('tutorial-counter');
  const tTitle = document.getElementById('tutorial-title');
  const tDesc = document.getElementById('tutorial-desc');
  const tNext = document.getElementById('tutorial-next');

  // --- Click-through region management -------------------------------------
  // The window is created with setIgnoreMouseEvents(true, { forward: true }),
  // so mouse-move events still reach this renderer while clicks pass through.
  // We flip to interactive only while the cursor is over a [data-interactive]
  // element, and flip back to click-through when it leaves.
  let interactive = false;
  // While a tutorial is on screen the whole overlay must capture input (for the
  // Enter key and the Next button), so the hover-based toggle is suspended.
  let tutorialActive = false;

  function setInteractive(next) {
    if (next === interactive) return;
    interactive = next;
    api.setMouseIgnore(!next);
  }

  function isOverInteractive(target) {
    return target instanceof Element && target.closest('[data-interactive]') !== null;
  }

  document.addEventListener('mousemove', (event) => {
    if (tutorialActive) return;
    setInteractive(isOverInteractive(event.target));
  });

  // Safety net: if the pointer leaves the widget, return to click-through.
  widget.addEventListener('mouseleave', () => setInteractive(false));
  widget.addEventListener('mouseenter', () => setInteractive(true));

  // --- AI prompt: lock UI, plan + execute, unlock on completion -------------
  let locked = false;

  function setLocked(next) {
    locked = next;
    widget.classList.toggle('locked', next);
    promptInput.disabled = next;
    promptSend.disabled = next;
    promptSend.textContent = next ? '…' : 'Send';
  }

  function setStatus(state, message) {
    statusEl.className = `status ${state || ''}`.trim();
    statusEl.textContent = message || '';
  }

  promptForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (locked) return;
    const text = promptInput.value.trim();
    if (!text) return;
    setLocked(true);
    setStatus('thinking', 'Reading your screen…');
    api.sendTutorialPrompt(text);
  });

  if (typeof api.onStatus === 'function') {
    api.onStatus((status) => {
      if (!status) return;
      setStatus(status.state, status.message);
    });
  }

  if (typeof api.onUnlock === 'function') {
    api.onUnlock(() => {
      setLocked(false);
      promptInput.value = '';
      promptInput.focus();
    });
  }

  // --- Screen tutorial engine ------------------------------------------------
  // Receives [{ box: [ymin,xmin,ymax,xmax] (0-1000), title, desc }] and walks
  // through them: a spotlight darkens the screen except the target region, a
  // tooltip explains the step, and Enter / Next advances. The window itself is
  // transparent, so the real app stays visible inside the spotlight hole.
  let steps = [];
  let stepIndex = 0;

  function clampBox(box) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ymin = box[0] / 1000;
    const xmin = box[1] / 1000;
    const ymax = box[2] / 1000;
    const xmax = box[3] / 1000;
    let left = Math.min(xmin, xmax) * W;
    let top = Math.min(ymin, ymax) * H;
    let width = Math.abs(xmax - xmin) * W;
    let height = Math.abs(ymax - ymin) * H;
    // Guarantee a visible minimum so a tiny/degenerate box is still findable.
    width = Math.max(width, 24);
    height = Math.max(height, 24);
    left = Math.max(0, Math.min(left, W - width));
    top = Math.max(0, Math.min(top, H - height));
    return { left, top, width, height };
  }

  function placeTooltip(rect) {
    const gap = 14;
    const tw = tTooltip.offsetWidth || 300;
    const th = tTooltip.offsetHeight || 150;
    const W = window.innerWidth;
    const H = window.innerHeight;

    let left = rect.left + rect.width + gap; // prefer right of the target
    let top = rect.top;
    if (left + tw > W - 12) left = rect.left - tw - gap; // flip to the left
    if (left < 12) {
      // No room either side: place below (or above) and center horizontally.
      left = Math.max(12, Math.min(rect.left + rect.width / 2 - tw / 2, W - tw - 12));
      top = rect.top + rect.height + gap;
    }
    if (top + th > H - 12) top = H - th - 12;
    if (top < 12) top = 12;

    tTooltip.style.left = `${Math.round(left)}px`;
    tTooltip.style.top = `${Math.round(top)}px`;
  }

  function renderStep() {
    const step = steps[stepIndex];
    if (!step) return;
    const rect = clampBox(step.box);

    tHighlight.style.left = `${Math.round(rect.left)}px`;
    tHighlight.style.top = `${Math.round(rect.top)}px`;
    tHighlight.style.width = `${Math.round(rect.width)}px`;
    tHighlight.style.height = `${Math.round(rect.height)}px`;

    tCursor.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    tCursor.style.top = `${Math.round(rect.top + rect.height / 2)}px`;

    tCounter.textContent = `Step ${stepIndex + 1} / ${steps.length}`;
    tTitle.textContent = step.title;
    tDesc.textContent = step.desc;
    tNext.textContent =
      stepIndex >= steps.length - 1 ? 'Done \u2714' : 'Next \u25B6';

    // Defer tooltip placement until it has measured its real size.
    requestAnimationFrame(() => placeTooltip(rect));
  }

  function startTutorial(incoming) {
    if (!Array.isArray(incoming) || !incoming.length) {
      setStatus('error', 'No tutorial steps were returned.');
      setLocked(false);
      return;
    }
    steps = incoming;
    stepIndex = 0;
    tutorialActive = true;
    // Capture all input while guiding (needed for Enter + Next button).
    api.setMouseIgnore(false);
    interactive = true;
    tutorialLayer.classList.add('active');
    tutorialLayer.setAttribute('aria-hidden', 'false');
    setStatus('running', `Guiding you through ${steps.length} step(s)…`);
    renderStep();
  }

  function nextStep() {
    if (!tutorialActive) return;
    stepIndex += 1;
    if (stepIndex >= steps.length) {
      endTutorial();
      return;
    }
    renderStep();
  }

  function endTutorial() {
    tutorialActive = false;
    tutorialLayer.classList.remove('active');
    tutorialLayer.setAttribute('aria-hidden', 'true');
    steps = [];
    stepIndex = 0;
    // Restore click-through and release the prompt input.
    setInteractive(false);
    setLocked(false);
    setStatus('done', 'Tutorial complete.');
    promptInput.value = '';
  }

  tNext.addEventListener('click', (event) => {
    event.preventDefault();
    nextStep();
  });

  // Enter advances; Escape cancels the walkthrough.
  window.addEventListener('keydown', (event) => {
    if (!tutorialActive) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      nextStep();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      endTutorial();
      setStatus('done', 'Tutorial dismissed.');
    }
  });

  // Re-place the spotlight if the window size changes mid-tutorial.
  window.addEventListener('resize', () => {
    if (tutorialActive) renderStep();
  });

  if (typeof api.onTutorialSteps === 'function') {
    api.onTutorialSteps((incoming) => startTutorial(incoming));
  }
})();
