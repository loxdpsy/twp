// Tests the setup page's helper status (onboarding/onboarding.js). Runs the real script with a small DOM stub,
// the real English messages, and a fake helper answer. Checks: not running, running with no packs, installed pairs,
// and the engine note. The page only reads the helper; nothing is installed from here.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const messages = JSON.parse(fs.readFileSync(ROOT + "_locales/en/messages.json", "utf8"));

function msg(key, substitution) {
  const entry = messages[key];
  if (!entry) return "";
  let text = entry.message;
  if (entry.placeholders) {
    for (const [name, def] of Object.entries(entry.placeholders)) {
      const value = Array.isArray(substitution) ? substitution[0] : substitution;
      text = text.replace(new RegExp(`\\$${name}\\$`, "gi"), value ?? "");
    }
  }
  return text;
}

function element() {
  return {
    textContent: "", hidden: false, value: "", checked: false, disabled: false,
    className: "", type: "", name: "",
    addEventListener(type, fn) { (this.listeners ||= {})[type] = [...(this.listeners?.[type] || []), fn]; }, append() {}, replaceChildren() {},
  };
}

// The helper answer for each test is set in `answer`.
let answer = null;
let boundToken = "";
const removedTabs = [];
const elements = {};
const byId = id => (elements[id] ||= element());

async function runPage(helperAnswer) {
  answer = helperAnswer;
  for (const key of Object.keys(elements)) delete elements[key];
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, AbortController, Promise, JSON, Array, Object, String, Error, TypeError, Number,
    document: {
      getElementById: byId,
      createElement: () => element(),
      querySelector: () => ({ value: "offline" }),
    },
    fetch: async url => {
      if (!String(url).endsWith("/api/offline/ping")) throw new TypeError("unexpected " + url);
      if (answer === "down") throw new TypeError("connection refused");
      return { json: async () => answer };
    },
    twpConfig: { onReady: () => Promise.resolve(), get: key => (key === "offlineHelperToken" ? boundToken : []), set() {} },
    twpI18n: {
      getMessage: (key, substitution) => msg(key, substitution),
      updateUiMessages: () => Promise.resolve(),
    },
    chrome: {
      storage: { local: { set: (obj, cb) => cb && cb() } },
      tabs: { getCurrent: cb => cb({ id: 42 }), remove: id => removedTabs.push(id) },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + "onboarding/onboarding.js", "utf8"), ctx, { filename: "onboarding.js" });
  // Let the page's startup promise chain and the helper check finish.
  await new Promise(resolve => setTimeout(resolve, 50));
  return byId("offlineStatusText").textContent;
}

// Helper not running
assert.ok((await runPage("down")).includes("not running"), "a missing helper says it is not running");

// Helper running, no language pairs
assert.ok((await runPage({ ok: true, engine: true, packs: [] })).includes("no language pair is installed"), "no pairs says so");

// Helper running with two pairs
const withPairs = await runPage({ ok: true, engine: true, packs: ["enfr", "fren"] });
assert.ok(withPairs.includes("enfr, fren"), "the installed pairs are listed");
assert.ok(withPairs.includes("Offline tab"), "the page says where to change them");

// Helper running, pairs installed, engine missing
const noEngine = await runPage({ ok: true, engine: false, packs: ["enfr"] });
assert.ok(noEngine.includes("enfr") && noEngine.includes("offline engine is not installed"), "the engine note is added");

// Save closes the setup tab. The helper is connected here, so there is no note to keep on screen.
boundToken = "token";
await runPage({ ok: true, engine: true, packs: ["enfr"] });
byId("btnSave").listeners.click.forEach(fn => fn());
await new Promise(resolve => setTimeout(resolve, 20));
assert.deepEqual([...removedTabs], [42], "Save closes the setup tab");

// Not connected yet: the note stays on screen, so the tab is not closed straight away.
boundToken = "";
removedTabs.length = 0;
await runPage({ ok: true, engine: true, packs: ["enfr"] });
byId("btnSave").listeners.click.forEach(fn => fn());
await new Promise(resolve => setTimeout(resolve, 20));
assert.strictEqual(removedTabs.length, 0, "the tab stays open while the connect note is shown");
assert.ok(byId("result").textContent.includes("Connect this browser"), "the connect note is shown");

// Something else answers on the port
assert.ok((await runPage({ ok: false })).includes("not running"), "an answer that is not the helper is treated as not running");

console.log("onboarding checks passed");

// First load, nothing chosen yet: the recommended provider (Offline) is the radio that is checked.
{
  const made = [];
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, AbortController, Promise, JSON, Array, Object, String, Error, TypeError, Number,
    document: {
      getElementById: byId,
      createElement: () => { const el = element(); made.push(el); return el; },
      querySelector: () => null,
    },
    fetch: async () => { throw new TypeError("not running"); },
    twpConfig: { onReady: () => Promise.resolve(), get: () => [], set() {} },
    twpI18n: { getMessage: (key, substitution) => msg(key, substitution), updateUiMessages: () => Promise.resolve() },
    chrome: { storage: { local: { set: (obj, cb) => cb && cb() } } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + "onboarding/onboarding.js", "utf8"), ctx, { filename: "onboarding.js" });
  await new Promise(resolve => setTimeout(resolve, 20));
  const radios = made.filter(el => el.type === "radio");
  const checked = radios.filter(el => el.checked).map(el => el.value);
  // The page is built twice (before and after translation), so check the values, not the count.
  assert.ok(checked.length > 0 && checked.every(value => value === "offline"), "the recommended provider is selected on first load");
}
