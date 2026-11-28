// Tests the translator's history helpers (translator/history.js), which hold the History and Saved lists.
// The file has no browser APIs, so it is run as a plain script and TwpHistory is read from its scope.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(ROOT + "translator/history.js", "utf8") + "\n;this.TwpHistory = TwpHistory;", context);
const H = context.TwpHistory;
// Arrays made inside vm come from another realm, so the comparisons below use deepEqual (no prototype check).

const entry = (text, extra = {}) => ({ text, translation: "t:" + text, source: "en", target: "fr", ...extra });

// add: newest first, the unsaved limit drops the oldest
let list = [];
list = H.add(list, entry("one"), 2);
list = H.add(list, entry("two"), 2);
list = H.add(list, entry("three"), 2);
assert.deepEqual(list.map(e => e.text), ["three", "two"]);

// add: the same text moves to the top and keeps its id and saved flag
let saved = H.toggleSaved(list, list[1].id); // "two" is saved
const twoId = saved[1].id;
saved = H.add(saved, entry("two"), 2);
assert.strictEqual(saved[0].text, "two");
assert.strictEqual(saved[0].id, twoId);
assert.strictEqual(saved[0].saved, true);
assert.strictEqual(saved.length, 2);

// saved entries are not removed by the unsaved limit
let withSaved = [];
withSaved = H.add(withSaved, entry("keep"), 1);
withSaved = H.toggleSaved(withSaved, withSaved[0].id);
for (const t of ["a", "b", "c"]) withSaved = H.add(withSaved, entry(t), 1);
assert.deepEqual(withSaved.map(e => e.text).sort(), ["c", "keep"]);

// clearUnsaved keeps only saved entries
const cleared = H.clearUnsaved(withSaved);
assert.deepEqual(cleared.map(e => e.text), ["keep"]);

// same text in another language pair is a different entry
let pairs = H.add([], entry("hello", { target: "fr" }), 10);
pairs = H.add(pairs, entry("hello", { target: "de" }), 10);
assert.strictEqual(pairs.length, 2);

// remove
const id = pairs[0].id;
assert.strictEqual(H.remove(pairs, id).length, 1);

// toggleSaved on an unknown id changes nothing
assert.deepEqual(H.toggleSaved(pairs, "missing"), pairs);

console.log("translatorHistory: all checks passed");
