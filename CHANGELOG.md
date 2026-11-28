# Changelog

## Unreleased
- Release notes: a download table by operating system, with every file's SHA-256 and size, and a `SHA256SUMS.txt`
  file for checking downloads. Android has no package (the helper is a desktop program; Firefox for Android installs the
  store version). Intel Macs have their own disk image. Windows ARM64, Linux ARM64 and the .deb and .rpm packages are
  not built yet.
  Each file has a short description of who it is for.
- The extension's Settings note about the offline service ("Needs the Atlas Helper and a language pack") is translated
  into 39 languages. Santali shows English until it has a translation.
- Offline text recognition (OCR) engines in the helper, in pure Rust, with a local `/api/offline/ocr` route for the
  extension. ocrs (MIT or Apache-2.0 engine; models CC BY-SA 4.0, about 12 MB, checked with SHA-256) is the default.
  PP-OCRv4 (Apache-2.0, about 16 MB) is the second. The request names the engine it wants; when that one is not
  installed, the other installed engine reads the picture. The helper's ping lists the installed engines in
  `ocr_engines`. Tesseract is listed, not added yet.
  The Translator's PDF tab has an OCR button for scanned pages (no text): the page is read by the helper and then translated.
- Helper window and tray text: translated into 39 languages (Santali shows English until a translation is added). Native-speaker review is still needed before release.
- Helper About tab: the version, a link to the web page, the repository, releases and third-party notices.
  The language is the one chosen in Settings, or the computer's language with "system". Strings with no translation show
  in English. 
- Read-aloud runtime: the Offline tab installs it once for the computer (sherpa-onnx, checked with SHA-256). The local API
  for speaking, OCR and translation now checks the token under the lock and releases it before the slow work.
- Helper: checks for a newer helper, not only a newer extension. It shows "A new version is available, please update" with what is new, and a button to the release page.
- Atlas Helper starts silently: after install and at sign-in it runs in the tray only, with no window and no console. Its window opens from the tray icon.
- Read-aloud voices: seven voices for English, Arabic, Chinese and 31 languages in all (Kitten nano 0.2 added for English), with licences and SHA-256 checksums. In the Offline tab, choose a language, tick the voices you want (or select all), and install them: the size and licence are shown first, and each download is checked. The Translator's Listen button uses them.

Not released yet. Changes after 0.0.2.5 are listed here.

- Translator page (toolbar popup menu, "Translator"): translate text as you type, with a language swap, Copy and Save.
  History keeps the newest 100 translations. Saved items stay until you remove them. "Clear history" removes only unsaved items.
- Translator PDF tab: choose a PDF file or paste its address. The text is read and translated on this computer with the
  Offline helper (one side must be English, and the language pack must be installed). Scanned pages (no text) are read
  with the helper's text recognition when you press "Read scanned pages with OCR".
- Translator text tab: a Google-style language chooser (chips for the current and recent languages, a full list with search, swap).
- Translator: Listen to the source or the translation, at Normal, Slow or Slowest speed. The helper's installed read-aloud voice
  for the language is used when there is one (up to 2000 characters); otherwise the computer's voices are used.
- Atlas Helper status: the local API reports the installed read-aloud voices and whether text recognition is installed.
- Offline tab: "Install all voices for <language> (recommended)" and "Install all packs (recommended)". Single voices and packs can still be chosen.
- Licences in the packages: the Windows installer, the Linux AppImage and the macOS app now include LICENSE, NOTICE.md and LICENSES/.
- Checks: a workflow downloads each read-aloud voice archive, checks its size and SHA-256, and reports whether it contains espeak-ng-data and licence files. Another workflow checks every Rust crate's licence against an allowlist (tools/atlas-updater/deny.toml).
- Labels for the batch installs are translated into all helper languages (first drafts, to be reviewed by native speakers).
- Licences: the full texts of the licences the helper's parts use are in LICENSES/ (GPL-3.0 for the espeak-ng phoneme data in the voice archives, Apache-2.0, MIT, MPL-2.0, and links for CC BY 4.0, CC0 and OpenRAIL-M). NOTICE.md lists each part.
- Opening a PDF shows a prompt to translate it (From and To). It opens the Translator's PDF tab, which translates on this computer with the Offline helper.
- PDF translation: the document's language is guessed from its text, and From is set to it. A "Show original text" box shows each paragraph's source.
- Keyboard command "Open the Translator" (Firefox: Shift+Alt+Y; Chromium: set it at chrome://extensions/shortcuts).
- Setup page: Save closes the page. When the helper still needs connecting, the note stays for a few seconds first.

## 0.0.2.7

Prepared, not published yet.

- Atlas Helper: the dark theme is readable. The header, the footer and the sidebar follow the theme, so the tab names no longer disappear on a dark background.
- Atlas Helper: Offline translation has "Install many packs". Choose a language under "Translate to" and install all of its packs at once, or install all packs. The window shows the number of packs and the total size first, and the packs install one after another. A pack that fails is reported, and the others still install.
- Atlas Helper for Linux: `atlas-updater-linux.AppImage` is one file with the helper and the offline engine. It needs no installation. Start-at-login and the browser connection use the AppImage file, so they keep working after the helper closes.
- Atlas Helper for macOS: `atlas-updater-macos.dmg` holds Atlas Helper.app with the offline engine inside. Drag it to Applications. The app has an ad-hoc signature, not an Apple certificate, so the first start needs right-click, Open.
- Release: the offline engine is no longer attached as separate files. The setup file, the AppImage and the disk image include it, and the helper finds it beside itself. The raw Linux and macOS helper programs are no longer attached either.
- Atlas Helper: when a release has no separate engine file, the message says to install the AppImage or the disk image, which include the engine.

## 0.0.2.6

Next release (not published yet).

- Release: the version commit includes tools/atlas-updater/Cargo.toml, so every version field agrees (npm run check).
- Release: when addons.mozilla.org already has this version, the Firefox step reports it as done and does not fail. Nothing is sent again.
- Release: when Edge Add-ons already has this version, the Edge step reports it as done and does not fail. Nothing is sent again.
- Atlas Helper on Windows: the offline engine is inside the setup file, next to the helper. The helper no longer downloads an engine program and runs it on Windows. The installer also removes copies that older helpers downloaded.
- Atlas Helper: Settings has a colour choice (blue, teal, green, violet or orange) for the window, next to the light, dark and system themes.
- Atlas Helper: Settings has a language choice (the languages of the extension, or the computer's language). It sets the layout direction: right to left for Arabic, Hebrew, Persian and Urdu. The helper's text stays English until it is translated.
- Atlas Helper: the README has a "Windows: every detail" section. It lists the files, the folders, the registry keys, the network addresses, the startup shortcut, uninstalling, and the steps for Defender and the SHA-256 check.
- Atlas Helper on Windows: starting at sign-in is a shortcut in the Startup folder, made by the installer, like other programs. The helper no longer writes a Run entry in the registry, and the installer removes the old one. Windows Settings, under Apps, then Startup, turns it on or off. The Settings card shows the state and opens that page.
- Atlas Helper: the helper no longer runs PowerShell, curl, unzip or reg.exe. Downloads, unzipping and the Windows startup entry are done by the helper itself, so no console window appears.
- Atlas Helper: a Windows installer (`atlas-updater-windows-setup.exe`) installs for the current user, with a Start menu entry, an optional desktop shortcut and an optional start at sign-in. It needs no administrator password, and it uninstalls cleanly.
- Atlas Helper: the welcome page is smaller. Each browser is one row, and its steps are folded away under "Steps". It says that Chromium browsers need Load unpacked.
- Atlas Helper: Internet Explorer is no longer listed as a browser to set up (Windows lists it as IEXPLORE.EXE).
- Atlas Helper on Windows: the program carries version information (company, product, description and version), which antivirus heuristics look at. It is not signed yet.
- Atlas Helper: a translation from language packs already on disk is tested with no network. CI runs that test on Linux with the network removed.
- Atlas Helper: a Settings card for the look: theme (follow the system, light or dark) and text size (normal or large).
- Atlas Helper: a Settings switch decides whether closing the window keeps the helper in the tray (on by default) or quits it.
- Offline translation: a page in a right-to-left language is no longer flipped as a whole. Only the translated text blocks take their direction from their own text, so English punctuation (such as a question mark at the end of a headline) stays where it belongs.
- Extension: the errors "No tab with id", "Cannot read properties of undefined (reading 'toLowerCase')" and "Extension context invalidated" no longer appear. Messages to a closed tab are skipped, the PDF check in the popup handles a missing tab or address, and the browser's harmless errors after a reload are not shown as uncaught.
- Atlas Helper: the published 0.0.2.5 Windows helper ran PowerShell to unzip and curl to download, and those opened a command window. The helper now downloads and unzips by itself. This fix is on the branch and needs a new release.
- Atlas Helper: the Offline translation list has a search box (by language name or code, for example "German" or "de") and an "Installed only" filter. Installed packs are listed first. The list reads the installed packs once, not on every frame.
- Atlas Helper: the README says what to do when Windows Defender warns about the helper: check the SHA-256 against the release, allow the file on the device, and report it to Microsoft.
- Options, Services, Offline: "Start the helper when the browser starts" (off by default). The setting is kept by the helper, so the helper window and the Options switch show the same value. When it is on, the browser starts the Atlas Helper in the tray each time it starts, so Offline is ready. It uses a native messaging host (com.atlas.helper), which the helper registers for the current user when you allow this browser in the helper window. No administrator rights and no window. The extension asks for the "nativeMessaging" permission, so Chrome and Edge may ask you to approve it after an update.
- Setup page: redesigned in three numbered steps (provider, the Atlas Helper, save). The helper step shows whether the helper runs, and has a Connect this browser button that sends the bind request to the helper, and a Disconnect button. Before this, the setup page had no bind button.
- Options: the Text direction and Text size rows use the same layout as the other rows, and "Get the helper" is shown as a button.
- Atlas Helper: downloads are faster. A file is split into parts that download over several connections at once, and the helper puts them back together before checking the SHA-256. A server that does not allow parts still gets one download. Settings > Downloads sets the number of connections (1 to 8, 4 by default).
- Atlas Helper: a progress popup for installs and downloads. It shows the current step (checking the version, downloading, checking, unpacking, copying), the megabytes so far, and a Cancel button. Cancelling stops the download and installs nothing.
- Atlas Helper: "Start the helper when I sign in" moved to Settings. The helper starts minimised to the tray.
- Extension: Options has a Text size setting (normal, large, extra large) and a Text direction setting (automatic, left to right, right to left). They also apply to the popup. Helper text is not translated yet.

## 0.0.2.5

- Atlas Helper: the helper is now called Atlas Helper in its window, its tray icon and its menu. Its file names are unchanged for now.
- Atlas Helper on Windows: the program opens its window and tray icon without a command prompt behind it.
- Offline translation: the extension and the helper now agree on a protocol version, and the helper says which features it has. A helper that is too old is not used. The Offline settings say "update Atlas Helper", and the text goes to the next enabled service instead of failing.
- Atlas Helper: a welcome window opens on first run. It shows whether a new Atlas Translation is available, lists the browsers found on this computer, and explains each step. Nothing is installed without the user clicking Install here. Chromium browsers still need Load unpacked, because they do not allow a silent install from outside their store.
- Atlas Helper: the "Install in all of them" button sets up every browser found, and copies the extension into the folder once.
- Offline translation: the helper can load the engine as a library in its own process, so no engine program runs for a translation. The engine program is kept as a fallback when the library is missing or does not load.
- Atlas Helper: browsers are found the way the system lists them (Windows default apps, applications on macOS, desktop entries on Linux), not from a fixed list. Any Chromium-based browser, such as Comet, is offered with its extensions page. Firefox links to the store.
- Extension: when the helper is running and this browser is not linked, the Offline settings ask whether to link Atlas Helper, and say why it is needed.
- Atlas Helper: the welcome window and the Extension tab say "please update" when a newer release exists, with that release's "what is new" notes.

## 0.0.2.4

- Desktop helper: the window uses the same logo as the extension, in its header, on its window and in the tray.
- Desktop helper: a clearer window. The tabs are in a sidebar, each group of settings sits on its own card, the language packs are listed as a table, and the text stays in one readable column.
- Setup page: when the extension is installed, Atlas Translation opens a setup page. It explains the desktop helper with a download link, and lets you choose the translation provider (Offline, Google, Groq or OpenRouter), with what each one sends. When you choose Offline, the page shows whether the helper is running and which language pairs it has installed, and where to install or change them. The recommended choice, Offline, is selected first; choose Keep to leave your current service as it is. It opens once. Updates do not open it again. Options, Others, "Open the setup guide" opens it again.
- Updates: when a newer version is out, Options says "Please update" and lists what is new in that version, taken from its changelog section. Prereleases are included. The desktop helper says the same in its Extension tab.
- Desktop helper: when it finds a browser on this computer (Chrome, Edge, Brave, Opera, Vivaldi, Firefox), it asks once whether to set Atlas Translation up there too. Firefox opens the add-on page. A Chromium browser opens its extensions page, and you choose Load unpacked. Chromium browsers cannot be set up silently, so the last step is yours. The answer is remembered for each browser, and Settings can show the question again.
- Desktop helper: the browsers that are found are marked in the Extension tab.
- Desktop helper: the Offline tab shows how many language packs are installed and how much space they use, and opens the packs folder.
- Desktop helper: a Settings tab. Experimental is off by default. Turning it on shows the developer details: the data folder, the packs folder, the offline service address, and the helper version.
- Google translation (#1078): an empty result, or a long paragraph (80+ characters) that Google returned unchanged from a known foreign language, is not shown or cached. The batch then falls back to the next enabled service as before, and the rows that were translated stay in the cache. Old cached copies of such results are fetched again.
- Page translation (#1049): text before and after inline code (`<code>`) or a keyboard key (`<kbd>`) is no longer split into two separate translations. The sentence is sent as one piece, and the code text is part of it. Other inline tags are unchanged.
- Options, Others: an Experimental switch (off by default). When it is on, the developer details show the version and a Copy diagnostic info button, which copies the version, the browser and the enabled service names. API keys are never copied.

## 0.0.2.3

- Desktop helper: a new window instead of a browser page. It has a tray icon (Open and Quit), closing the window keeps the helper in the tray, and it has three tabs: the extension, offline translation, and connections.
- Offline translation is bound, not paired: on a page or in the options, Bind this browser asks you in the helper window to Allow it. The pairing code is gone. Remove a browser under Connections, or click Unbind in the options. The helper keeps only a hash of the token.
- Right-to-left languages on web pages (Arabic, Hebrew, Persian, Urdu and others): the translated text is laid out right to left and aligned to the start edge, also where the site forces left alignment or left-to-right direction. The page itself is still flipped as before, and both are restored when the page is restored.
- Desktop helper: when the system language is right to left, the window mirrors its layout (tabs on the right, rows right to left). Its text stays English for now; translating it is planned later.

## 0.0.2.2

- Desktop helper: its version is the extension's version (0.0.2.2 for this version), and a README section describes it.
- Local files (file://): when the browser has not allowed the extension to read file pages, the popup says so and how to allow it (#91, #1051).
- Local files (file://): "Never translate this site" and "Always translate this site" now work on a local file. The rule applies to that file (#91, #1051).
- New shortcut, Shift+Alt+H (changeable in the browser's shortcut settings): turns hover translation on or off for the current tab, until the page is reloaded (#1047).
- LibreTranslate (#278): can translate whole pages once a server is saved (Options, Page Translation Service). The API key is optional, for servers that need none. Each text is sent as its own request.
- Right-to-left languages (Arabic, Hebrew, Persian, Urdu and others): the popup and options pages are laid out right to left when the interface language is one of them (#638).
- Options, Keyboard shortcuts: on Chrome and Edge the field shows the shortcut the browser really has, not a saved one (#842). The double-Ctrl options are unchanged.
- Offline translation is faster: long texts are split at their line breaks, and the parts are translated in parallel on
  two engine processes per language pair.
- The helper tries a download again when the network cuts it short.
- The helper can start when you log in, in the background (its window: "Start the helper when I sign in"). Windows, macOS and Linux.
- Paragraphs (#727), optional: Options, "Translate each paragraph as one text" (off by default). A sentence split by inline tags (links, bold, spans) is then sent and translated as one text, instead of in fragments.
- OpenRouter (AI): a new translator with your own OpenRouter key (Settings → Services). Choose any model OpenRouter offers; the default is openai/gpt-4o-mini. Like Groq, the text goes only to OpenRouter with that key, and the answer must match the request, so a broken answer is not shown as a translation (#1029).
- Translation failures: OpenRouter is included in the retry-with-the-next-service rule and in the removal of failed translations.

## 0.0.2.1

- Offline translation (desktop helper): a new service, "Offline (desktop helper)", translates on this computer with no text sent to a web service. The Atlas helper (atlas-updater) runs an offline engine built from Mozilla's Bergamot (the engine Firefox uses) and serves it to the extension on 127.0.0.1. Set it up in Options, under Translation services: open the helper, install a language pack in its window, then paste the pairing code from the helper window and choose Save and test.
- Offline translation: the helper's Offline section lists the language packs (each pack is a language pair with English, from the translation models that Firefox downloads, about 37 MB each), installs and removes them, and installs the engine from the newest release. Each pack file is checked against its SHA-256 before it is kept, and nothing is left behind when a check fails. The packs and the engine are stored in the user's data folder, so updating the extension does not remove them.
- Offline translation: when the helper is not running, or the language pack for the pair is not installed, the next enabled service translates the text. Those cases do not count as failures, so the service is not put on cooldown for them.
- Offline translation: once it is set up, Offline appears in the page and text translation choices in Options, in the text-selection bubble, in the translated-page bubble and in the text translation popup. It stays hidden until then.
- Restore from file: a blank pairing code in a backup keeps the code saved on this device, and Offline is turned off when no code is saved, the same as Groq and DeepL.
- Release workflow: the offline engine is built for Windows, macOS and Linux and attached to each release as atlas-engine-windows.exe, atlas-engine-macos and atlas-engine-linux. A failed engine build stops the publish job, the same as the helper.
- Restore from file works on Chrome, Edge and Firefox. On Chrome and Edge, 0.0.2.0 stopped with "browser.commands.update is not a function" after the file was chosen. Restore and Reset to defaults no longer call that function on Chromium.
- Chromium and Edge: the signed build carries its public key in the manifest, so the unpacked zip has the same extension ID as the CRX. Settings are stored per extension ID, so a copy loaded from the 0.0.2.0 zip keeps its own settings. Use Restore from file to move them.
- Restore from file: a blank Groq or DeepL key in a backup keeps the key saved on this device.
- Restore from file: Groq or DeepL is turned off when no key is saved, and the translators move to Google. A backup from 0.0.1.9 restores as it is, without its key.
- Helper window: starting atlas-updater with no arguments opens a page in your browser. It checks for a new version when it opens, installs it in one click, and shows the steps for Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera and Firefox. Firefox links to the Firefox Add-ons page. Chromium browsers load the extension from its folder (Load unpacked), because they do not allow the helper to add it.
- Updates: a helper program, atlas-updater (tools/atlas-updater), installs the newest release into an unpacked copy of the extension. It is written in Rust and runs on Windows, macOS and Linux. Every release attaches the three programs.
- Restore from file no longer fails on Chromium when the browser has no shortcut update call. The shortcut keys are set in chrome://extensions/shortcuts there.
- Reset to defaults has the same fix.
- Updates: the Reload extension button reloads Atlas Translation from its folder after the new zip is extracted over it. Chromium cannot install a newer unpacked copy by itself.
- Options: an open settings page says once that it must be refreshed after the extension is reloaded, instead of showing many errors.
- Translation: when a service fails (Google, Bing, Yandex, DeepL, Groq or LibreTranslate), the text is translated by the next enabled service that supports the language. A service that fails three times in a row is skipped for five minutes, then tried again. Google and Bing use endpoints that are not official APIs, so this keeps pages translating when one of them breaks. Before, a failed request left the text untranslated.
- Czech: the "extension has been updated" message showed the extension name where the version belongs. It now shows the version.
- Translators: `npm run locales:check` lists the messages each language is missing, and any placeholder that differs from English. The unit tests fail if a language has a placeholder problem.
- The 36 messages added for the update check, the CAPTCHA notice, Groq and the toolbar icon style are not translated yet in any of the 40 languages. Those languages show English for them until they are translated.
- Popup: the translate icon is the brand in the header. The Atlas wordmark and the duplicate icon are removed.
- Popup: tap the service badge to switch the service that translates the page to the next enabled one. It is the same switch as the hotkey.
- Popup: one Settings button, the gear in the header. The gear at the bottom of the menu and the More options item are removed.
- Popup: the language bar works when the small label inside Original is tapped.
- Groq: the default model is now openai/gpt-oss-20b. Groq shut down llama-3.3-70b-versatile on 16 August 2026 for free and developer tiers. Settings that name a retired Groq model are switched to its replacement when they load or are restored, so older backups keep working.
- Restore from file accepts backups from older versions. Unknown keys are ignored, and the Groq model is migrated as above.
- New logo: the Atlas Translation icon (the blue and grey translate cards) replaces the old icon set in the toolbar, the extension icons, the options page, the store logo, and the README. The old swap icon and the old icon generator script are removed.
- Popup: the Atlas translate icon (the SVG, with the Atlas mark in place of the A) sits beside the service badge, and it switches to the translated version while the page is translated.
- Release workflow: a version that is already published (tag and GitHub release both exist) is reported as done and is not published again. It no longer fails.
- Popup: the DeepL and Groq marks are smaller so they fit the badge.
- Options: the Services checkboxes no longer touch the edge of the card, and each has a gap from its name.
- Translation cache: lookups answer from memory after a translation is added, concurrent lookups for the same text share one database read, and the memory copy keeps only the newest entries.

## 0.0.2.0

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- Groq and DeepL: the popup shows a notice while the page text is sent to that service.

### Differences compared to version 0.0.1.9

- Added: DeepL quota and Groq usage in the popup, and the official Atlas logo, which turns blue while a page is translated.
- Changed: one popup with the options list always shown. The simple interface is removed.

### Full Release Notes

* **Added:**
  * The popup header shows the official Atlas logo, and a badge with the logo of the service that translates the page: Google, Yandex, Bing, DeepL or Groq. The logo turns blue while the page is translated, the same as the toolbar icon.
  * **DeepL:** the popup shows the characters used and your plan's limit.
  * **Groq:** the popup shows the approximate tokens used, counted from the answers Groq returns while the extension runs.
* **Changes:**
  * The site and language rules, the page actions, More options and About are always shown in the popup. The gear is at the top right and at the bottom right of the list. The simple interface and its *Select popup interface style* setting are removed.
  * The service badge is a label, not a switch. Choose the service in *Settings → Services*.

**Full comparison:** [v0.0.1.9...v0.0.2.0](https://github.com/loxdpsy/AT/compare/v0.0.1.9...v0.0.2.0)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this work).

## 0.0.1.9

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- Groq and DeepL: the popup shows a notice while the page text is sent to that service.

### Differences compared to version 0.0.1.4

- Added: a Groq (AI) translator with your own API key, and a Firefox toolbar icon colour setting.
- Fixed: Chinese pages with large blocks (#922), and auto-translate after a site or page language change (#934).

### Full Release Notes

* **Added:**
  * **Groq (AI)** translator. Add your own Groq API key in *Settings → Services*, then choose Groq for pages or selected text. The key is stored in the extension and is sent only to Groq.
  * Firefox toolbar icon colour in *Settings → Style*: follow the theme, black, white, or blue. Firefox only.
  * The GitHub Firefox build is signed by addons.mozilla.org as an **unlisted** add-on when a release runs with *submit_amo* on. It is never listed publicly.
  * The popup shows a notice while the page service is **Groq** or **DeepL**, because the page text is sent to that service.
* **Changes:**
  * The toolbar popup shows every option on one page. The More and Less paging is removed. The gear icon opens Settings.
  * Builds and releases run the unit tests (`npm test`) first. Edge is submitted only after the checks pass. A release stops before its version commit and tag when CHANGELOG.md has no section for that version.
  * The ⋮ options menu has an icon for each row. It holds the site and language rules, the page actions, More options, and About. Display options stay in Settings.
* **Fixed:**
  * Chinese pages: large blocks that cover the screen are translated (issue #922).
  * Auto-translate runs again after a site or page language change (issue #934).
  * The DeepL button appears in the show-translated panel when DeepL is enabled.
  * Page translation starts faster: cache reads run together instead of one by one.
  * Right-to-left pages also flip for Dari (prs) and Sindhi (sd).

**Full comparison:** [v0.0.1.4...v0.0.1.9](https://github.com/loxdpsy/AT/compare/v0.0.1.4...v0.0.1.9)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this work).

## 0.0.1.4

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- The Yandex and captcha fixes are not yet checked against the live Yandex service.

### Differences compared to version 0.0.1.3

- Added: update notice for zip and crx installs (Chromium and Edge), and a *translate every language* setting.
- Added: a popup options menu with site, page, and app items.
- Added: a Yandex captcha dialog on the page, instead of a new tab.
- Fixed: Yandex session id, new-tab retry for unknown languages, and the translation bar language label.

### Full Release Notes

* **Added:**
  * Popup options menu: *Never translate this site*, *Always translate this site*, *Never translate this language*, *Choose another language*, *Open in Google Translate*, *Translate PDF*, and *About*.
  * Update notice: the extension checks GitHub once a day and shows a banner when a newer release exists. Chrome and Edge do not update zip or crx installs, so this is the only notice. Firefox is skipped.
  * Setting: *Translate every language except the ones in Never translate this language* (off by default).
  * *Always translate this site* in the mobile menu.
  * Right-to-left pages: when the translation is in a right-to-left language (ar, he, fa, ur, ps, sd, ug, yi, dv, ckb), the page is flipped to right-to-left. The page returns to its original direction when translation is turned off.
  * Yandex captcha dialog: the captcha is shown on the page. *Open in a small window* and *Translate again* are the fallbacks.
* **Changes:**
  * The options menu is a panel above the page content, not an overlay. It closes on Escape, an outside click, or the button. Display options (selected-text button and hover translation) stay in Settings.
  * The GitHub Firefox build in this release is unsigned. From the next release on, it is signed by addons.mozilla.org as an unlisted add-on and is never listed publicly.
  * When no extension theme colour applies, the Firefox toolbar icon gets an outline in the opposite colour, so it stays visible on light and dark toolbars.
  * Firefox store submission reads `AMO_LISTING_READY` from a repository variable or a secret.
* **Fixed:**
  * Yandex: the session id is read with a tolerant pattern, and a warning is logged when it is not found.
  * The translation bar shows the real page language. It falls back to the page language attribute, then to Chrome's language detection. The label stays empty while unknown, and the language rows are hidden.
  * A new tab with an unknown language is checked again up to two times before it gives up.
  * An update notice for a release that is not newer than the installed version no longer shows.
  * Site items in the popup options menu are disabled on pages without a web host (chrome:// and file://).
* **Updated:**
  * Five captcha messages and the update notice text are in English only for now. Other languages fall back to English until they are translated.

**Full comparison:** [v0.0.1.3...v0.0.1.4](https://github.com/loxdpsy/AT/compare/v0.0.1.3...v0.0.1.4)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.3

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.

### Differences compared to version 0.0.1.2

- Fixed: Edge waits when an earlier submission is still in review, instead of failing.
- Fixed: Firefox never reports success for a failed upload, and names an AMO IP block in the job summary.

### Full Release Notes

* **Changes:**
  * The README version badge syncs daily with the latest release.
  * The release job stages every file that the version sync changes.
* **Fixed:**
  * Edge: waits instead of failing when an earlier submission is still in review.
  * Firefox: never reports success for a failed upload. An AMO IP block is named in the job summary.

**Full comparison:** [v0.0.1.2...v0.0.1.3](https://github.com/loxdpsy/AT/compare/v0.0.1.2...v0.0.1.3)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.2

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.

### Differences compared to version 0.0.1.1

- Added: separate GitHub and store listings for Firefox, each with its own add-on ID.
- Added: the About page is translated into every locale, with a thanks line and credit links.
- Fixed: the Edge package is named on releases, and the popup menu no longer breaks AMO's review.

### Full Release Notes

* **Added:**
  * Firefox: separate GitHub and store listings, each with its own add-on ID. The GitHub and store versions are published in one release.
  * About is a section of the settings page, with the sidebar. It is translated into every locale, with a thanks line and credit links.
  * Popup options menu: a themed list instead of a native select. About opens directly.
  * Edge: the package is named on releases.
* **Changes:**
  * README: Firefox is installed from the GitHub release only.
  * AMO metadata uses only tags that AMO accepts.
* **Fixed:**
  * The popup menu check mark is built with DOM calls, because AMO flags `innerHTML`.
  * Services page layout.
  * "Extension context invalidated" errors in the selection script are stopped.
  * Edge: the upload URL is built from the Location header.

**Full comparison:** [v0.0.1.1...v0.0.1.2](https://github.com/loxdpsy/AT/compare/v0.0.1.1...v0.0.1.2)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.1

Firefox self-hosting. This version is the first one that can be installed outside addons.mozilla.org and update itself.

**Added**

- Firefox `update_url` pointing to `updates.json` on the latest release. Installed copies check it for newer versions.
- Each release that is signed for AMO also publishes a signed `atlas-translation-<version>-firefox-signed.xpi` and `updates.json`.

**Changed**

- A listed AMO submission sends a build without `update_url`, because AMO rejects that key on listed add-ons.

**Fixed**

- The toolbar popup's options menu is readable in light and dark mode.
- The source-language label sits inside the Original button.

## 0.0.1.0

First release of Atlas Translation. The version numbers start again at 0.0.1.0. The 9.8.x entries below are the TWP fork history.

**Added**

- Firefox self-hosting: a signed `-firefox-signed.xpi` on each release, with automatic updates from `updates.json` (see the README).
- Theme switcher: System, Light, or Dark, in *Style → Theme*. The choice applies to the settings page and the popup.
- An About page with a "More from Etherealmber" section, showing Atlas Commerce, its Android app, and its desktop app.
- Edge Add-ons automatic submission. The release workflow uploads the Chromium package and submits it when the `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, and `EDGE_API_KEY` secrets are set.
- A README section on security and privacy: what is sent, what is stored, and why each permission is needed.
- An About page with the installed version, credits, license, and links. It is reachable from the popup's options menu and from Settings.
- `npm run version:sync -- <version>` sets the version in every file that states it, and `npm run check` fails when they differ.

**Changed**

- The settings page and the popup use Chrome's settings look (light and dark) in every browser.
- New icon: the Atlas sunburst with a translation badge (two arrows). It is easier to read at small sizes.
- The side pages (translate text, change language, improve translation, translate PDF, old popup) use the same Chrome look and theme as the popup.
- The popup has tighter spacing, hover states on each option, and lighter type.

**Fixed**

- The popup and side pages no longer inject their own hard-coded dark styles, which clashed with the theme.
- The README version badge and the package version fields are kept in step.

## 0.0.0.1

**Important information**

Atlas Translation is a fork of **TWP - Translate Web Pages** by FilipePS. It is not the official TWP extension. The official Atlas Translation listings are Firefox Add-ons, the Chrome Web Store, Microsoft Edge Add-ons, and Firefox for Android. The original author and
license are credited in NOTICE.md and LICENSE. The changes below are relative to the TWP 9.8.1.0 base this fork started from.

**Added**

- DeepL translation through the official DeepL API. Use your own API key in the settings. Free keys end in `:fx`.
- Chromium 109 or newer, and Firefox, both on Manifest V3.
- Update check: `npm run update:check` queries the GitHub API and respects the rate limit.
- Release workflows: Chromium ZIP and CRX, Firefox ZIP and XPI, and an automatic Firefox submission to addons.mozilla.org.

**Changed**

- Renamed to Atlas Translation (short name ATL), with a new icon built from the Atlas Commerce sunburst and a translation badge. The Firefox add-on ID is new, so this build installs next to the original TWP.
- Settings page and popup use the Atlas Commerce colour theme (zinc neutrals, near-black accent). The settings cards are arranged in a bento-style grid.
- Settings page redesigned, with an improved dark mode.
- Translation and text-to-speech requests send no cookies.
- Bing and Yandex translation services rewritten.
- Donation links (Patreon, PayPal, Coinpayments) and their buttons removed.
- Interface text updated in all 41 languages: donation strings removed and the name changed to Atlas Translation.

**Fixed**

- Yandex: a session ID that Yandex rejects is discarded, and a new one is fetched on the next request.
- Memory: translation and audio caches have fixed limits, and the per-tab MIME type map is cleared when a tab closes.

**Known limits**

- Yandex and Bing were not checked against the live services for this release. Please report problems in the issue tracker.
- Text-to-speech on Chromium needs version 109 or newer.

## Upstream base

Base version inherited from TWP. See the upstream project for its history: https://github.com/FilipePS/Traduzir-paginas-web

## Contributors

Thank you to everyone who built and tested Atlas Translation.

- **FilipePS** (Filipe Pereira Silva): original author and maintainer of TWP - Translate Web Pages. This fork is built on that work. See [NOTICE.md](NOTICE.md).
- **loxdpsy** and **loxdpsy-dev**: maintainers of this fork. They wrote the Atlas rename, the settings and popup design, the release workflows, and most of the changes in the notes above.
- **Haytam**: the initial commit of this repository.
- **arena-agent**: AI coding agent, co-author on many commits of this fork.
- **The translators** of TWP's interface languages. Many of the interface translations come from the original project.
- **Everyone who reported issues** on TWP and on this fork. The fixes listed above started as their reports.
