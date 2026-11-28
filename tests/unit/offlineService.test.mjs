// Tests the Offline (desktop helper) service. Loads the real lib/languages.js, background/serviceHealth.js and background/translationService.js into one sandbox,
// with a fake Atlas helper behind fetch(). Checks the offline service end to end (except the real engine).
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const settings = { enabledServices: ["offline"], offlineHelperToken: "c".repeat(64), customServices: [], useAlternativeService: "yes", textTranslatorService: "offline", pageTranslatorService: "offline" };
const clock = { t: 1_000_000_000_000 };
const logs = { warn: [], info: [], error: [] };
const helper = { engine: true, protocol: 2, packs: ["enfr", "fren"], code: "c".repeat(64), down: false, requests: [] };

function resp(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

async function fakeFetch(url, init = {}) {
  if (!String(url).startsWith("http://127.0.0.1:47632")) throw new TypeError("not reachable in the test: " + url);
  if (helper.down) throw new TypeError("connection refused");
  if (url.endsWith("/api/offline/ping")) return resp(200, { ok: true, name: "Atlas Helper", version: "0.0.2.5", protocol: helper.protocol, features: ["offline", "packs", "bind", "translate"], engine: helper.engine, packs: helper.packs });
  if (url.endsWith("/api/offline/translate")) {
    const body = JSON.parse(init.body);
    helper.requests.push(body);
    if ((init.headers || {}).Authorization !== "Bearer " + helper.code) return resp(403, { ok: false, message: "this browser is not bound." });
    if (!helper.packs.includes(body.pair)) return resp(409, { ok: false, message: "the pack is not installed" });
    if (body.texts.length > 500) return resp(400, { ok: false, message: "too many" });
    return resp(200, { ok: true, translations: body.texts.map(t => `[${body.pair}] ${t.toUpperCase()}`) });
  }
  return resp(404, { ok: false });
}

const ctx = {
  console: { log() {}, info: (...a) => logs.info.push(a.join(" ")), warn: (...a) => logs.warn.push(a.join(" ")), error: () => {} },
  setTimeout, clearTimeout, AbortController, Date: { now: () => clock.t }, Promise, JSON, Map, Set, Array, Error, TypeError, Object, String, Number,
  fetch: fakeFetch,
  XMLHttpRequest: class { open() {} send() { this.onerror && this.onerror(new Error("no network in the test")); } setRequestHeader() {} },
  window: {}, navigator: {}, location: {},
  chrome: {
    i18n: { getUILanguage: () => "en", getMessage: () => "" },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onMessage: { addListener() {} }, lastError: null },
    tabs: { sendMessage() {}, query: async () => [] },
  },
  twpConfig: {
    get: key => settings[key],
    set: (key, value) => { settings[key] = value; },
    onReady: fn => fn(),
  },
  translationCache: { get: async () => null, set: async () => {}, remove: async () => {} },
};
vm.createContext(ctx);
for (const file of ["lib/languages.js", "background/serviceHealth.js", "background/translationService.js"]) {
  vm.runInContext(fs.readFileSync(ROOT + file, "utf8"), ctx, { filename: file });
}
const svc = vm.runInContext("translationService", ctx);

const translate = (from, to, text) => svc.translateSingleText("offline", from, to, text, true);

// 1. English to French through the helper.
const enfr = await translate("en", "fr", "hello");
assert.strictEqual(enfr, "[enfr] HELLO", "en to fr uses the enfr pack");
assert.deepStrictEqual(helper.requests.at(-1).texts, ["hello"]);
assert.strictEqual(helper.requests.at(-1).pair, "enfr");

// 2. Several pieces of text keep their shape (page translation sends groups of text nodes).
const shaped = await svc.translateHTML("offline", "fr", "en", [["bonjour", "monde"], ["merci"]], true);
assert.deepStrictEqual(shaped, [["[fren] BONJOUR", "[fren] MONDE"], ["[fren] MERCI"]]);

// 3. Pairs without English, and "auto", have no pack: the text is skipped without calling the helper.
helper.requests.length = 0;
await assert.rejects(translate("fr", "de", "bonjour"), /offline/);
await assert.rejects(translate("auto", "fr", "hello"), /offline/);
assert.strictEqual(helper.requests.length, 0, "no request is sent for a pair with no pack");

// 4. A pack that is not installed is skipped before any text is sent.
helper.packs = ["enfr"];
clock.t += 11000; // the helper status is cached for 10 seconds
await assert.rejects(translate("fr", "en", "bonjour"), /please install the fren language pack/);
assert.strictEqual(helper.requests.length, 0, "not-installed pack: nothing sent");
helper.packs = ["enfr", "fren"];
clock.t += 11000;

// 5. A wrong binding token is reported as a failure from the helper.
settings.offlineHelperToken = "d".repeat(64);
await assert.rejects(translate("en", "fr", "hello"));
settings.offlineHelperToken = helper.code;

// 6. No binding token: skipped, nothing sent.
settings.offlineHelperToken = "";
helper.requests.length = 0;
await assert.rejects(translate("en", "fr", "hello"), /connect this browser to the Atlas Helper/);
assert.strictEqual(helper.requests.length, 0);
settings.offlineHelperToken = helper.code;

// 7. Helper not running: the request fails (a real failure).
helper.down = true;
await assert.rejects(translate("en", "fr", "hello"));
helper.down = false;

// 8. Back to normal once the helper answers again.
clock.t += 11000;
const again = await translate("en", "fr", "again");
assert.strictEqual(again, "[enfr] AGAIN");

// 9. Offline is never an alternate for an online service (settings: alternatives on, offline enabled).
settings.enabledServices = ["deepl", "offline"];
const alt = vm.runInContext("twpLang.getAlternativeService('fr', 'deepl', false)", ctx);
assert.notStrictEqual(alt, "offline");

// 10. The helper's "offline" is found in fallback: offline skipped, next candidate tried, the log says so.
settings.enabledServices = ["offline", "google"];
settings.offlineHelperToken = helper.code;
helper.packs = ["enfr"];
clock.t += 11000;
logs.warn.length = 0;
await assert.rejects(translate("fr", "en", "bonjour"));
assert.ok(logs.warn.some(l => l.includes("offline")), "the fallback tried the next service after offline");

// 11. An older helper (no protocol number, protocol 1) is not used: nothing is sent, and the message says to update it.
settings.enabledServices = ["offline", "google"];
settings.offlineHelperToken = helper.code;
helper.packs = ["enfr", "fren"];
helper.protocol = 1;
clock.t += 11000;
const sentBefore = helper.requests.length;
logs.warn.length = 0;
await assert.rejects(translate("fr", "en", "bonjour"));
assert.strictEqual(helper.requests.length, sentBefore, "an older helper: nothing sent");
assert.ok(logs.warn.some(l => l.includes("offline")), "offline was skipped, and the next service was tried");
helper.protocol = 2;
clock.t += 11000;

console.log("offlineService.test.mjs: all assertions passed");
