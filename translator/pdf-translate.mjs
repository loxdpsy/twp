// PDF translation in the Translator page. The text is read with pdf.js (lib/pdfjs) on this computer, then each batch of
// paragraphs goes to the offline helper through the "translateTextOnly" message. That message never falls back to another
// service, so the PDF text does not leave this computer. Pages with no text layer (scanned pages) are read with the
// helper's text recognition (OCR) when the user asks for it: the page is drawn here and the picture goes to the helper.
import * as pdfjs from "../lib/pdfjs/pdf.min.mjs";

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 300;
// A scanned page is drawn at most this wide (pixels) for text recognition.
export const MAX_PICTURE_WIDTH = 2000;

// Reads the text of every page. Returns one array of paragraphs per page.
export async function extractPages(data, options = {}) {
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: options.cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false
  }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages. The limit is ${MAX_PAGES}.`);
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items
        .filter(item => typeof item.str === "string")
        .map(item => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || Math.abs(item.transform[3]),
          eol: item.hasEOL
        }));
      const paragraphs = TwpPdfText.buildParagraphs(TwpPdfText.groupLines(items))
        .flatMap(paragraph => TwpPdfText.splitLong(paragraph));
      pages.push(paragraphs);
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

// Sends one request to the background and resolves with its results. Errors come back as readable messages.
export function sendOfflineOnly(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, reply => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!reply) return reject(new Error("The extension did not answer. Reload the page and try again."));
      if (reply.error) return reject(new Error(reply.error));
      resolve(reply.results || []);
    });
  });
}

// Translates every paragraph of every page, batch by batch. Returns the same shape as `pages`.
export async function translatePages(pages, source, target, onProgress = () => {}) {
  const texts = pages.flat();
  const translated = [];
  for (const batch of TwpPdfText.batches(texts)) {
    const results = await sendOfflineOnly({
      action: "translateTextOnly",
      translationService: "offline",
      sourceLanguage: source,
      targetLanguage: target,
      sourceArray: batch
    });
    if (results.length !== batch.length) throw new Error("The translation returned fewer results than expected.");
    translated.push(...results);
    onProgress(translated.length, texts.length);
  }
  let k = 0;
  return pages.map(paragraphs => paragraphs.map(() => translated[k++]));
}

// The 0-based numbers of the pages that have no text (scanned pages).
export function emptyPageNumbers(pages) {
  return pages.flatMap((paragraphs, index) => (paragraphs.length === 0 ? [index] : []));
}

// Reads the pages with no text layer through the helper's text recognition. Each such page is drawn here and sent to the
// helper; its lines become paragraphs. Returns pages in the same shape as `pages`. The data is copied, because pdf.js
// may take the bytes it is given.
export async function ocrPages(data, pages, cMapUrl, onProgress = () => {}) {
  const empty = emptyPageNumbers(pages);
  const out = pages.map(paragraphs => paragraphs.slice());
  if (empty.length === 0) return out;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    cMapUrl,
    cMapPacked: true,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false
  }).promise;
  try {
    for (let i = 0; i < empty.length; i++) {
      onProgress(i + 1, empty.length);
      const page = await doc.getPage(empty[i] + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, MAX_PICTURE_WIDTH / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const lines = await TwpHelper.readOcr(canvas.toDataURL("image/png"));
      out[empty[i]] = TwpHelper.groupOcrLines(lines).flatMap(paragraph => TwpPdfText.splitLong(paragraph));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

// The offline helper translates only between English and one other language, so one side must be English.
export function offlinePairAllowed(source, target) {
  return source !== target && (source === "en" || target === "en");
}

// ---- The page part (only runs in the Translator page) ----
function setupPdfPanel() {
  const $ = id => document.getElementById(id);
  const offline = twpLang.SupportedLanguages.offline.slice().sort((a, b) =>
    twpLang.codeToLanguage(a).localeCompare(twpLang.codeToLanguage(b)));
  for (const id of ["pdfSource", "pdfTarget"]) {
    const select = $(id);
    select.replaceChildren();
    for (const code of offline) select.append(new Option(twpLang.codeToLanguage(code), code));
  }
  $("pdfSource").value = "en";
  $("pdfTarget").value = offline.includes("fr") ? "fr" : offline[0];
  // The PDF prompt opens this page with ?from=, ?to=, ?pdf= (the address) and ?auto=1 (start at once).
  const params = new URLSearchParams(location.search);
  if (offline.includes(params.get("from"))) $("pdfSource").value = params.get("from");
  if (offline.includes(params.get("to"))) $("pdfTarget").value = params.get("to");
  if (params.get("pdf")) $("pdfUrl").value = params.get("pdf");

  let lastOriginal = null; // the paragraphs of each page, as read from the PDF
  let lastTranslated = null; // the same shape, translated

  function setStatus(message, isError = false) {
    const el = $("pdfStatus");
    el.textContent = message;
    el.classList.toggle("error", isError);
  }

  async function readInput() {
    const file = $("pdfFile").files[0];
    if (file) {
      if (file.size > MAX_BYTES) throw new Error("The file is larger than 50 MB.");
      return await file.arrayBuffer();
    }
    const value = $("pdfUrl").value.trim();
    let url;
    try {
      url = new URL(value);
    } catch (e) {
      throw new Error("Choose a PDF file, or enter the web address of a PDF.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("The address must start with https:// or http://.");
    const response = await fetch(url.href);
    if (!response.ok) throw new Error(`The PDF could not be downloaded (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error("The file is larger than 50 MB.");
    return buffer;
  }

  // Shows the translation. With "Show original", each paragraph's source text is shown under its translation.
  function render() {
    const result = $("pdfResult");
    result.replaceChildren();
    const showOriginal = $("pdfShowOriginal").checked;
    lastTranslated.forEach((paragraphs, index) => {
      if (paragraphs.length === 0) return;
      const section = document.createElement("section");
      section.className = "pdfPage";
      const heading = document.createElement("h3");
      heading.textContent = `Page ${index + 1}`;
      section.append(heading);
      paragraphs.forEach((paragraph, i) => {
        const p = document.createElement("p");
        p.textContent = paragraph;
        section.append(p);
        if (showOriginal) {
          const original = document.createElement("p");
          original.className = "pdfOriginal";
          original.textContent = lastOriginal[index][i];
          section.append(original);
        }
      });
      result.append(section);
    });
    $("pdfActions").hidden = !lastTranslated.some(p => p.length > 0);
  }

  function plainText(pages) {
    return pages
      .map((paragraphs, index) => (paragraphs.length ? `Page ${index + 1}\n\n${paragraphs.join("\n\n")}` : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  // The document's language, guessed from its text. When it is clear and the offline pair works, From is set to it.
  // Returns the language to translate from, or null when the choice does not work (the status says why).
  function chooseSource(pages, chosen, target) {
    const sample = pages.flat().join(" ").slice(0, 4000);
    const guess = TwpPdfText.detectLanguage(sample, offline);
    if (!guess || guess.code === chosen) return { source: chosen, note: "" };
    const name = twpLang.codeToLanguage(guess.code) || guess.code;
    if (offlinePairAllowed(guess.code, target)) {
      $("pdfSource").value = guess.code;
      return { source: guess.code, note: ` The document looks like ${name}, so From is set to ${name}.` };
    }
    setStatus(`The document looks like ${name}. Offline translation needs English on one side, so choose From again.`, true);
    return null;
  }

  // The PDF as read (paragraphs per page, before translation) and its bytes, kept for the OCR button.
  let lastPages = null;
  let lastData = null;

  function resetResult() {
    $("pdfResult").replaceChildren();
    $("pdfActions").hidden = true;
    $("pdfOcr").hidden = true;
    lastTranslated = null;
  }

  // Shows the OCR button when some pages have no text. The offer says how many pages it is for.
  function offerOcr(pages) {
    const empty = emptyPageNumbers(pages);
    $("pdfOcr").hidden = empty.length === 0;
    if (empty.length === 0) return;
    const count = empty.length === 1 ? "1 page has no text" : `${empty.length} pages have no text`;
    $("pdfOcrText").textContent = `${count} (scanned pages). Text recognition reads them on this computer and works best with English and Chinese.`;
  }

  // Translates the pages and shows the result. Returns false when the choice of From does not work (the status says why).
  async function translateAndShow(pages, chosen, target, prefix = "") {
    const count = pages.flat().length;
    const choice = chooseSource(pages, chosen, target);
    if (choice === null) return false;
    setStatus(`${prefix}Translating ${count} paragraphs...${choice.note}`);
    const translated = await translatePages(pages, choice.source, target, (done, total) => {
      setStatus(`${prefix}Translating... ${done} of ${total} paragraphs.${choice.note}`);
    });
    lastOriginal = pages;
    lastTranslated = translated;
    render();
    setStatus(`${prefix}Translated ${count} paragraphs. Nothing was sent to an online service.${choice.note}`);
    return true;
  }

  async function translate() {
    const chosen = $("pdfSource").value;
    const target = $("pdfTarget").value;
    resetResult();
    if (!offlinePairAllowed(chosen, target)) {
      setStatus("Offline translation needs English on one side, for example English to French.", true);
      return;
    }
    $("btnPdfTranslate").disabled = true;
    try {
      setStatus("Reading the PDF...");
      const buffer = await readInput();
      lastData = new Uint8Array(buffer.slice(0));
      const pages = await extractPages(new Uint8Array(buffer), { cMapUrl: chrome.runtime.getURL("lib/pdfjs/cmaps/") });
      lastPages = pages;
      if (pages.flat().length === 0) {
        setStatus("No text was found. The pages may be scanned images. Use the OCR button below to read them.", true);
      } else {
        await translateAndShow(pages, chosen, target);
      }
      offerOcr(pages);
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), true);
    } finally {
      $("btnPdfTranslate").disabled = false;
    }
  }

  // Reads the scanned pages with OCR, then translates the whole PDF again.
  async function runOcr() {
    const chosen = $("pdfSource").value;
    const target = $("pdfTarget").value;
    if (!lastData || !lastPages) return;
    if (!offlinePairAllowed(chosen, target)) {
      setStatus("Offline translation needs English on one side, for example English to French.", true);
      return;
    }
    if (!(await TwpHelper.ocrAvailable())) {
      setStatus("Text recognition needs the Atlas Helper with its text recognition models installed (Offline tab). Connect this browser in Options first.", true);
      return;
    }
    $("btnPdfOcr").disabled = true;
    $("btnPdfTranslate").disabled = true;
    try {
      const total = emptyPageNumbers(lastPages).length;
      const cMapUrl = chrome.runtime.getURL("lib/pdfjs/cmaps/");
      const pages = await ocrPages(lastData, lastPages, cMapUrl, done => {
        setStatus(`Reading scanned page ${done} of ${total} with text recognition...`);
      });
      lastPages = pages;
      if (pages.flat().length === 0) {
        setStatus("No text was found, even with text recognition.", true);
      } else {
        await translateAndShow(pages, chosen, target, "Text recognition done. ");
      }
      offerOcr(pages);
    } catch (error) {
      setStatus(error && error.message ? error.message : String(error), true);
    } finally {
      $("btnPdfOcr").disabled = false;
      $("btnPdfTranslate").disabled = false;
    }
  }

  $("btnPdfTranslate").addEventListener("click", translate);
  $("btnPdfOcr").addEventListener("click", runOcr);
  $("pdfUrl").addEventListener("keydown", event => {
    if (event.key === "Enter") translate();
  });
  $("pdfShowOriginal").addEventListener("change", () => {
    if (lastTranslated) render();
  });
  $("pdfCopy").addEventListener("click", () => {
    if (lastTranslated && navigator.clipboard) navigator.clipboard.writeText(plainText(lastTranslated)).catch(() => {});
  });
  $("pdfDownload").addEventListener("click", () => {
    if (!lastTranslated) return;
    const blob = new Blob([plainText(lastTranslated)], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "translation.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  if (params.get("auto") === "1" && params.get("pdf")) translate();
}

if (typeof document !== "undefined" && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.mjs");
  // The language lists need the settings' UI language, so the panel is set up after the page loads.
  twpConfig.onReady().then(() => setupPdfPanel());
}
