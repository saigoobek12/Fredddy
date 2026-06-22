'use strict';

// Local OCR-based locator. The vision model decides WHAT each tutorial step
// targets (and gives a rough box); this module finds WHERE that target's text
// actually is on the screenshot using Tesseract — pixel-accurate, free, and
// offline.
//
// Locating is provider-independent and resilient to imprecise models:
//   1. Try to match the step's `target` text (exact run of words on one line).
//   2. If that fails, mine candidate phrases from the title/desc (quoted text,
//      capitalised UI words) and try those.
//   3. If still nothing, SNAP to the OCR word/line nearest the model's rough
//      box center, so a text/icon step lands on a real label instead of empty
//      space.
// When a target appears multiple times the model's rough box disambiguates
// (closest match wins). Large "region" targets (canvas/panels) keep the box.

const { createWorker } = require('tesseract.js');

let workerPromise = null;

/**
 * Lazily create (and reuse) a single Tesseract worker.
 * @param {{langPath?:string, cachePath?:string, gzip?:boolean, workerPath?:string, corePath?:string}} [options]
 */
function getWorker(options) {
  if (!workerPromise) {
    const opts = {};
    if (options) {
      if (options.langPath) opts.langPath = options.langPath;
      if (options.cachePath) opts.cachePath = options.cachePath;
      if (typeof options.gzip === 'boolean') opts.gzip = options.gzip;
      if (options.workerPath) opts.workerPath = options.workerPath;
      if (options.corePath) opts.corePath = options.corePath;
    }
    workerPromise = createWorker('eng', 1, opts).catch((err) => {
      workerPromise = null; // allow a later retry
      throw err;
    });
  }
  return workerPromise;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common words that should never be used as a locate target on their own.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'your',
  'my', 'this', 'that', 'it', 'is', 'are', 'be', 'with', 'click', 'select',
  'open', 'choose', 'press', 'panel', 'button', 'menu', 'option', 'icon',
  'tool', 'then', 'from', 'into', 'new', 'set', 'go', 'top', 'left', 'right',
  'bar', 'enter', 'type', 'value', 'use', 'drag'
]);

function unionBbox(a, b) {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1)
  };
}

/** Levenshtein distance (small strings only). */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** True if OCR word `lw` is a fuzzy match for target word `tw`. */
function wordMatches(lw, tw) {
  if (lw === tw) return true;
  // For 3+ char targets, allow the OCR word to contain it (e.g. "opacity:"
  // matches "opacity"). Not the reverse — tiny fragments shouldn't match.
  if (tw.length >= 3 && lw.includes(tw)) return true;
  // Tolerate a single OCR/model character error on words of 4+ chars.
  if (tw.length >= 4 && Math.abs(lw.length - tw.length) <= 2) {
    return editDistance(lw, tw) <= 1;
  }
  return false;
}

/** Flatten Tesseract's block tree into per-line arrays of words. */
function extractLines(data) {
  const lines = [];
  (data.blocks || []).forEach((b) =>
    (b.paragraphs || []).forEach((p) =>
      (p.lines || []).forEach((l) => {
        const words = (l.words || [])
          .filter((w) => w && w.text && w.bbox)
          .map((w) => ({ norm: norm(w.text), bbox: w.bbox, conf: w.confidence || 0 }))
          .filter((w) => w.norm && w.conf >= 40); // drop low-confidence noise
        if (words.length) lines.push(words);
      })));
  return lines;
}

/**
 * Find consecutive words in a line matching the target word sequence; return
 * the union bbox of the matched run, or null.
 */
function matchInLine(lineWords, targetWords) {
  for (let i = 0; i + targetWords.length <= lineWords.length; i += 1) {
    let ok = true;
    for (let j = 0; j < targetWords.length; j += 1) {
      if (!wordMatches(lineWords[i + j].norm, targetWords[j])) {
        ok = false;
        break;
      }
    }
    if (ok) {
      let bb = lineWords[i].bbox;
      let conf = lineWords[i].conf;
      for (let j = 1; j < targetWords.length; j += 1) {
        bb = unionBbox(bb, lineWords[i + j].bbox);
        conf = Math.min(conf, lineWords[i + j].conf);
      }
      return { bbox: bb, conf };
    }
  }
  return null;
}

/** Center (in pixels) of a normalized 0-1000 [ymin,xmin,ymax,xmax] box. */
function boxCenterPx(box, W, H) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = box;
  return { x: ((xmin + xmax) / 2 / 1000) * W, y: ((ymin + ymax) / 2 / 1000) * H };
}

/** Convert a pixel bbox to a padded normalized 0-1000 box. */
function bboxToNormBox(bbox, W, H) {
  const padX = W * 0.006;
  const padY = H * 0.006;
  const x0 = Math.max(0, bbox.x0 - padX);
  const y0 = Math.max(0, bbox.y0 - padY);
  const x1 = Math.min(W, bbox.x1 + padX);
  const y1 = Math.min(H, bbox.y1 + padY);
  return [
    Math.round((y0 / H) * 1000),
    Math.round((x0 / W) * 1000),
    Math.round((y1 / H) * 1000),
    Math.round((x1 / W) * 1000)
  ];
}

/** Pick the candidate match nearest the model's rough box (or highest conf). */
function pickBest(candidates, center) {
  if (center) {
    let best = candidates[0];
    let bestDist = Infinity;
    candidates.forEach((c) => {
      const cx = (c.bbox.x0 + c.bbox.x1) / 2;
      const cy = (c.bbox.y0 + c.bbox.y1) / 2;
      const d = (cx - center.x) ** 2 + (cy - center.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    });
    return best;
  }
  return candidates.reduce((a, b) => (b.conf > a.conf ? b : a), candidates[0]);
}

/** All word sequences in `lines` matching `targetWords`. */
function findCandidates(lines, targetWords) {
  const candidates = [];
  lines.forEach((lineWords) => {
    const m = matchInLine(lineWords, targetWords);
    if (m) candidates.push(m);
  });
  return candidates;
}

/**
 * Mine fallback target phrases from the step's title/desc when `target` didn't
 * match: prefer quoted strings (the model often quotes the exact UI label),
 * then individual non-stopword tokens.
 */
function fallbackPhrases(step) {
  const phrases = [];
  const text = `${step.title || ''} \u0001 ${step.desc || ''}`;
  const quoted = text.match(/["'\u2018\u2019\u201c\u201d]([^"'\u2018\u2019\u201c\u201d]{2,40})["'\u2018\u2019\u201c\u201d]/g) || [];
  quoted.forEach((q) => {
    const words = norm(q).split(' ').filter(Boolean);
    if (words.length) phrases.push(words);
  });
  // Single significant tokens as a last resort.
  norm(text)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .forEach((w) => phrases.push([w]));
  return phrases;
}

/** Nearest OCR word to a pixel point, scanning every line/word. */
function nearestWord(lines, center) {
  if (!center) return null;
  let best = null;
  let bestDist = Infinity;
  lines.forEach((lineWords) =>
    lineWords.forEach((w) => {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      const d = (cx - center.x) ** 2 + (cy - center.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = w;
      }
    }));
  return best ? { bbox: best.bbox, conf: best.conf, dist: Math.sqrt(bestDist) } : null;
}

/**
 * Locate one step's target text.
 * @returns {{box:number[], how:string}|null} refined box + how it was found
 */
function locateOne(step, lines, W, H) {
  const kind = typeof step.kind === 'string' ? step.kind : '';
  if (kind === 'region') return null; // large areas keep the model's box
  const center = boxCenterPx(step.box, W, H);

  // 1) Exact-ish match on the declared target.
  const targetWords = norm(step.target).split(' ').filter(Boolean);
  if (targetWords.length) {
    const candidates = findCandidates(lines, targetWords);
    if (candidates.length) {
      return { box: bboxToNormBox(pickBest(candidates, center).bbox, W, H), how: 'target' };
    }
  }

  // 2) Try phrases mined from the title/desc.
  for (const phrase of fallbackPhrases(step)) {
    const candidates = findCandidates(lines, phrase);
    if (candidates.length) {
      return { box: bboxToNormBox(pickBest(candidates, center).bbox, W, H), how: 'text-hint' };
    }
  }

  // 3) Snap to the nearest OCR label to the model's guess (text/icon only), so
  //    the spotlight lands on a real UI element rather than empty space. Only
  //    snap when reasonably close (within ~12% of the screen diagonal).
  if (center) {
    const near = nearestWord(lines, center);
    if (near) {
      const diag = Math.sqrt(W * W + H * H);
      if (near.dist <= diag * 0.12) {
        return { box: bboxToNormBox(near.bbox, W, H), how: 'snap' };
      }
    }
  }

  return null;
}

/**
 * Refine tutorial step boxes using OCR.
 * @param {Array} steps      steps from the planner ([{ box, title, desc, target, kind }])
 * @param {Buffer} pngBuffer the screenshot PNG bytes
 * @param {{width:number,height:number}} dims
 * @param {{langPath?:string, cachePath?:string, gzip?:boolean, workerPath?:string, corePath?:string}} [options]
 *        OCR worker options (bundled language-data path, cache dir, gzip flag,
 *        and worker/core script paths for packaged apps)
 * @returns {Promise<{steps: Array, located: number}>}
 */
async function locateSteps(steps, pngBuffer, dims, options) {
  const W = dims && dims.width;
  const H = dims && dims.height;
  if (!W || !H) return { steps, located: 0 };

  let lines;
  try {
    const worker = await getWorker(options);
    const { data } = await worker.recognize(pngBuffer, {}, { blocks: true });
    lines = extractLines(data);
  } catch (err) {
    // OCR unavailable (e.g. language data couldn't load): fall back to model boxes.
    return { steps, located: 0, error: err && err.message ? err.message : String(err) };
  }

  let located = 0;
  const refined = steps.map((step) => {
    const found = locateOne(step, lines, W, H);
    if (found) {
      located += 1;
      return Object.assign({}, step, { box: found.box, located: true, locatedBy: found.how });
    }
    return step;
  });
  return { steps: refined, located };
}

module.exports = { locateSteps };
