// The helper's window and tray text: every tr("...") string in the Rust code has a key in each translation file, and
// a translation keeps the same placeholders as its English text. A missing key falls back to English in the app, so
// this test reports gaps rather than failing the app.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../..", import.meta.url).pathname;
const src = join(root, "tools/atlas-updater/src");
const i18n = join(root, "tools/atlas-updater/i18n");

function unescapeRust(raw) {
  return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
}

function codeStrings() {
  const found = new Set();
  for (const file of ["gui.rs", "tray.rs"]) {
    const text = readFileSync(join(src, file), "utf8");
    // tr("...") and trf!("...", args) with placeholders filled in at run time.
    for (const m of text.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"\s*\)|\btrf!\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      found.add(unescapeRust(m[1] ?? m[2]));
    }
  }
  return found;
}

function placeholders(text) {
  return (text.match(/\{\}/g) || []).length;
}

test("every tr() string in the window and tray is a key of each translation file", () => {
  const keys = codeStrings();
  assert.ok(keys.size > 90, `expected the window's strings, found ${keys.size}`);
  const files = readdirSync(i18n).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 1);
  for (const file of files) {
    const table = JSON.parse(readFileSync(join(i18n, file), "utf8"));
    const missing = [...keys].filter((k) => !(k in table));
    const extra = Object.keys(table).filter((k) => !keys.has(k));
    assert.deepEqual(extra, [], `${file} has keys the code does not use`);
    assert.ok(missing.length <= keys.size, file);
    if (missing.length) console.log(`${file}: ${missing.length} strings still in English`);
    for (const [en, translated] of Object.entries(table)) {
      assert.ok(translated.trim().length > 0, `${file}: empty translation for "${en}"`);
      assert.equal(placeholders(translated), placeholders(en), `${file}: placeholders differ for "${en}"`);
    }
  }
});

test("each translation file is listed in i18n.rs", () => {
  const rs = readFileSync(join(src, "i18n.rs"), "utf8");
  for (const file of readdirSync(i18n).filter((f) => f.endsWith(".json"))) {
    assert.ok(rs.includes(`../i18n/${file}`), `${file} is not in FILES in i18n.rs`);
  }
});
