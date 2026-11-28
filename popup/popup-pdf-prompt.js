"use strict";
// Shown in the toolbar popup when the active tab is a PDF. It offers to translate the document in the Translator
// (on this computer, with the Offline helper). The From and To choices use the offline language packs: one side must be English.
(function () {
  const params = new URLSearchParams(location.search);
  const pdfUrl = params.get("url") || "";
  const isLocal = pdfUrl.toLowerCase().startsWith("file:");

  function t(key, fallback) {
    return twpI18n.getMessage(key) || fallback;
  }

  function fill(select, codes) {
    select.replaceChildren();
    for (const code of codes) select.append(new Option(twpLang.codeToLanguage(code) || code, code));
  }

  twpConfig.onReady().then(() => {
    twpI18n.updateUiMessages();
    const offline = twpLang.SupportedLanguages.offline.slice().sort((a, b) =>
      (twpLang.codeToLanguage(a) || a).localeCompare(twpLang.codeToLanguage(b) || b));
    const from = document.getElementById("from");
    const to = document.getElementById("to");
    fill(from, offline);
    fill(to, offline);

    // To: the target language from Settings when the offline helper can give it, else English.
    const configured = twpConfig.get("targetLanguage");
    const target = offline.includes(configured) ? configured : "en";
    // From: the browser's language when it is a different offline language, else a sensible default.
    const ui = String(chrome.i18n.getUILanguage() || "").split("-")[0].toLowerCase();
    let source;
    if (target === "en") {
      source = offline.includes(ui) && ui !== "en" ? ui : (offline.includes("fr") ? "fr" : offline.find(c => c !== "en"));
    } else {
      source = "en";
    }
    from.value = source;
    to.value = target;

    const question = document.getElementById("question");
    const button = document.getElementById("translate");
    const note = document.getElementById("note");
    document.getElementById("title").textContent = t("lblPdfDetected", "PDF detected");
    question.textContent = t("msgPdfTranslateQuestion", "This PDF is open in your browser. Translate it on this computer?");
    const update = () => {
      button.textContent = `${t("btnTranslatePdf", "Translate PDF")}: ${twpLang.codeToLanguage(from.value)} \u2192 ${twpLang.codeToLanguage(to.value)}`;
      button.disabled = from.value === to.value || (from.value !== "en" && to.value !== "en");
    };
    from.addEventListener("change", update);
    to.addEventListener("change", update);
    update();

    note.textContent = isLocal
      ? t("msgPdfLocalFile", "This PDF is on your computer. The Translator asks you to choose the file again.")
      : t("msgPdfOfflineNote", "Needs the Atlas Helper with the language pack for these two languages. One side must be English.");

    button.addEventListener("click", () => {
      const query = new URLSearchParams({ from: from.value, to: to.value });
      if (!isLocal && pdfUrl) {
        query.set("pdf", pdfUrl);
        query.set("auto", "1");
      }
      chrome.tabs.create({ url: chrome.runtime.getURL("translator/translator.html") + "?" + query.toString() + "#pdf" });
      window.close();
    });
  });
})();
