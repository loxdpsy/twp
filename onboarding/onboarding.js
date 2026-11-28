"use strict";

// First-run setup page. It opens once, when the extension is installed (background/background.js).
// Choosing a provider or skipping sets onboardingDone in storage.local. That flag is kept across updates, so an update
// never opens this page again. Options, Others, "Open the setup guide" opens it on purpose.
(function () {
  const PROVIDERS = [
    { id: "keep", title: "onboardingKeepTitle", desc: "onboardingKeepDesc" },
    { id: "offline", title: "onboardingOfflineTitle", desc: "onboardingOfflineDesc", recommended: true },
    { id: "google", title: "onboardingGoogleTitle", desc: "onboardingGoogleDesc" },
    { id: "groq", title: "onboardingGroqTitle", desc: "onboardingGroqDesc", needsKey: true },
    { id: "openrouter", title: "onboardingOpenRouterTitle", desc: "onboardingOpenRouterDesc", needsKey: true },
  ];

  function text(key, fallback, substitution) {
    return twpI18n.getMessage(key, substitution) || fallback;
  }

  function renderProviders() {
    const container = document.getElementById("providers");
    // The recommended provider (Offline) is selected first. A choice the user already made is kept when the page is built again.
    const selected = (document.querySelector("input[name=\"provider\"]:checked") || { value: "offline" }).value;
    container.replaceChildren();
    for (const provider of PROVIDERS) {
      const label = document.createElement("label");
      label.className = "provider";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "provider";
      input.value = provider.id;
      input.checked = provider.id === selected;
      const body = document.createElement("span");
      body.className = "provider-body";
      const title = document.createElement("span");
      title.className = "provider-title";
      title.textContent = twpI18n.getMessage(provider.title);
      if (provider.recommended) {
        const badge = document.createElement("span");
        badge.className = "provider-badge";
        badge.textContent = twpI18n.getMessage("onboardingRecommended") || "Recommended";
        title.append(badge);
      }
      const desc = document.createElement("span");
      desc.className = "provider-desc";
      desc.textContent = twpI18n.getMessage(provider.desc);
      body.append(title, desc);
      label.append(input, body);
      container.append(label);
    }
  }

  // The helper listens on this address and answers extension pages only (tools/atlas-updater/src/api.rs).
  const HELPER = "http://127.0.0.1:47632";
  const HELPER_STATUS = HELPER + "/api/offline/ping";

  function setOfflineText(value) {
    document.getElementById("offlineStatusText").textContent = value;
  }

  function setDot(kind) {
    const dot = document.getElementById("helperDot");
    dot.className = "dot" + (kind ? " " + kind : "");
  }

  function helperDownError() {
    const error = new Error(text("msgOfflineNotRunning", "The helper is not running. Open the Atlas Helper, then try again."));
    error.helperDown = true;
    return error;
  }

  /** The helper's status: whether it has the engine and which language packs are installed. No secret is sent. */
  async function readHelper() {
    let response;
    try {
      response = await fetch(HELPER_STATUS, { cache: "no-store" });
    } catch (e) {
      throw helperDownError();
    }
    const info = await response.json().catch(() => ({}));
    if (!info || info.ok !== true) throw helperDownError();
    return info;
  }

  /** The token is kept in the extension's settings once the user allows this browser in the helper window. */
  function isBound() {
    return String(twpConfig.get("offlineHelperToken") || "").trim() !== "";
  }

  /** Shows Connect when the helper runs and this browser is not connected yet, and Disconnect when it is. */
  function showBindState(running) {
    const bound = isBound();
    document.getElementById("btnBind").hidden = !running || bound;
    document.getElementById("btnUnbind").hidden = !bound;
  }

  function setBindMessage(value, kind) {
    const box = document.getElementById("bindMessage");
    box.textContent = value;
    box.hidden = !value;
    box.className = "card-desc bind-message" + (kind ? " " + kind : "");
  }

  async function checkHelper() {
    setDot("");
    setOfflineText(text("onboardingHelperChecking", "Checking the helper..."));
    try {
      const info = await readHelper();
      const packs = Array.isArray(info.packs) ? info.packs : [];
      setDot("ok");
      if (packs.length === 0) {
        setOfflineText(text("onboardingHelperNoPacks", "The helper is running, but no language pair is installed yet. Open the helper, go to its Offline tab, and install the pairs you need."));
      } else {
        setOfflineText(text("onboardingHelperPacks", `Installed language pairs: ${packs.join(", ")}.`, packs.join(", ")));
      }
      if (!info.engine) {
        setOfflineText(document.getElementById("offlineStatusText").textContent + " " + text("onboardingHelperNoEngine", "The offline engine is not installed yet. Install it from the helper's Offline tab."));
      }
      showBindState(true);
    } catch (e) {
      setDot("off");
      setOfflineText(text("onboardingHelperMissing", "The helper is not running. Start the Atlas Helper, then press Check again. Until a language pair is installed, the next enabled service translates the text."));
      showBindState(false);
    }
  }

  /** Names this browser in the helper window, so the user knows which browser asks. */
  function browserName() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox/")) return "Firefox";
    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("OPR/")) return "Opera";
    return "Chrome";
  }

  /** Asks the helper to bind this browser. The helper window shows Allow or Deny, and the request waits for that answer. */
  async function connectHelper() {
    const button = document.getElementById("btnBind");
    button.disabled = true;
    setBindMessage(text("msgOfflineWaiting", "Waiting for your answer in the Atlas Helper window..."), "");
    try {
      await twpConfig.onReady();
      const status = await readHelper();
      if ((Number(status.protocol) || 1) < 2) {
        throw new Error(text("msgOfflineUpdateHelper", "This extension needs a newer Atlas Helper. Update Atlas Helper, then try again."));
      }
      const response = await fetch(HELPER + "/api/offline/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Atlas Translation (" + browserName() + ")" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.token !== "string") {
        throw new Error(body.message || text("msgOfflineBindRefused", "The helper window did not allow this browser. Click Connect this browser again and choose Allow."));
      }
      twpConfig.set("offlineHelperToken", body.token);
      const enabled = twpConfig.get("enabledServices") || [];
      if (!enabled.includes("offline")) twpConfig.set("enabledServices", [...enabled, "offline"]);
      const packs = Array.isArray(status.packs) ? status.packs : [];
      setBindMessage(packs.length
        ? text("msgOfflineConnected", "Connected. Language packs: " + packs.join(", "), packs.join(", "))
        : text("msgOfflineNoPacksYet", "Connected. Install a language pair in the helper window."), "ok");
      setDot("ok");
      showBindState(true);
    } catch (e) {
      setBindMessage(e.message || String(e), "error");
    } finally {
      button.disabled = false;
    }
  }

  /** Removes the connection in the helper (if it runs) and in this extension. Offline is turned off here. */
  async function disconnectHelper() {
    const token = String(twpConfig.get("offlineHelperToken") || "").trim();
    if (token) {
      try {
        await fetch(HELPER + "/api/offline/unbind", { method: "POST", headers: { Authorization: "Bearer " + token } });
      } catch (e) {
        // The helper is not running. Its window still lists the connection until it is removed there.
      }
    }
    twpConfig.set("offlineHelperToken", "");
    const enabled = (twpConfig.get("enabledServices") || []).filter(service => service !== "offline");
    twpConfig.set("enabledServices", enabled);
    setBindMessage(text("msgOfflineRemoved", "Disconnected. Offline (desktop helper) is off."), "");
    showBindState(true);
  }

  function selectedProvider() {
    return (document.querySelector("input[name=\"provider\"]:checked") || { value: "offline" }).value;
  }

  function showResult(message) {
    const result = document.getElementById("result");
    result.textContent = message;
    result.hidden = false;
    document.getElementById("btnSave").disabled = true;
    document.getElementById("btnSkip").disabled = true;
  }

  function markDone(then) {
    chrome.storage.local.set({ onboardingDone: true }, () => then && then());
  }

  function save() {
    const choice = selectedProvider();
    twpConfig.onReady().then(() => {
      if (choice !== "keep") {
        twpConfig.set("pageTranslatorService", choice);
        twpConfig.set("textTranslatorService", choice);
        const enabled = twpConfig.get("enabledServices") || [];
        if (!enabled.includes(choice)) twpConfig.set("enabledServices", [...enabled, choice]);
      }
      markDone(() => {
        const needsKey = PROVIDERS.find(p => p.id === choice && p.needsKey);
        let message = text(needsKey ? "onboardingSavedKey" : "onboardingSaved", "Saved. You can close this tab.");
        if (choice === "offline" && !isBound()) {
          // The page closes after Save. When the helper still needs connecting, the note stays on screen for a few seconds first.
          message += " " + text("onboardingOfflineNotConnected", "Offline will not work until this browser is connected to the helper. Press Connect this browser above.");
          showResult(message);
          setTimeout(closeThisTab, 6000);
          return;
        }
        closeThisTab();
      });
    });
  }

  // Closes this setup tab. Falls back to window.close() when the tab cannot be found.
  function closeThisTab() {
    try {
      chrome.tabs.getCurrent(tab => {
        if (tab && tab.id != null) chrome.tabs.remove(tab.id);
        else window.close();
      });
    } catch (e) {
      window.close();
    }
  }

  function skip() {
    markDone(() => showResult(text("onboardingSkipped", "Skipped. You can close this tab.")));
  }

  renderProviders();
  document.getElementById("btnCheckHelper").addEventListener("click", checkHelper);
  document.getElementById("btnBind").addEventListener("click", connectHelper);
  document.getElementById("btnUnbind").addEventListener("click", disconnectHelper);
  document.getElementById("btnSave").addEventListener("click", save);
  document.getElementById("btnSkip").addEventListener("click", skip);
  twpConfig.onReady().then(() => twpI18n.updateUiMessages()).then(() => {
    // The page is translated now, so the provider labels are built again in the user's language.
    renderProviders();
    checkHelper();
  });
  checkHelper();
})();
