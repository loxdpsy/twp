// Makes the short demo video and poster for the GitHub Pages site (docs/assets/).
// It renders the real translator page in Chromium with the browser APIs stood in (the same stand-in as the browser
// tests), takes a screenshot of each scene, and joins the screenshots into an MP4 with ffmpeg.
// The translation in the recording is scripted: one French sentence is answered with its English, so the film is
// repeatable. Nothing is sent to a translation service.
//
// Run from the repository root:
//   CHROME_PATH=/path/to/chromium FFMPEG=/path/to/ffmpeg node tools/demo/make-demo.mjs
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(new URL("../../tests/browser/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const chromePath = process.env.CHROME_PATH;
const ffmpeg = process.env.FFMPEG || "ffmpeg";
if (!chromePath) {
  console.error("CHROME_PATH is not set.");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".bcmap": "application/octet-stream" };
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

// The stand-in for the browser APIs. The one sentence in the film is answered with its English; anything else is echoed.
const store = { targetLanguage: "en", targetLanguages: ["en"], textTranslatorService: "google", pageTranslatorService: "google", enabledServices: ["google", "offline"], uiLanguage: "en" };
const scripted = { "Bonjour, comment ça va aujourd'hui ?": "Hello, how are you today?" };
const stub = `(() => {
  const store = ${JSON.stringify(store)};
  const scripted = ${JSON.stringify(scripted)};
  window.__listeners = [];
  const ev = () => ({ addListener(fn) { window.__listeners.push(fn); }, removeListener() {}, hasListener() { return false; } });
  const cb = (fn, ...a) => { if (typeof fn === "function") fn(...a); };
  window.chrome = {
    runtime: {
      id: "demo", lastError: undefined,
      getURL: p => location.origin + (p.startsWith("/") ? p : "/" + p),
      getManifest: () => ({ version: "0.0.2.7", name: "Atlas Translation", commands: {} }),
      sendMessage: (msg, callback) => {
        if (msg && msg.action === "translateText") {
          const result = msg.sourceArray.map(text => scripted[text] || text);
          setTimeout(() => cb(callback, result), 0);
          return;
        }
        if (msg && msg.action === "translateTextOnly") {
          const result = msg.sourceArray.map(text => scripted[text] || text);
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
    tabs: { query: (q, c) => cb(c, []), create() {}, getCurrent: c => cb(c, undefined), remove() {} },
    extension: { isAllowedFileSchemeAccess: c => cb(c, false), inIncognitoContext: false },
    commands: { getAll: c => cb(c, []), onCommand: ev() },
    contextMenus: { create() {}, removeAll: c => cb(c), onClicked: ev() },
    permissions: { contains: (p, c) => cb(c, true), request: (p, c) => cb(c, true) },
  };
})();`;

const WIDTH = 1200;
const HEIGHT = 720;
const frames = [];
const work = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-demo-"));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

async function shot(page, name, seconds) {
  const file = path.join(work, `${String(frames.length).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  frames.push({ file, seconds });
}

async function titleCard(text, sub, seconds, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;height:100%;background:radial-gradient(circle at 30% 20%,#2a4a8a 0%,#171a21 70%);color:#f1f3f6;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
    .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;box-sizing:border-box}
    h1{font-size:76px;margin:0 0 16px;letter-spacing:-1px}
    p{font-size:28px;color:#c9d3e3;margin:0;max-width:880px;line-height:1.35}
    .tag{display:inline-block;margin-top:34px;padding:10px 20px;border-radius:24px;background:#263552;color:#8ab4f8;font-size:20px;font-weight:600}
  </style></head><body><div class="wrap"><h1>${text}</h1><p>${sub}</p></div></body></html>`);
  await shot(page, name, seconds);
  await page.close();
}

// Scene 1: the title.
await titleCard("Atlas Translation", "Translate text, web pages and PDF files on your own computer.", 3, "title");

// Scene 2: the Google-style translator, typing a French sentence.
{
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(stub);
  await page.goto(base + "/translator/translator.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.__listeners.length > 0, { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click("#input");
  await page.type("#input", "Bonjour, comment ça va aujourd'hui ?", { delay: 35 });
  await new Promise(r => setTimeout(r, 900));
  await shot(page, "translate", 4);

  // Scene 3: the language list.
  await page.click("#targetMore");
  await new Promise(r => setTimeout(r, 500));
  await shot(page, "languages", 3);
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 300));

  // Scene 4: saving a translation keeps it in History.
  await page.click("#btnSave");
  await new Promise(r => setTimeout(r, 300));
  await page.click("#tabHistory");
  await new Promise(r => setTimeout(r, 400));
  await shot(page, "history", 3);

  // Scene 5: the PDF tab.
  await page.click("#tabPdf");
  await new Promise(r => setTimeout(r, 400));
  await shot(page, "pdf", 3);
  await page.close();
}

// Scene 6: the closing card.
await titleCard("Private by default", "Free, open source. Offline translation runs through the Atlas Helper on your computer.", 3.5, "end");

await browser.close();
server.close();

// Join the scenes. Each still is shown for its own length.
const list = path.join(work, "frames.txt");
fs.writeFileSync(list, frames.map(f => `file '${f.file}'\nduration ${f.seconds}`).join("\n") + `\nfile '${frames[frames.length - 1].file}'\n`);
const out = path.join(root, "docs/assets/atlas-demo.mp4");
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync(ffmpeg, [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
  "-vf", `fps=25,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", out,
], { stdio: "inherit" });
fs.copyFileSync(frames[1].file, path.join(root, "docs/assets/atlas-demo-poster.png"));
console.log(`wrote ${path.relative(root, out)} (${fs.statSync(out).size} bytes), ${frames.length} scenes`);
