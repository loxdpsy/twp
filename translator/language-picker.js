"use strict";
/*
 * Google-style language chooser for the translator's text tab. Each side has a row of chips (the current language and
 * the recent ones) and a button that opens the full list with a search box. The choice is written to the hidden <select>
 * for that side, and a change event is sent, so translator.js reads the selects as before.
 * Recent languages are kept in chrome.storage.local. Plain DOM; uses twpLang and twpI18n from lib/.
 */
var TwpLangPicker = (function () {
  const RECENT_KEY = "translatorRecentLanguages";
  const MAX_CHIPS = 4;
  const MAX_RECENT = 6;
  let recent = [];
  let sides = null;
  let openSide = null;

  function t(key, fallback) {
    return twpI18n.getMessage(key) || fallback;
  }
  function fold(text) {
    return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function nameOf(code) {
    if (code === "auto") return t("lblDetectLanguage", "Detect language");
    return twpLang.codeToLanguage(code) || code;
  }
  function allCodes() {
    return twpLang.TargetLanguages.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }
  function currentOf(side) {
    return side.select.value;
  }

  function remember(code) {
    if (code === "auto") return;
    recent = [code, ...recent.filter(c => c !== code)].slice(0, MAX_RECENT);
    chrome.storage.local.set({ [RECENT_KEY]: recent });
  }

  function chooseCode(side, code) {
    side.select.value = code;
    remember(code);
    closePanel();
    side.select.dispatchEvent(new Event("change"));
    refresh();
  }

  function renderChips(side) {
    const current = currentOf(side);
    const codes = [];
    if (side.detect) codes.push("auto");
    for (const code of [current, ...recent]) {
      if (code && !codes.includes(code)) codes.push(code);
    }
    side.chips.replaceChildren();
    for (const code of codes.slice(0, MAX_CHIPS)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (code === current ? " active" : "");
      chip.textContent = nameOf(code);
      chip.setAttribute("aria-pressed", String(code === current));
      chip.addEventListener("click", () => chooseCode(side, code));
      side.chips.append(chip);
    }
  }

  function renderGrid(side, query) {
    const grid = sides.grid;
    grid.replaceChildren();
    const q = fold(query || "").trim();
    const current = currentOf(side);
    let codes = allCodes();
    if (side.detect) codes = ["auto", ...codes];
    if (q) codes = codes.filter(code => fold(nameOf(code)).includes(q) || code.toLowerCase().startsWith(q));
    const addHeading = text => {
      const h = document.createElement("h3");
      h.className = "langHeading";
      h.textContent = text;
      grid.append(h);
    };
    const addItem = code => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "langItem" + (code === current ? " selected" : "");
      item.setAttribute("aria-pressed", String(code === current));
      const mark = document.createElement("span");
      mark.className = "langMark";
      mark.textContent = code === current ? "\u2713" : "";
      const label = document.createElement("span");
      label.textContent = nameOf(code);
      item.append(mark, label);
      item.addEventListener("click", () => chooseCode(side, code));
      grid.append(item);
    };
    const recentHere = q ? [] : recent.filter(code => codes.includes(code));
    if (recentHere.length) {
      addHeading(t("lblRecentLanguages", "Recent"));
      recentHere.forEach(addItem);
    }
    addHeading(t("lblAllLanguages", "All languages"));
    codes.forEach(addItem);
    if (codes.length === 0) {
      const none = document.createElement("p");
      none.className = "muted";
      none.textContent = t("msgNoLanguageFound", "No language matches.");
      grid.append(none);
    }
  }

  function openPanel(side) {
    openSide = side;
    sides.title.textContent = side.detect ? t("lblTranslateFrom", "Translate from") : t("lblTranslateTo", "Translate to");
    sides.search.value = "";
    renderGrid(side, "");
    sides.panel.hidden = false;
    sides.search.focus();
  }
  function closePanel() {
    openSide = null;
    sides.panel.hidden = true;
  }

  function refresh() {
    if (!sides) return;
    renderChips(sides.source);
    renderChips(sides.target);
    if (openSide && !sides.panel.hidden) renderGrid(openSide, sides.search.value);
  }

  // elements: { sourceSelect, targetSelect, sourceChips, targetChips, sourceMore, targetMore, panel, search, grid, title, back }
  function init(elements) {
    sides = {
      source: { select: elements.sourceSelect, chips: elements.sourceChips, detect: true },
      target: { select: elements.targetSelect, chips: elements.targetChips, detect: false },
      grid: elements.grid,
      panel: elements.panel,
      search: elements.search,
      title: elements.title
    };
    elements.sourceMore.addEventListener("click", () => openPanel(sides.source));
    elements.targetMore.addEventListener("click", () => openPanel(sides.target));
    elements.back.addEventListener("click", closePanel);
    elements.search.addEventListener("input", () => openSide && renderGrid(openSide, elements.search.value));
    elements.panel.addEventListener("keydown", event => {
      if (event.key === "Escape") closePanel();
    });
    chrome.storage.local.get([RECENT_KEY], result => {
      void chrome.runtime.lastError;
      recent = result && Array.isArray(result[RECENT_KEY]) ? result[RECENT_KEY].filter(c => typeof c === "string") : [];
      refresh();
    });
    refresh();
  }

  return { init, refresh, closePanel, nameOf, fold };
})();
