"use strict";

var $ = document.querySelector.bind(document);
twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
  const darkPref = twpConfig.get("darkMode");
  twpTheme.set(["auto", "yes", "no"].includes(darkPref) ? darkPref : "auto");
  twpI18n.translateDocument();
  // A local file (file://) is translated only when the browser lets this extension read file pages. Show the notice when it does not.
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = (tabs && tabs[0] && tabs[0].url) || "";
    const api = chrome.extension && chrome.extension.isAllowedFileSchemeAccess;
    if (!url.startsWith("file:") || typeof api !== "function") return;
    const show = allowed => {
      if (allowed === false) $("#fileAccessNotice").hidden = false;
    };
    // Chrome calls back; Firefox returns a promise. Accept both.
    const result = api.call(chrome.extension, show);
    if (result && typeof result.then === "function") result.then(show, () => {});
  });
  $("#popupTitle").textContent = chrome.runtime.getManifest().name;
  $("#btnSettings").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html") }, closePopupAfter);
  });
  // Tap the service badge to switch the service that translates this page to the next enabled one. It is the same switch as the hotkey.
  $("#serviceBadge").addEventListener("click", () => {
    currentPageTranslatorService = twpConfig.swapPageTranslationService();
    chrome.tabs.query({
      active: true,
      currentWindow: true
    }, tabs => {
      twpSendToTab((tabs[0] || {}).id, {
        action: "swapTranslationService",
        newServiceName: currentPageTranslatorService
      }, checkedLastError);
    });
    updateInterface();
  });
  $("#btnImproveTranslation").onclick = () => {
    window.location = "improve-translation.html";
  };
  const menuPanel = $("#menuPanel");
  let menuPage = { url: "", host: "" };
  let originalTabLanguage = "und";
  let currentPageLanguage = "und";
  let currentPageLanguageState = "original";
  let currentPageTranslatorService = twpConfig.get("pageTranslatorService");
  // Only the language buttons in the first two bars. Other buttons (the menu, Improve translation) must not run the translate handler.
  const twpButtons = document.querySelectorAll(".w3-bar > button");
  twpButtons.forEach(button => {
    button.addEventListener("click", event => {
      // currentTarget is the button. The target can be the label inside it (for example the "Original" sub-label).
      const chosen = event.currentTarget;
      twpButtons.forEach(button => {
        button.classList.remove("w3-buttonSelected");
      });
      chosen.classList.add("w3-buttonSelected");
      currentPageLanguage = chosen.value;
      if (currentPageLanguage === "original") {
        currentPageLanguageState = "original";
      } else {
        currentPageLanguageState = "translated";
        twpConfig.setTargetLanguage(chosen.value);
      }
      chrome.tabs.query({
        active: true,
        currentWindow: true
      }, tabs => {
        twpSendToTab((tabs[0] || {}).id, {
          action: "translatePage",
          targetLanguage: chosen.value || "original"
        }, checkedLastError);
      });
    });
  });
  let targetLanguages = twpConfig.get("targetLanguages");
  for (let i = 1; i < 4; i++) {
    const button = twpButtons[i];
    button.value = targetLanguages[i - 1];
    button.textContent = twpLang.codeToLanguage(targetLanguages[i - 1]);
  }
  // Logo shown in the header for each service. Google, Yandex and Bing use the icons; DeepL and Groq use their marks.
  const serviceLogos = {
    google: ["/icons/google-translate-32.png", "Google Translate", false],
    yandex: ["/icons/yandex-translate-32.png", "Yandex Translate", false],
    bing: ["/icons/bing-translate-32.png", "Bing Translator", false],
    deepl: ["/icons/deepl-mark-128.png", "DeepL", false],
    groq: ["/icons/groq-wordmark.png", "Groq", true],
    openrouter: ["/icons/icon-32.png", "OpenRouter (AI)", false],
    offline: ["/icons/icon-32.png", "Offline (desktop helper)", false],
    libre: ["/icons/icon-32.png", "LibreTranslate", false]
  };
  let usageService = null;

  function updateInterface() {
    const [logoSrc, serviceName, isWordmark] = serviceLogos[currentPageTranslatorService] || serviceLogos.google;
    // The Atlas logo turns blue (the accent colour) while the page is translated, the same as the toolbar icon.
    // The Atlas translate icon: the blue card with the white A, or the blue A on the grey card while translated.
    $("#atlasTranslateIcon").setAttribute("src", currentPageLanguageState === "translated" ? "/icons/icon-translated.svg" : "/icons/icon.svg");
    const logo = $("#iconTranslate");
    logo.setAttribute("src", logoSrc);
    logo.alt = serviceName;
    logo.classList.toggle("wordmark", isWordmark);
    $("#serviceBadge").title = `Translating with ${serviceName}`;
    $("#serviceBadge").setAttribute("aria-label", `Translating with ${serviceName}`);

    twpButtons.forEach(button => {
      button.classList.remove("w3-buttonSelected");
      if (currentPageLanguageState !== "translated" && button.value === "original" || currentPageLanguageState === "translated" && button.value === currentPageLanguage) {
        button.classList.add("w3-buttonSelected");
      }
    });
    // Groq and DeepL send the page text to another company. Say so while the page service is one of them.
    const sendsText = {
      groq: ["msgPageSentToGroq", "Text on this page is sent to Groq to be translated. Groq is an AI service."],
      deepl: ["msgPageSentToDeepL", "Text on this page is sent to DeepL to be translated."]
    }[currentPageTranslatorService];
    const notice = $("#serviceNotice");
    notice.textContent = sendsText ? text(sendsText[0], sendsText[1]) : "";
    notice.hidden = !sendsText;
    updateUsage();
    renderMenu();
  }
  updateInterface();

  // The menu needs the current site before it can list its rules. It is drawn again once the page is known.
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    const url = (tabs[0] && tabs[0].url) || "";
    menuPage = { url, host: hostnameOf(url) };
    renderMenu();
    twpSendToTab((tabs[0] || {}).id, {
      action: "getOriginalTabLanguage"
    }, {
      frameId: 0
    }, tabLanguage => {
      checkedLastError();
      if (!tabLanguage || (tabLanguage = twpLang.fixTLanguageCode(tabLanguage))) {
        originalTabLanguage = tabLanguage || "und";
        // The label under "Original" shows the page's language. It stays empty while the language is unknown.
        $("#lblOriginalLanguage").textContent = originalTabLanguage === "und" ? "" : twpLang.codeToLanguage(originalTabLanguage);
        updateInterface();
      }
    });
    twpSendToTab((tabs[0] || {}).id, {
      action: "getCurrentPageLanguage"
    }, {
      frameId: 0
    }, pageLanguage => {
      checkedLastError();
      if (pageLanguage) {
        currentPageLanguage = pageLanguage;
        updateInterface();
      }
    });
    twpSendToTab((tabs[0] || {}).id, {
      action: "getCurrentPageLanguageState"
    }, {
      frameId: 0
    }, pageLanguageState => {
      checkedLastError();
      if (pageLanguageState) {
        currentPageLanguageState = pageLanguageState;
        updateInterface();
      }
    });
    twpSendToTab((tabs[0] || {}).id, {
      action: "getCurrentPageTranslatorService"
    }, {
      frameId: 0
    }, pageTranslatorService => {
      checkedLastError();
      if (pageTranslatorService) {
        currentPageTranslatorService = pageTranslatorService;
        updateInterface();
      }
    });
  });


  // ---- Usage line: DeepL shows its character quota, Groq shows the approximate tokens used. Other services show nothing. ----
  function updateUsage() {
    if (usageService === currentPageTranslatorService) return;
    usageService = currentPageTranslatorService;
    const line = $("#serviceUsage");
    line.hidden = true;
    if (usageService !== "deepl" && usageService !== "groq") return;
    const service = usageService;
    chrome.runtime.sendMessage({ action: "getServiceUsage", service }, result => {
      checkedLastError();
      if (service !== usageService) return; // the service changed while the answer was on its way
      let message = "";
      if (service === "deepl") {
        if (!result || result.error === "no-key") {
          message = "DeepL quota: add your DeepL API key in Settings to see it.";
        } else if (result.error) {
          message = "DeepL quota: not available right now.";
        } else {
          message = `DeepL quota: ${formatNumber(result.used)} of ${formatNumber(result.limit)} characters used.`;
        }
      } else if (result && !result.error) {
        message = `About ${formatNumber(result.tokens)} tokens used with Groq (approximate, counted from Groq replies).`;
      } else {
        message = "About 0 tokens used with Groq (approximate).";
      }
      line.textContent = message;
      line.hidden = false;
    });
  }
  function formatNumber(value) {
    return Number.isFinite(value) ? Math.round(value).toLocaleString() : "?";
  }

  // ---- Options list. Always visible under the header. It holds the site and language rules, the page actions, and the app links. Display settings live in Settings. ----
  // Redraws after a rule changes.
  function refreshMenu() {
    renderMenu();
  }
  function renderMenu() {
    menuPanel.replaceChildren(...menuGroups());
  }

  function menuGroups() {
    const { host, url } = menuPage;
    const lang = originalTabLanguage;
    const hasLang = lang !== "und";
    const langName = hasLang ? twpLang.codeToLanguage(lang) : "";

    const siteGroup = menuGroup([
      menuItem(text("btnNeverTranslate", "Never translate this site"), "block", () => {
        if (isOn("neverTranslateSites", host)) {
          twpConfig.removeSiteFromNeverTranslate(host);
        } else {
          twpConfig.addSiteToNeverTranslate(host);
        }
        refreshMenu();
      }, isOn("neverTranslateSites", host), host !== ""),
      menuItem(text("btnAlwaysTranslate", "Always translate this site"), "check", () => {
        if (isOn("alwaysTranslateSites", host)) {
          twpConfig.removeSiteFromAlwaysTranslate(host);
        } else {
          twpConfig.addSiteToAlwaysTranslate(host);
        }
        refreshMenu();
      }, isOn("alwaysTranslateSites", host), host !== "")
    ]);

    const langGroup = hasLang ? menuGroup([
      menuItem(text("lblAlwaysTranslate", `Always translate from ${langName}`, langName), "check", () => {
        if (isOn("alwaysTranslateLangs", lang)) {
          twpConfig.removeLangFromAlwaysTranslate(lang);
        } else {
          twpConfig.addLangToAlwaysTranslate(lang, host);
        }
        refreshMenu();
      }, isOn("alwaysTranslateLangs", lang)),
      menuItem(text("btnNeverTranslateThisLanguage", "Never translate this language"), "block", () => {
        if (isOn("neverTranslateLangs", lang)) {
          twpConfig.removeLangFromNeverTranslate(lang);
        } else {
          twpConfig.addLangToNeverTranslate(lang, host);
        }
        refreshMenu();
      }, isOn("neverTranslateLangs", lang))
    ]) : null;

    const externalLabel = currentPageTranslatorService === "yandex" ?
      text("msgOpenOnYandexTranslator", "Open in Yandex Translate") :
      text("btnOpenOnGoogleTranslate", "Open in Google Translate");
    const pageGroup = menuGroup([
      menuItem(text("msgChooseAnotherLanguage", "Choose another language"), "globe", () => {
        window.location = chrome.runtime.getURL("/popup/popup-change-language.html");
      }),
      menuItem(externalLabel, "external", () => tabsCreate(externalTranslateUrl(url), closePopupAfter)),
      menuItem(text("msgTranslatePDF", "Translate PDF"), "pdf", () => tabsCreate("https://pdf.translatewebpages.org/", closePopupAfter))
    ]);

    const appGroup = menuGroup([
      menuItem(`${text("lblAbout", "About")} ${chrome.runtime.getManifest().name}`, "info", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("/options/options.html#about") }, closePopupAfter);
      })
    ]);

    const translatorGroup = menuGroup([
      menuItem(text("btnOpenTranslator", "Translator"), "globe", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("/translator/translator.html") }, closePopupAfter);
      })
    ]);

    return [translatorGroup, siteGroup, langGroup, pageGroup, appGroup].filter(Boolean);
  }

  function menuGroup(items) {
    const group = document.createElement("div");
    group.className = "menuGroup";
    group.setAttribute("role", "group");
    group.append(...items);
    return group;
  }
  // checked: null for a plain action, true or false for a rule that is on or off.
  function menuItem(label, icon, run, checked = null, enabled = true) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "menuItem";
    item.setAttribute("role", checked === null ? "menuitem" : "menuitemcheckbox");
    if (checked !== null) {
      item.setAttribute("aria-checked", String(checked));
    }
    item.disabled = !enabled;
    const labelNode = document.createElement("span");
    labelNode.className = "menuLabel";
    labelNode.textContent = label;
    item.append(svgIcon(ICONS[icon], "menuIcon"), labelNode);
    if (checked) {
      item.append(svgIcon(ICONS.tick, "menuTick"));
    }
    item.addEventListener("click", run);
    return item;
  }
  // ---- Helpers for this site and page ----
  function text(key, fallback, substitution) {
    return twpI18n.getMessage(key, substitution) || fallback;
  }
  // The site key: the hostname of a web page, or the address of a local file (file://). chrome:// pages return "".
  function hostnameOf(url) {
    return twpConfig.siteKeyOf(url);
  }
  function isOn(listName, value) {
    return value !== "" && twpConfig.get(listName).indexOf(value) !== -1;
  }
  function externalTranslateUrl(pageUrl) {
    const target = twpConfig.get("targetLanguage");
    return currentPageTranslatorService === "yandex" ?
      `https://translate.yandex.com/translate?view=compact&url=${encodeURIComponent(pageUrl)}&lang=${target.split("-")[0]}` :
      `https://translate.google.com/translate?tl=${target}&u=${encodeURIComponent(pageUrl)}`;
  }
  function closePopupAfter() {
    void chrome.runtime.lastError;
    window.close();
  }

  // ---- Update notice (background/updateCheck.js). Shown only when a newer GitHub release exists and checks are on. ----
  chrome.storage.local.get("updateCheck", result => {
    const state = (result && result.updateCheck) || {};
    const latest = state.latest;
    // Ignore a stored result that is not newer than the installed version (for example, after an update).
    if (state.enabled === false || !latest || !twpVersionIsNewer(latest.version, chrome.runtime.getManifest().version)) {
      return;
    }
    $("#updateText").textContent = text("updateBannerText", `Version ${latest.version} is available.`, latest.version);
    $("#updateHelp").textContent = text("updateBannerHelp", "Download the zip, unzip it over the old folder, then reload the extension.");
    $("#btnUpdateDownload").textContent = text("updateBannerDownload", "Download");
    $("#btnUpdateDownload").addEventListener("click", () => tabsCreate(latest.zipUrl, closePopupAfter));
    $("#updateBanner").hidden = false;
  });
});

// Icons for the menu: 24 x 24 outline shapes, drawn with DOM calls (AMO's validator flags innerHTML).
const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  block: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M5.6 5.6l12.8 12.8" }]],
  check: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M8 12.5l2.7 2.7L16 9.5" }]],
  globe: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M3 12h18" }], ["path", { d: "M12 3c2.6 2.8 2.6 15.2 0 18c-2.6-2.8-2.6-15.2 0-18z" }]],
  external: [["path", { d: "M14 4h6v6" }], ["path", { d: "M20 4l-9 9" }], ["path", { d: "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" }]],
  pdf: [["path", { d: "M6 3h8l4 4v14H6z" }], ["path", { d: "M14 3v4h4" }], ["path", { d: "M9 13h6M9 17h6" }]],
  sliders: [["path", { d: "M4 7h9M17 7h3M4 17h3M11 17h9" }], ["circle", { cx: 15, cy: 7, r: 2 }], ["circle", { cx: 9, cy: 17, r: 2 }]],
  info: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 11v6" }], ["path", { d: "M12 7.5v.01" }]],
  tick: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]]
};
function svgIcon(shapes, className) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", className);
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      node.setAttribute(name, String(value));
    }
    svg.append(node);
  }
  return svg;
}

// True when version a is newer than b (numeric parts, like "0.0.1.10").
function twpVersionIsNewer(a, b) {
  const x = String(a).replace(/^v/i, "").split(".").map(part => parseInt(part, 10) || 0);
  const y = String(b).replace(/^v/i, "").split(".").map(part => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] || 0) - (y[i] || 0);
    if (diff) return diff > 0;
  }
  return false;
}
