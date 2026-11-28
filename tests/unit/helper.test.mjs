// Tests the Translator page's helper functions (translator/helper.js): voice choice, reading speed, and joining OCR lines
// into paragraphs. The file has no browser APIs for these, so it runs as a plain script in a sandbox.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(ROOT + "translator/helper.js", "utf8"), context);
const H = context.TwpHelper;
// Values made inside vm come from another realm, so they are compared after a JSON round trip.
const plain = value => JSON.parse(JSON.stringify(value));

// Language codes: the main language is compared, with either separator
assert.strictEqual(H.baseLanguage("fr-CA"), "fr");
assert.strictEqual(H.baseLanguage("zh_TW"), "zh");
assert.strictEqual(H.baseLanguage("EN"), "en");

// The first installed voice for the language, in the helper's order; none for detection or a missing voice
{
  const voices = [
    { id: "kokoro-v1.1-zh-int8", languages: ["en", "zh"] },
    { id: "supertonic-3", languages: ["en", "fr", "de"] },
    { id: "piper-cori", languages: ["en"] }
  ];
  assert.strictEqual(H.voiceFor(voices, "fr").id, "supertonic-3");
  assert.strictEqual(H.voiceFor(voices, "en-GB").id, "kokoro-v1.1-zh-int8");
  assert.strictEqual(H.voiceFor(voices, "ja"), null, "no installed voice speaks Japanese");
  assert.strictEqual(H.voiceFor(voices, "auto"), null, "Detect language uses the browser voices");
  assert.strictEqual(H.voiceFor(voices, ""), null);
  assert.strictEqual(H.voiceFor(undefined, "fr"), null);
}

// Reading speed: the three choices the page offers; anything else reads at normal speed
assert.strictEqual(H.readingFor("slow"), "slow");
assert.strictEqual(H.readingFor("slowest"), "slowest");
assert.strictEqual(H.readingFor("fast"), "normal");

// OCR lines: lines on one block join into a paragraph; a large gap starts a new one
{
  const paragraphs = H.groupOcrLines([
    { text: "The first line", box: [40, 100, 300, 120] },
    { text: "continues here.", box: [40, 124, 260, 144] },
    { text: "A new paragraph", box: [40, 260, 300, 280] }
  ]);
  assert.deepStrictEqual(plain(paragraphs), ["The first line continues here.", "A new paragraph"]);
}

// Lines are read top to bottom even when the list is in another order
{
  const paragraphs = H.groupOcrLines([
    { text: "second", box: [40, 124, 120, 144] },
    { text: "first", box: [40, 100, 120, 120] }
  ]);
  assert.deepStrictEqual(plain(paragraphs), ["first second"]);
}

// A word split by a hyphen at a line end is joined again
{
  const paragraphs = H.groupOcrLines([
    { text: "informa-", box: [40, 100, 160, 120] },
    { text: "tion is here", box: [40, 124, 200, 144] }
  ]);
  assert.deepStrictEqual(plain(paragraphs), ["information is here"]);
}

// Bad items are skipped; no lines give no paragraphs
{
  const paragraphs = H.groupOcrLines([
    { text: "   ", box: [0, 0, 1, 1] },
    { text: "ok", box: [0, 0] },
    null,
    { text: "kept", box: [40, 100, 120, 120] }
  ]);
  assert.deepStrictEqual(plain(paragraphs), ["kept"]);
  assert.deepStrictEqual(plain(H.groupOcrLines([])), []);
  assert.deepStrictEqual(plain(H.groupOcrLines(undefined)), []);
}

console.log("helper.test.mjs: all checks passed");
