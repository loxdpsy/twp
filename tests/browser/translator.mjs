// Browser test for the Translator page's PDF tab (translator/translator.html, translator/pdf-translate.mjs), run in a real
// Chromium with the real pdf.js from lib/pdfjs. The chrome.* APIs are stood in: the test records each message sent to the
// background, and answers "translateTextOnly" with a fake translation (T[...] around each paragraph).
// Checks: the PDF is read into paragraphs, the request uses the offline-only message (no other service), the paragraphs are
// shown, and a pair without English is refused.
// Run with: CHROME_PATH=/path/to/chromium node translator.mjs   (from tests/browser, after npm ci)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error("CHROME_PATH is not set. Point it at a Chrome or Chromium binary.");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".bcmap": "application/octet-stream" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const file = path.join(root, urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const store = { targetLanguage: "fr", targetLanguages: ["fr"], textTranslatorService: "google", pageTranslatorService: "google", enabledServices: ["google", "offline"], uiLanguage: "en" };
const stub = `(() => {
  const store = ${JSON.stringify(store)};
  window.__listeners = [];
  window.__messages = [];
  window.__tabs = [];
  const ev = () => ({ addListener(fn) { window.__listeners.push(fn); }, removeListener() {}, hasListener() { return false; } });
  const cb = (fn, ...a) => { if (typeof fn === "function") fn(...a); };
  window.chrome = {
    runtime: {
      id: "browser-test", lastError: undefined,
      getURL: p => location.origin + (p.startsWith("/") ? p : "/" + p),
      getManifest: () => ({ version: "0.0.2.7", name: "Atlas Translation", commands: {} }),
      sendMessage: (msg, callback) => {
        window.__messages.push(msg);
        if (msg && msg.action === "translateText") {
          const result = msg.sourceArray.map(text => "T[" + text + "]");
          setTimeout(() => cb(callback, result), 0);
          return;
        }
        if (msg && msg.action === "translateTextOnly") {
          const result = msg.sourceArray.map(text => "T[" + text + "]");
          setTimeout(() => cb(callback, { results: result }), 0);
          return;
        }
        cb(callback, undefined);
      },
      onMessage: ev(), connect: () => ({ onMessage: ev(), onDisconnect: ev(), postMessage() {} }),
    },
    storage: {
      local: { get: (k, c) => cb(c, JSON.parse(JSON.stringify(store))), set: (o, c) => { Object.assign(store, o); cb(c); }, remove: (k, c) => cb(c) },
      sync: { get: (k, c) => cb(c, {}), set: (o, c) => cb(c) },
      onChanged: ev(),
    },
    i18n: { getUILanguage: () => "en-US", getAcceptLanguages: c => cb(c, ["en"]), getMessage: () => "" },
    tabs: { query: (q, c) => cb(c, []), create: opts => window.__tabs.push(opts), getCurrent: c => cb(c, undefined), remove() {} },
    extension: { isAllowedFileSchemeAccess: c => cb(c, false), inIncognitoContext: false },
    commands: { getAll: c => cb(c, []), onCommand: ev() },
    contextMenus: { create() {}, removeAll: c => cb(c), onClicked: ev() },
    permissions: { contains: (p, c) => cb(c, true), request: (p, c) => cb(c, true) },
  };
})();`;

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

async function openPage(address = "/translator/translator.html") {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(stub);
  await page.goto(base + address, { waitUntil: "load" });
  await page.waitForFunction(() => window.__listeners.length > 0, { timeout: 10000 });
  return { page, errors };
}

const results = [];
async function check(name, fn) {
  const { page, errors } = await openPage();
  try {
    await fn(page);
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  } finally {
    await page.close();
  }
}

const fixture = path.join(root, "tests/fixtures/sample-text.pdf");

await check("a PDF file is read into paragraphs and translated through the offline-only message", async page => {
  await page.click("#tabPdf");
  const input = await page.$("#pdfFile");
  await input.uploadFile(fixture);
  await page.select("#pdfSource", "en");
  await page.select("#pdfTarget", "fr");
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.querySelectorAll("#pdfResult p").length > 0, { timeout: 30000 });
  const paragraphs = await page.$$eval("#pdfResult p", els => els.map(el => el.textContent));
  assert.deepEqual(paragraphs, [
    "T[Atlas Translation test document]",
    "T[The quick brown fox jumps over the lazy dog. It keeps going on the next line of the same paragraph.]",
    "T[A second paragraph starts after a larger gap. Hyphenated words are joined when the next line goes on in lower case.]"
  ]);
  const messages = await page.evaluate(() => window.__messages.filter(m => m && m.action && m.action.startsWith("translate")));
  assert.ok(messages.length >= 1, "a translation request was sent");
  for (const m of messages) {
    assert.strictEqual(m.action, "translateTextOnly", "only the offline-only message is used");
    assert.strictEqual(m.translationService, "offline");
    assert.strictEqual(m.sourceLanguage, "en");
    assert.strictEqual(m.targetLanguage, "fr");
  }
  const shown = await page.$eval("#pdfActions", el => !el.hidden);
  assert.ok(shown, "copy and download buttons are shown");
});

await check("a French PDF: From is set to French from the text, and the translation uses it", async page => {
  await page.click("#tabPdf");
  await (await page.$("#pdfFile")).uploadFile(path.join(root, "tests/fixtures/sample-fr-text.pdf"));
  // From is set to German, which the document is not: the detection changes it to French (French to English works offline).
  await page.select("#pdfSource", "de");
  await page.select("#pdfTarget", "en");
  await page.evaluate(() => { window.__messages.length = 0; });
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.querySelectorAll("#pdfResult p").length > 0, { timeout: 30000 });
  assert.strictEqual(await page.$eval("#pdfSource", el => el.value), "fr", "From is set to French");
  const status = await page.$eval("#pdfStatus", el => el.textContent);
  assert.ok(status.includes("From is set to French"), "the status says so: " + status);
  const sent = await page.evaluate(() => window.__messages.filter(m => m && m.action === "translateTextOnly"));
  assert.ok(sent.length >= 1 && sent.every(m => m.sourceLanguage === "fr" && m.targetLanguage === "en"), "the requests go French to English");
});

await check("show original text: the source is shown under each paragraph when the box is ticked", async page => {
  await page.click("#tabPdf");
  await (await page.$("#pdfFile")).uploadFile(fixture);
  await page.select("#pdfSource", "en");
  await page.select("#pdfTarget", "fr");
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.querySelectorAll("#pdfResult p").length > 0, { timeout: 30000 });
  assert.strictEqual(await page.$$eval("#pdfResult .pdfOriginal", els => els.length), 0, "hidden by default");
  await page.click("#pdfShowOriginal");
  const originals = await page.$$eval("#pdfResult .pdfOriginal", els => els.map(el => el.textContent));
  assert.strictEqual(originals.length, 3, "one original per paragraph");
  assert.ok(originals[1].startsWith("The quick brown fox"), "the source text is shown");
  await page.click("#pdfShowOriginal");
  assert.strictEqual(await page.$$eval("#pdfResult .pdfOriginal", els => els.length), 0, "hidden again");
});

await check("a pair without English is refused before anything is sent", async page => {
  await page.click("#tabPdf");
  await page.evaluate(() => { window.__messages.length = 0; });
  await page.$eval("#pdfFile", () => {});
  await (await page.$("#pdfFile")).uploadFile(fixture);
  await page.select("#pdfSource", "fr");
  await page.select("#pdfTarget", "de");
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.getElementById("pdfStatus").textContent.includes("English on one side"), { timeout: 5000 });
  const sent = await page.evaluate(() => window.__messages.filter(m => m && m.action === "translateTextOnly").length);
  assert.strictEqual(sent, 0);
});

await check("the text tab translates as you type, saves an item and keeps a history", async page => {
  await page.click("#tabText");
  await page.type("#input", "Good morning");
  await page.waitForFunction(() => document.getElementById("output").textContent === "T[Good morning]", { timeout: 5000 });
  await page.click("#btnSave");
  const saved = await page.$$eval("#savedList .itemSource", els => els.map(el => el.textContent));
  assert.deepEqual(saved, ["Good morning"], "the translation is saved");
  const history = await page.$$eval("#historyList .itemSource", els => els.map(el => el.textContent));
  assert.deepEqual(history, ["Good morning"], "the translation is in the history");
  // Clearing the history keeps the saved item
  await page.click("#tabHistory");
  await page.click("#btnClearHistory");
  const savedAfter = await page.$$eval("#savedList .itemSource", els => els.length);
  const historyAfter = await page.$$eval("#historyList .itemSource", els => els.length);
  assert.strictEqual(savedAfter, 1, "saved items stay after Clear history");
  // History lists every item. After Clear history, the only item left is the saved one.
  const historyKept = await page.$$eval("#historyList .itemSource", els => els.map(el => el.textContent));
  assert.strictEqual(historyAfter, 1, "unsaved items are cleared");
  assert.deepEqual(historyKept, ["Good morning"], "the saved item is the one left");
});

await check("the language chooser searches, picks a language, and the chip and select follow", async page => {
  await page.click("#targetMore");
  await page.waitForFunction(() => !document.getElementById("langPanel").hidden);
  await page.type("#langSearch", "japan");
  const items = await page.$$eval("#langGrid .langItem span:last-child", els => els.map(el => el.textContent));
  assert.ok(items.includes("Japanese"), "the search finds Japanese");
  assert.ok(items.every(name => name.toLowerCase().includes("japan")), "only matches are listed");
  await page.evaluate(() => [...document.querySelectorAll("#langGrid .langItem")].find(el => el.textContent.trim() === "Japanese").click());
  await page.waitForFunction(() => document.getElementById("langPanel").hidden);
  assert.strictEqual(await page.$eval("#targetLang", el => el.value), "ja", "the select has Japanese");
  const chips = await page.$$eval("#targetChips .chip.active", els => els.map(el => el.textContent));
  assert.deepEqual(chips, ["Japanese"], "the chip shows Japanese as selected");
});

await check("the chooser closes with Escape, and swap exchanges the languages", async page => {
  await page.click("#sourceMore");
  await page.waitForFunction(() => !document.getElementById("langPanel").hidden);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("langPanel").hidden);
  await page.evaluate(() => { document.getElementById("sourceLang").value = "en"; document.getElementById("targetLang").value = "fr"; });
  await page.click("#btnSwap");
  assert.strictEqual(await page.$eval("#sourceLang", el => el.value), "fr");
  assert.strictEqual(await page.$eval("#targetLang", el => el.value), "en");
});

await check("reading speed: the menu opens and the choice is kept", async page => {
  await page.click("#btnSpeed");
  assert.strictEqual(await page.$eval("#speedMenu", el => el.hidden), false, "the speed menu opens");
  await page.evaluate(() => document.querySelector('.speedRow[data-speed="slow"]').click());
  const checked = await page.$eval('.speedRow[data-speed="slow"]', el => el.getAttribute("aria-checked"));
  assert.strictEqual(checked, "true", "Slow is chosen");
});

// The PDF prompt is a popup page: it opens the Translator's PDF tab for the document, with the languages chosen.
{
  const pdfAddress = "http://127.0.0.1/sample.pdf";
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(stub);
  await page.goto(base + "/popup/popup-pdf-prompt.html?url=" + encodeURIComponent(pdfAddress), { waitUntil: "load" });
  try {
    await page.waitForFunction(() => document.getElementById("translate").textContent.length > 0, { timeout: 10000 });
    const label = await page.$eval("#translate", el => el.textContent);
    assert.ok(label.includes("English") && label.includes("French"), "the button names both languages: " + label);
    await page.click("#translate");
    await new Promise(r => setTimeout(r, 200));
    const tabs = await page.evaluate(() => window.__tabs.map(o => o.url));
    assert.strictEqual(tabs.length, 1, "one Translator tab is opened");
    const url = new URL(tabs[0]);
    assert.ok(url.pathname.endsWith("/translator/translator.html"), "it opens the Translator");
    assert.strictEqual(url.searchParams.get("pdf"), pdfAddress, "the PDF address is passed on");
    assert.strictEqual(url.searchParams.get("from"), "en", "the document is English (default From)");
    assert.strictEqual(url.searchParams.get("to"), "fr", "the target is the Settings language");
    assert.strictEqual(url.searchParams.get("auto"), "1", "it starts at once");
    assert.strictEqual(url.hash, "#pdf", "the PDF tab is shown");
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    results.push({ name: "the PDF prompt opens the Translator with the document", ok: true });
    console.log("  ok    the PDF prompt opens the Translator with the document");
  } catch (e) {
    results.push({ name: "the PDF prompt opens the Translator with the document", ok: false });
    console.log("  FAIL  the PDF prompt opens the Translator with the document\n        " + e.message);
  } finally {
    await page.close();
  }
}

// A scanned PDF (no text layer): the OCR button is offered, and its pages are read through the helper's text recognition
// (the helper is stood in here: readOcr returns two lines) and then translated. Nothing is sent to an online service.
{
  const name = "a scanned PDF offers OCR, and the OCR text is translated";
  const { page, errors } = await openPage();
  try {
    await page.click("#tabPdf");
    await (await page.$("#pdfFile")).uploadFile(path.join(root, "tests/fixtures/scanned-sample.pdf"));
    await page.select("#pdfSource", "en");
    await page.select("#pdfTarget", "fr");
    // Stand in for the helper: connected, with text recognition installed, and two lines on the page.
    await page.evaluate(() => {
      window.__ocrImages = [];
      TwpHelper.ocrAvailable = async () => true;
      TwpHelper.readOcr = async image => {
        window.__ocrImages.push(image.slice(0, 22));
        return [
          { text: "Scanned first line", box: [40, 100, 300, 120] },
          { text: "and the second line.", box: [40, 124, 300, 144] }
        ];
      };
    });
    await page.click("#btnPdfTranslate");
    await page.waitForFunction(() => !document.getElementById("pdfOcr").hidden, { timeout: 30000 });
    const offer = await page.$eval("#pdfOcrText", el => el.textContent);
    assert.ok(offer.includes("1 page has no text"), "the offer counts the scanned page: " + offer);
    assert.strictEqual(await page.$$eval("#pdfResult p", els => els.length), 0, "nothing is shown before OCR");
    await page.click("#btnPdfOcr");
    await page.waitForFunction(() => document.querySelectorAll("#pdfResult p").length > 0, { timeout: 30000 });
    const paragraphs = await page.$$eval("#pdfResult p", els => els.map(el => el.textContent));
    assert.deepStrictEqual(paragraphs, ["T[Scanned first line and the second line.]"], "the OCR paragraph is translated");
    const images = await page.evaluate(() => window.__ocrImages);
    assert.deepStrictEqual(images, ["data:image/png;base64,"], "one page picture is sent to the helper");
    const sent = await page.evaluate(() => window.__messages.filter(m => m.action === "translateTextOnly").length);
    assert.ok(sent >= 1, "the translation uses the offline-only message");
    const notOffer = await page.$eval("#pdfOcr", el => el.hidden);
    assert.ok(notOffer, "the offer is hidden once every page has text");
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `${failed} failed` : "translator page checks passed");
process.exit(failed ? 1 : 0);
