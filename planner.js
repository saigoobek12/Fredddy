'use strict';

// Provider-agnostic, screen-aware tutorial planner (vision).
//
// Given a screenshot of the whole screen + a "how do I…" question, ask a
// multimodal model for an ordered, on-screen walkthrough. Supports multiple
// vision backends, chosen via AI_PROVIDER (or auto-detected from whichever API
// key is set):
//
//   - "groq"        Groq Cloud  (free tier, fast)        -> GROQ_API_KEY
//   - "openrouter"  OpenRouter  (has free models)        -> OPENROUTER_API_KEY
//   - "gemini"      Google Gemini (recommended)          -> GEMINI_API_KEY
//
// All three are called over their REST APIs with the global `fetch` (no extra
// npm dependency). Groq and OpenRouter are OpenAI-compatible and share one
// implementation; Gemini uses its own request shape with a responseSchema.

// OpenAI-compatible chat-completions providers.
const OPENAI_COMPATIBLE = {
  groq: {
    label: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyVar: 'GROQ_API_KEY',
    modelVar: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHint: 'https://console.groq.com/keys'
  },
  openrouter: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyVar: 'OPENROUTER_API_KEY',
    modelVar: 'OPENROUTER_MODEL',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    keyHint: 'https://openrouter.ai/keys'
  }
};

/** Decide which provider to use. Explicit AI_PROVIDER wins; otherwise auto-detect. */
function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'groq';
}

/** Human-readable label for the active provider (for status messages). */
function activeProviderLabel() {
  const provider = resolveProvider();
  if (provider === 'gemini') return 'Gemini';
  const cfg = OPENAI_COMPATIBLE[provider];
  return cfg ? cfg.label : provider;
}

// ===========================================================================
// Screen-aware tutorial planner (vision).
// ===========================================================================
//
// Each step highlights a region of the screen and explains it. Boxes use a
// resolution-independent 0–1000 grid ([ymin, xmin, ymax, xmax], Gemini's
// documented box convention) so the renderer can scale them to the actual
// overlay size.

const TUTORIAL_SYSTEM_PROMPT = `You are an expert in-app tutorial guide. You are
shown a SCREENSHOT of the user's screen and a question about how to perform a
workflow in whatever application is visible. Produce an ordered, multi-step
walkthrough that teaches the user how to do it using the real on-screen UI.

Rules:
- Respond with JSON ONLY. No prose, no markdown.
- Generate MULTIPLE logical steps (usually 3-6), in the order they must be done.
- For each step provide "target", "kind", and "box":
  * "target": the EXACT visible TEXT of the element to act on, copied verbatim
    from the screenshot (a menu name like "Window", a button caption, a panel
    title like "Auto layout", a layer name). This is the most important field —
    it is used to locate the element precisely. If the element has NO visible
    text (a bare toolbar icon, a color swatch, the blank canvas), set "target"
    to "".
  * "kind": one of "text" (the element shows the text in "target"),
    "icon" (an icon-only control with no readable label), or
    "region" (a large area such as the canvas/artboard or a whole panel).
  * "box": your best-estimate location as [ymin, xmin, ymax, xmax], each an
    INTEGER 0-1000 (y over image HEIGHT, x over image WIDTH; 0,0 = top-left).
    For "region" make the box span the ENTIRE area. This box is a FALLBACK and
    is also used to disambiguate when the target text appears more than once, so
    still place it as accurately as you can.
- "title" is a short step heading (e.g. "Step 1: Select the frame").
- "desc" is direct, technical instruction for that element. No filler, no
  "Welcome!". Go straight to the action.
- Only reference elements that are actually visible in the screenshot. Prefer
  targets that have visible text whenever possible.`;

const TUTORIAL_JSON_SHAPE =
  '\n\nReturn ONLY JSON of the form {"steps":[{"target":"...","kind":"text|icon|region",' +
  '"box":[ymin,xmin,ymax,xmax],"title":"...","desc":"..."}]} with box values as integers 0-1000.';

/**
 * Read width/height from a base64 PNG (IHDR chunk) so we can tell the model the
 * exact image dimensions. Returns null if it isn't a parseable PNG.
 */
function pngDimensions(base64Png) {
  try {
    const buf = Buffer.from(base64Png, 'base64');
    // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) then width, height.
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** Prepend the image size so the model grounds its 0-1000 coordinates. */
function groundPrompt(userPrompt, base64Png) {
  const dim = pngDimensions(base64Png);
  if (!dim) return userPrompt;
  return (
    `The screenshot is ${dim.width}x${dim.height} pixels. Remember box values ` +
    `are normalized 0-1000 (x over width, y over height).\n\nQuestion: ${userPrompt}`
  );
}

function normalizeTutorialSteps(parsed) {
  if (!parsed || !Array.isArray(parsed.steps)) {
    throw new Error('Vision model response did not contain a "steps" array.');
  }
  const steps = parsed.steps
    .filter(
      (s) =>
        s &&
        Array.isArray(s.box) &&
        s.box.length === 4 &&
        s.box.every((n) => typeof n === 'number' && isFinite(n)) &&
        typeof s.title === 'string' &&
        typeof s.desc === 'string'
    )
    .map((s) => ({
      box: s.box.map((n) => Math.max(0, Math.min(1000, Math.round(n)))),
      title: s.title.trim(),
      desc: s.desc.trim(),
      target: typeof s.target === 'string' ? s.target.trim() : '',
      kind: ['text', 'icon', 'region'].includes(s.kind) ? s.kind : 'text'
    }));
  if (!steps.length) {
    throw new Error('Vision model returned no usable tutorial steps.');
  }
  return steps;
}

/** Gemini vision via REST (inlineData image part + responseSchema). */
async function geminiTutorial(userPrompt, base64Png, apiKey, model) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
    encodeURIComponent(apiKey);
  const body = {
    systemInstruction: { parts: [{ text: TUTORIAL_SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          { text: groundPrompt(userPrompt, base64Png) },
          { inlineData: { mimeType: 'image/png', data: base64Png } }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          steps: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                target: { type: 'STRING' },
                kind: { type: 'STRING' },
                box: { type: 'ARRAY', items: { type: 'NUMBER' } },
                title: { type: 'STRING' },
                desc: { type: 'STRING' }
              },
              required: ['target', 'kind', 'box', 'title', 'desc']
            }
          }
        },
        required: ['steps']
      },
      temperature: 0.2
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini vision API error ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0]
      ? data.candidates[0].content.parts[0].text
      : '';
  if (!text) throw new Error('Gemini vision returned an empty response.');
  return normalizeTutorialSteps(JSON.parse(text));
}

/** OpenAI-compatible vision (Groq / OpenRouter) via chat completions. */
async function openAiCompatibleTutorial(userPrompt, dataUrl, cfg, model, apiKey) {
  const body = {
    model,
    messages: [
      { role: 'system', content: TUTORIAL_SYSTEM_PROMPT + TUTORIAL_JSON_SHAPE },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: groundPrompt(userPrompt, dataUrl.slice(dataUrl.indexOf(',') + 1))
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  };
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://localhost/electron-assistant-overlay',
      'X-Title': 'Electron Assistant Overlay'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${cfg.label} vision API error ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
  if (!content) throw new Error(`${cfg.label} returned an empty response.`);
  return normalizeTutorialSteps(JSON.parse(content));
}

// Vision-capable model defaults per provider (override with the *_MODEL vars).
const VISION_MODELS = {
  gemini: 'gemini-2.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  // Qwen2.5-VL grounds UI elements far better than Llama-4 Scout. Override with
  // OPENROUTER_MODEL (e.g. a ":free" vision model) if you don't want to spend.
  openrouter: 'qwen/qwen2.5-vl-72b-instruct'
};

/**
 * Turn a screenshot + question into an ordered tutorial.
 *
 * @param {string} userPrompt
 * @param {string} dataUrl  A data: URL (image/png;base64,...) of the screen.
 * @returns {Promise<Array<{ box: number[], title: string, desc: string }>>}
 */
async function generateTutorial(userPrompt, dataUrl) {
  if (typeof userPrompt !== 'string' || !userPrompt.trim()) {
    throw new Error('Prompt is empty.');
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    throw new Error('No screenshot was captured.');
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const provider = resolveProvider();

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Add it to .env.');
    const model = process.env.GEMINI_MODEL || VISION_MODELS.gemini;
    return geminiTutorial(userPrompt, base64, apiKey, model);
  }

  const cfg = OPENAI_COMPATIBLE[provider];
  if (!cfg) {
    throw new Error(`Unknown AI_PROVIDER "${provider}". Use groq, openrouter, or gemini.`);
  }
  const apiKey = process.env[cfg.keyVar];
  if (!apiKey) {
    throw new Error(
      `${cfg.label} is selected but ${cfg.keyVar} is not set. Add it to .env ` +
        `(get a free key at ${cfg.keyHint}).`
    );
  }
  const model = process.env[cfg.modelVar] || VISION_MODELS[provider] || cfg.defaultModel;
  return openAiCompatibleTutorial(userPrompt, dataUrl, cfg, model, apiKey);
}

module.exports = {
  generateTutorial,
  resolveProvider,
  activeProviderLabel
};
