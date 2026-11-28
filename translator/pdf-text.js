"use strict";
/*
 * Turns the text items of a PDF page into lines and paragraphs, and splits them into batches for translation.
 * Plain functions with no browser APIs: translator/pdf-translate.mjs uses them, and tests/unit/pdfText.test.mjs runs them.
 *
 * An item: { str, x, y, width, height, eol }. x and y are in PDF points (y grows upwards).
 */
var TwpPdfText = (function () {
  const DEFAULT_HEIGHT = 10;

  // Items on the same line (same y, within half a line) become one line. Lines come top to bottom.
  function groupLines(items) {
    const parts = (items || [])
      .filter(i => i && typeof i.str === "string" && i.str.length > 0)
      .map(i => ({
        str: i.str,
        x: Number(i.x) || 0,
        y: Number(i.y) || 0,
        width: Number(i.width) || 0,
        height: Number(i.height) || DEFAULT_HEIGHT,
        eol: Boolean(i.eol)
      }));
    parts.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const groups = [];
    for (const part of parts) {
      const current = groups[groups.length - 1];
      const tolerance = Math.max(part.height, current ? current.height : 0) * 0.5;
      if (current && Math.abs(current.y - part.y) <= tolerance) {
        current.parts.push(part);
        current.height = Math.max(current.height, part.height);
      } else {
        groups.push({ y: part.y, height: part.height, parts: [part] });
      }
    }
    const lines = [];
    for (const group of groups) {
      group.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null;
      for (const part of group.parts) {
        const gap = end === null ? 0 : part.x - end;
        if (end !== null && gap > part.height * 0.2 && !/\s$/.test(text) && !/^\s/.test(part.str)) text += " ";
        text += part.str;
        end = part.x + part.width;
      }
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean) lines.push({ text: clean, y: group.y, x: group.parts[0].x, height: group.height });
    }
    return lines;
  }

  // Lines that sit close together form a paragraph. A big gap, or a jump sideways (a new column), starts a new one.
  // A word split at the end of a line ("trans-") is joined to the next line when that line goes on in lower case.
  function buildParagraphs(lines) {
    const paragraphs = [];
    let current = null;
    let prev = null;
    for (const line of lines) {
      const newParagraph = prev === null
        || (prev.y - line.y) > line.height * 1.8
        || Math.abs(prev.x - line.x) > line.height * 6;
      if (newParagraph) {
        if (current !== null) paragraphs.push(current);
        current = line.text;
      } else if (/[A-Za-z\u00C0-\u024F]-$/.test(current) && /^[a-z\u00DF-\u00FF]/.test(line.text)) {
        current = current.slice(0, -1) + line.text;
      } else {
        current += " " + line.text;
      }
      prev = line;
    }
    if (current !== null) paragraphs.push(current);
    return paragraphs;
  }

  // A paragraph longer than maxChars is cut at a space, so one request never gets too much text.
  function splitLong(paragraph, maxChars = 1500) {
    const pieces = [];
    let rest = paragraph;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut <= 0) cut = maxChars;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  }

  // Batches of paragraphs for one translation request: at most maxItems paragraphs and about maxChars characters.
  function batches(paragraphs, maxItems = 20, maxChars = 4000) {
    const out = [];
    let batch = [];
    let chars = 0;
    for (const paragraph of paragraphs) {
      if (batch.length && (batch.length >= maxItems || chars + paragraph.length > maxChars)) {
        out.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(paragraph);
      chars += paragraph.length;
    }
    if (batch.length) out.push(batch);
    return out;
  }

  // Common words of some languages. A best guess only: the text is matched by how many of these words it contains.
  const STOPWORDS = {
    en: ["the", "and", "of", "to", "is", "that", "with", "for", "are", "this", "was", "not"],
    fr: ["le", "les", "et", "des", "est", "une", "que", "dans", "pour", "pas", "vous", "sont"],
    de: ["der", "die", "und", "das", "ist", "nicht", "ein", "eine", "mit", "auf", "auch", "sich"],
    es: ["el", "los", "las", "y", "que", "es", "por", "para", "una", "como", "pero", "sus"],
    it: ["il", "che", "di", "non", "sono", "con", "del", "della", "per", "gli", "anche", "questo"],
    pt: ["os", "as", "uma", "para", "com", "não", "mais", "seu", "dos", "das", "muito", "também"],
    nl: ["het", "een", "van", "niet", "zijn", "met", "voor", "dat", "ook", "maar", "bij", "naar"],
    sv: ["och", "att", "det", "som", "och", "inte", "med", "för", "till", "är", "den", "har"],
    pl: ["się", "nie", "jest", "że", "na", "to", "jak", "tak", "do", "po", "czy", "przez"],
    tr: ["ve", "bir", "bu", "için", "ile", "çok", "daha", "gibi", "olarak", "var", "değil", "ama"],
    id: ["yang", "dan", "di", "itu", "dengan", "untuk", "tidak", "ini", "dari", "dalam", "akan", "adalah"]
  };
  const SCRIPTS = [
    { code: "ru", pattern: /\p{Script=Cyrillic}/gu },
    { code: "ar", pattern: /\p{Script=Arabic}/gu },
    { code: "el", pattern: /\p{Script=Greek}/gu },
    { code: "he", pattern: /\p{Script=Hebrew}/gu },
    { code: "ko", pattern: /\p{Script=Hangul}/gu },
    { code: "ja", pattern: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu },
    { code: "zh", pattern: /\p{Script=Han}/gu }
  ];

  // Guesses the language of a text. `allowed` lists the language codes that may be returned (for example the offline
  // languages). Returns { code, hits, share } or null when the text is too short or no language clearly wins.
  function detectLanguage(text, allowed) {
    const ok = code => !allowed || allowed.includes(code);
    const sample = String(text || "");
    const letters = sample.match(/\p{L}/gu) || [];
    if (letters.length < 20) return null;
    // Scripts first: a text that is mostly one non-Latin script names that language.
    // Kana is used only in Japanese, so a noticeable share of it means Japanese (kanji alone could be Chinese).
    const kana = (sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
    if (kana / letters.length > 0.1 && ok("ja")) return { code: "ja", hits: kana, share: kana / letters.length };
    let best = null;
    for (const script of SCRIPTS) {
      const count = (sample.match(script.pattern) || []).length;
      if (count / letters.length > 0.5 && ok(script.code)) {
        best = { code: script.code, hits: count, share: count / letters.length };
      }
    }
    if (best) return best;
    const words = sample.toLowerCase().match(/\p{L}+/gu) || [];
    if (words.length < 20) return null;
    const scores = [];
    for (const [code, list] of Object.entries(STOPWORDS)) {
      if (!ok(code)) continue;
      const hits = words.filter(w => list.includes(w)).length;
      scores.push({ code, hits, share: hits / words.length });
    }
    scores.sort((a, b) => b.hits - a.hits);
    const top = scores[0];
    const runnerUp = scores[1];
    if (!top || top.hits < 8 || top.share < 0.1) return null;
    if (runnerUp && runnerUp.hits >= top.hits * 0.8) return null; // too close to call
    return top;
  }

  return { groupLines, buildParagraphs, splitLong, batches, detectLanguage };
})();
