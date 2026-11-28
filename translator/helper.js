"use strict";
// The Atlas Helper's offline services for the Translator page: reading aloud with an installed voice, and text recognition
// (OCR) for scanned PDF pages. The helper runs on this computer and this page talks to it on 127.0.0.1, with the token that
// this browser got when it was connected (Options, Offline). Nothing here goes to an online service.
(function (global) {
  const HELPER = "http://127.0.0.1:47632";
  // The helper refuses longer texts to read aloud (speak.rs MAX_CHARS). Those are read with the browser's voices instead.
  const SPEAK_MAX_CHARS = 2000;
  const PING_MS = 1500;
  const SPEAK_MS = 15000;
  const OCR_MS = 120000;
  // A gap between two lines larger than this many line heights starts a new paragraph.
  const PARAGRAPH_GAP = 0.7;
  const READINGS = { normal: "normal", slow: "slow", slowest: "slowest" };

  function token() {
    return String((global.twpConfig && global.twpConfig.get("offlineHelperToken")) || "").trim();
  }

  // The main language of a code: "fr-CA" and "fr_CA" are "fr".
  function baseLanguage(code) {
    return String(code || "").split(/[-_]/)[0].toLowerCase();
  }

  // The first installed voice that speaks the language, in the helper's order (the default voice comes first).
  // Null when there is no code (Detect language) or no voice.
  function voiceFor(voices, code) {
    if (!code || code === "auto" || !Array.isArray(voices)) return null;
    const base = baseLanguage(code);
    return voices.find(voice => Array.isArray(voice.languages) && voice.languages.some(l => baseLanguage(l) === base)) || null;
  }

  function readingFor(speed) {
    return READINGS[speed] || "normal";
  }

  // Joins the lines of one page into paragraphs. Lines are read top to bottom; a large gap starts a new paragraph, and a
  // word split by a hyphen at the end of a line is joined again.
  function groupOcrLines(lines) {
    const items = (Array.isArray(lines) ? lines : [])
      .filter(l => l && typeof l.text === "string" && l.text.trim() && Array.isArray(l.box) && l.box.length === 4)
      .map(l => ({ text: l.text.trim(), left: Number(l.box[0]), top: Number(l.box[1]), bottom: Number(l.box[3]) }))
      .sort((a, b) => a.top - b.top || a.left - b.left);
    if (items.length === 0) return [];
    const heights = items.map(i => Math.max(1, i.bottom - i.top)).sort((a, b) => a - b);
    const typical = heights[Math.floor(heights.length / 2)];
    const paragraphs = [];
    let current = null;
    let previous = null;
    for (const item of items) {
      if (previous === null || item.top - previous.bottom > PARAGRAPH_GAP * typical) {
        if (current !== null) paragraphs.push(current);
        current = item.text;
      } else if (/-$/.test(current) && /^\p{Ll}/u.test(item.text)) {
        current = current.slice(0, -1) + item.text;
      } else {
        current += " " + item.text;
      }
      previous = item;
    }
    if (current !== null) paragraphs.push(current);
    return paragraphs;
  }

  // Asks the helper what it has. Null when it does not answer in time.
  async function ping() {
    try {
      const response = await timedFetch(HELPER + "/api/offline/ping", {}, PING_MS);
      const body = await response.json();
      return body && body.ok ? body : null;
    } catch (e) {
      return null;
    }
  }

  function timedFetch(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, Object.assign({ signal: controller.signal }, options)).finally(() => clearTimeout(timer));
  }

  // Reads the text aloud with the helper's voice for the language. Returns true when the helper started speaking. It
  // returns false (and the page uses the browser's voices) when the text is too long, the helper or its runtime is missing,
  // no installed voice speaks the language, or this browser is not connected.
  async function speakWithHelper(text, code, speed) {
    if (!text || !text.trim() || text.length > SPEAK_MAX_CHARS || !token()) return false;
    const status = await ping();
    if (!status || !status.speech || status.speech.runtime !== true) return false;
    const voice = voiceFor(status.speech.voices, code);
    if (!voice) return false;
    try {
      const response = await timedFetch(HELPER + "/api/offline/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ voice: voice.id, text, reading: readingFor(speed) })
      }, SPEAK_MS);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  // Whether the helper can read scanned pages right now: connected, and the text recognition models are installed.
  async function ocrAvailable() {
    if (!token()) return false;
    const status = await ping();
    return Boolean(status && status.ocr === true);
  }

  // Sends one page picture (a PNG data address) to the helper. Resolves with its lines: { text, box: [l, t, r, b] }.
  async function readOcr(imageDataUrl) {
    if (!token()) throw new Error("Connect this browser to the Atlas Helper first (Options, Offline).");
    let response;
    try {
      response = await timedFetch(HELPER + "/api/offline/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ image: imageDataUrl, engine: "ocrs" })
      }, OCR_MS);
    } catch (e) {
      throw new Error("The Atlas Helper did not answer. Start it and try again.");
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) throw new Error("Install the text recognition models in the Atlas Helper (Offline tab).");
    if (response.status === 403) throw new Error("This browser is no longer connected to the Atlas Helper. Connect it again in Options.");
    if (!response.ok) throw new Error(body.message || "The Atlas Helper could not read the page.");
    return Array.isArray(body.lines) ? body.lines : [];
  }

  global.TwpHelper = {
    HELPER,
    SPEAK_MAX_CHARS,
    baseLanguage,
    voiceFor,
    readingFor,
    groupOcrLines,
    speakWithHelper,
    ocrAvailable,
    readOcr
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
