"use strict";

// When the active tab is a PDF, the toolbar popup shows the PDF prompt (translate the document in the Translator)
// instead of the page menu. The address of the PDF is passed on, so the Translator can read it.
function showPdfPrompt(url) {
  window.location = "popup-pdf-prompt.html" + (url ? "?url=" + encodeURIComponent(url) : "");
}

chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => {
  // A popup opened where there is no tab, or a tab with no address (chrome:// pages, for example), has no URL to check.
  const url = tabs[0] && typeof tabs[0].url === "string" ? tabs[0].url : "";
  const lower = url.toLowerCase();
  if (lower.startsWith("file:") && lower.endsWith(".pdf")) {
    showPdfPrompt(url);
    return;
  }
  if (!lower.startsWith("http:") && !lower.startsWith("https:")) return;
  chrome.runtime.sendMessage({
    action: "getTabMimeType"
  }, mimeType => {
    checkedLastError();
    if (typeof mimeType === "string" && mimeType.toLowerCase() === "application/pdf") showPdfPrompt(url);
  });
});
