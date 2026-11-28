"use strict";
/*
 * Pure helpers for the translator's history (translator/translator.js uses them). They are plain functions with no
 * browser APIs, so the unit test (tests/unit/translatorHistory.test.mjs) runs them in a small sandbox.
 *
 * An entry: { id, text, translation, source, target, time, saved }. The list is newest first.
 * Saved entries are kept. Unsaved entries are limited to `max` (the oldest go first).
 */
var TwpHistory = (function () {
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Keeps only the newest `max` unsaved entries. Saved entries are never removed.
  function trim(list, max) {
    const out = [];
    let unsaved = 0;
    for (const entry of list) {
      if (entry.saved) {
        out.push(entry);
      } else if (unsaved < max) {
        out.push(entry);
        unsaved++;
      }
    }
    return out;
  }

  // Adds a translation to the top. The same text, source and target moves to the top and keeps its saved flag.
  function add(list, entry, max) {
    const items = Array.isArray(list) ? list : [];
    const same = items.find(e => e.text === entry.text && e.source === entry.source && e.target === entry.target);
    const next = {
      id: same ? same.id : makeId(),
      text: entry.text,
      translation: entry.translation,
      source: entry.source,
      target: entry.target,
      time: entry.time || Date.now(),
      saved: same ? same.saved : false
    };
    return trim([next, ...items.filter(e => e !== same)], max);
  }

  function toggleSaved(list, id) {
    return list.map(e => (e.id === id ? Object.assign({}, e, { saved: !e.saved }) : e));
  }

  function remove(list, id) {
    return list.filter(e => e.id !== id);
  }

  // Clears the history but keeps the saved entries.
  function clearUnsaved(list) {
    return list.filter(e => e.saved);
  }

  return { add, toggleSaved, remove, trim, clearUnsaved, makeId };
})();
