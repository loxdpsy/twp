# Atlas Translation

<p align="center"><img src="icons/icon-128.png" width="96" alt="Atlas Translation logo"></p>

![Version](https://img.shields.io/badge/version-0.0.2.7-1a73e8) ![Release date](https://img.shields.io/github/release-date/loxdpsy/AT?label=release%20date) [![Issues](https://img.shields.io/github/issues/loxdpsy/AT)](https://github.com/loxdpsy/AT/issues) [![Pull requests](https://img.shields.io/github/issues-pr/loxdpsy/AT)](https://github.com/loxdpsy/AT/pulls) [![License: MPL-2.0](https://img.shields.io/github/license/loxdpsy/AT)](LICENSE)

**Translate web pages in real time, in your browser.**

Atlas Translation translates whole pages, selected text, and documents with Google, Bing, Yandex, DeepL, or LibreTranslate.
It works on Chromium-based browsers (Chrome 109+, Edge, Brave, Opera, Vivaldi) and on Firefox.

> Atlas Translation is a modified fork of **TWP - Translate Web Pages** by **[FilipePS](https://github.com/FilipePS)**.
> Huge thanks to FilipePS and every contributor of the original project. See [NOTICE.md](NOTICE.md).

---

## Official listings

Atlas Translation is published in four places. Install it only from these:

| Store | Browser | Where |
| --- | --- | --- |
| Firefox Add-ons (addons.mozilla.org) | Firefox on desktop | *Atlas Translation*, once approved by Mozilla |
| Chrome Web Store | Chrome, Brave, Opera, Vivaldi | *Atlas Translation*, once published |
| Microsoft Edge Add-ons | Microsoft Edge | *Atlas Translation*, once certified |
| Firefox for Android | Firefox for Android | Same listing as Firefox Add-ons. Search for *Atlas Translation*. |

Other extensions with a similar name are not Atlas Translation. Store links will be added here once the listings are live.

## Features

- **Page translation** in place, with the original text shown on hover (optional).
- **Selected text** translation from the right-click menu, the popup, or a hotkey.
- **Translation services**
  - Google Translate (default)
  - Bing Translator
  - Yandex Translate
  - DeepL (official API, your own key)
  - Groq (AI, your own key)
  - OpenRouter (AI, your own key; you choose the model)
  - LibreTranslate (your own server and key)
  - When a service fails, the next enabled service that supports the language translates the text. A service that fails three times in a row is skipped for five minutes (see *Notes and limits*).
- **Translator page** (toolbar popup menu, *Translator*), like Google Translate:
  - translate as you type, with a language chooser: chips for the current and recent languages, a full list with search, and a swap button;
  - Copy, Save, and a History of the newest 100 translations. Saved items stay until you remove them;
  - **Listen** to the source or the translation, at *Normal*, *Slow* or *Slowest* speed. When the Atlas Helper has an installed read-aloud voice for the language (up to 2000 characters), that voice reads; otherwise this computer's voices do.
- **PDF translation.** When the tab is a PDF, the toolbar popup offers to translate it (From and To languages). It opens the
  Translator's PDF tab and translates the text on this computer with the Atlas Helper and an installed language pack (one side must be
  English). Scanned pages (no text) are read with OCR when you press *Read scanned pages with OCR*, using the helper's text recognition (see below). Limits: 50 MB and 300 pages. The result is text with Copy and
  Download .txt; the PDF layout is not rebuilt. The document's language is guessed from its text (a best guess, shown in the status).
  *Show original text* puts each paragraph's source under its translation.
- **Open the Translator with a keyboard shortcut.** Firefox: `Shift+Alt+Y`. Chromium browsers allow only four built-in shortcut
  suggestions, so set one yourself at `chrome://extensions/shortcuts` (the command is *Open the Translator*).
- **Text-to-speech** for translated text in the page translation (Chromium 109+ and Firefox).
- **Update check** script that uses the GitHub API and respects the rate limit (see *Checking for updates*).
- **Per-site and per-language rules**: never translate a site or language, always translate, auto-translate links.
- **Keyboard shortcuts** for toggling, showing the original, and switching services.
- **About page** with the installed version, credits, license, and links. Open it from the popup's options menu or from Settings.
- **Themes**: System, Light, or Dark (*Style → Theme*). The settings page and the popup look the same in Chromium browsers and Firefox. The layout follows Chrome's settings page.
- **Light on memory**: translations are cached with a bounded in-memory cache, and finished requests are released.

The web page: https://loxdpsy.github.io/AT/ (the same page is in `docs/`, published with GitHub Pages).

## Install

### Chromium (Chrome 109+, Edge, Brave, Opera, Vivaldi)

Chromium 109 or newer is required. Text-to-speech uses the offscreen document API, which Chromium added in version 109.

1. Download `atlas-translation-<version>-chromium.zip` from the [Releases](../../releases) page.
2. Unzip it. Open `chrome://extensions` (or the equivalent page in your browser), turn on **Developer mode**, and click **Load unpacked**. Select the unzipped folder.

The `.crx` file in the release is the signed package for the same version. Chrome and Edge only install `.crx` files
from the Web Store or through an enterprise policy, so use the ZIP for normal sideloading.

### Firefox

Install Atlas Translation from **addons.mozilla.org** (the store listing). That is the only Firefox build Mozilla signs.

The GitHub release also has `atlas-translation-<version>-firefox.xpi`. When the release runs with `submit_amo` on, Mozilla signs it as an **unlisted** add-on: it is never listed or published. Its add-on ID is in `firefox_manifest.json`. If the file is unsigned, Firefox refuses it, so use it only in Firefox Developer Edition, Nightly, or ESR with `xpinstall.signatures.required` set to `false`. It has no self-hosted updates.

Firefox for Android: install from addons.mozilla.org once the store listing is published. There is no install path for the GitHub build.

When the add-on is listed on addons.mozilla.org, the workflow sends a build without `update_url`, because AMO refuses that key on listed add-ons. Listed updates come from AMO.

## Desktop helper (Atlas Helper)

The helper is a small desktop program (Windows, macOS, Linux) written in Rust, in `tools/atlas-updater`. It is
optional. It does three things for the extension:

- **Updates your unpacked copy.** Chrome, Edge and Brave never update a folder you loaded with "Load unpacked". The
  helper installs the newest release into that folder, after checking its SHA-256.
- **Offline translation.** It runs the offline engine (`tools/atlas-engine`) with the language packs you install, so
  pages and selected text can be translated without sending them to a web service.
- **A window of its own.** A tray icon opens the helper's settings: the folder, the language packs, and the update
  check. It runs in the background from the tray, not in a terminal.
- **Read-aloud voices (Offline tab).** Choose a language, tick the voices you want (or select all), and install them. The size and each
  licence are shown first; a voice with terms (Supertone Supertonic 3) needs you to accept them. Each download is checked
  with SHA-256. The same tab installs the read-aloud runtime once for the computer (sherpa-onnx, Apache-2.0). Reading
  aloud from the extension is not built yet.
- **Text recognition (OCR, Offline tab).** Install one of two engines to read text in page pictures. ocrs (English and Latin
  letters, engine MIT or Apache-2.0, models CC BY-SA 4.0, about 12 MB) is the default. PP-OCRv4 (Chinese and English,
  Apache-2.0, about 16 MB) is the second. The helper reads pictures sent to it on 127.0.0.1, with the engine asked for when it is installed, or the
  other installed one. Tesseract is not added yet. The Translator's PDF tab has the OCR button for scanned pages.
- **Helper updates.** The helper checks GitHub for a newer helper, not only a newer extension. When one is out, the window says
  "A new version is available, please update" with what is new, and a button opens the release page. The helper does not
  replace itself; download the new one from the release.

The helper has the same version as the extension (for example 0.0.2.1). Download it from the release next to the
extension zip. See [tools/atlas-updater/README.md](tools/atlas-updater/README.md) for the details.

### Offline translation and offline voice

- **Translation packs.** Each language pair is a pack of about 37 MB, downloaded once and checked with SHA-256. The
  helper's Offline tab installs one pack, every pack into one language ("Translate to"), or all packs. A pair needs
  English on one side. Text is translated on this computer.
- **Read-aloud voices.** The Offline tab lists the voices for each language. "Install all voices for <language> (recommended)" installs every voice for it after a confirmation. You can instead tick single voices and choose "Install selected". The Offline tab also has "Install all packs (recommended)". "Install the selected voices" asks
  first, showing the size and each licence. The welcome page offers the English voices after the helper is installed,
  so the installer itself stays small. Voices come from the k2-fsa sherpa-onnx release and are checked with SHA-256:
  Supertone Supertonic 3 (31 languages, OpenRAIL-M: you accept its use restrictions before the download), Kokoro v1.1
  (English and Chinese, Apache-2.0), Kitten nano 0.2 (English, Apache-2.0), and four Piper English voices (public domain, CC0, Apache-2.0, CC BY 4.0). Credits
  are in [NOTICE.md](NOTICE.md), and the licence texts are in [LICENSES/](LICENSES/README.md).
- **Text recognition (OCR).** The helper reads text in page pictures, such as scanned PDF pages, with ocrs (English and Latin
  letters, about 12 MB) or PP-OCRv4 (Apache-2.0, Chinese and English, about 16 MB). The models are downloaded once and checked
  with SHA-256. The engine runs on this computer; the picture is sent only to the helper on 127.0.0.1. Install either in the
  Offline tab. The Tesseract engine and more languages are not added yet.
- **Listen in the Translator** uses an installed helper voice when the runtime and a voice for the language are installed (the Offline tab). Otherwise the computer's voices are used. Other parts of the extension do not use the helper's voices yet.
  Piper's phonemizer is espeak-ng (GPL-3.0). A licence review is needed before any release that ships the voices.

## Build from source

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run check          # validates manifests, JavaScript syntax, referenced files, and locales
npm run build          # Chromium (.zip, .crx) and Firefox (.zip, .xpi) in ./build
npm run build:chromium # only Chromium
npm run build:firefox  # only Firefox
npm run locales:check  # translators: missing messages and placeholder mismatches, per locale
```

The CRX is signed with the PEM key in the `CRX_PRIVATE_KEY` environment variable. Keep the same key for every release, so
the extension ID does not change. Without it, a new key is generated for each build.

## Release workflows

Releases are made by hand: Actions > Release > Run workflow. Pushing a tag does not publish anything (the workflow no longer
starts on tags). Choose `build-and-test` to build without publishing, or `build-and-release` to publish one GitHub release.
The version must match `manifest.json` (for example `9.8.1.0`). The release notes come from the matching section in `CHANGELOG.md`.

| Workflow | What it does |
| --- | --- |
| `release.yml` | Runs on a `v*` tag. Builds both packages, submits Firefox to AMO, and publishes the GitHub release with all files. |
| `chromium.yml` | Builds the Chromium ZIP and CRX. Also runs by hand from the Actions tab. |
| `firefox.yml` | Builds the Firefox ZIP and XPI. Turn on **submit** when you run it by hand to submit to AMO. |
| `update-check.yml` | Runs weekly and writes the update check to the run summary. |

Every build writes a summary to its run page (**Actions → run → Summary**): versions, file sizes, SHA-256 checksums,
lint output, and the AMO submission log. A failed AMO submission does not stop the GitHub release.

Store uploads (Chrome Web Store, Edge Add-ons, addons.mozilla.org) are described in `docs/store-publishing.md`.

Repository secrets used by the workflows (all optional):

- `CRX_PRIVATE_KEY`: PEM private key for the `.crx` signature. Keep it secret and back it up.
- `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`: addons.mozilla.org API credentials for signing the XPI.

### Keeping the version in sync

The version lives in five files: `manifest.json`, `firefox_manifest.json`, `package.json`, `package-lock.json`, and `tools/atlas-updater/Cargo.toml` (the helper). Cargo needs three numbers, so the fourth part is stored after a `+`: 0.0.2.1 is `0.0.2+1`.
The version badge at the top of this README shows the latest published release. The release workflow sets it, and the
daily README sync sets it when a release is made by hand. So it can show the previous version until a new release is
published. Set the files at once:

```bash
npm run version:sync -- 9.8.2.0   # writes every file; warns if CHANGELOG.md has no "## 9.8.2.0" section
npm run version:check             # prints each version and fails if they differ
```

`npm run check` runs the same comparison, so CI fails when the versions disagree. The release workflows use
`scripts/sync-version.mjs` too.

This fork has its own version numbers, starting at 0.0.1.0. The upstream project's releases do not change this version.

### Release secrets

The release workflows read these secrets. Add them in **Settings → Secrets and variables → Actions → New repository secret**
(or with the GitHub CLI, shown below). Never commit them, and never paste them into an issue or a chat.

| Secret | Needed for | Where the value comes from |
| --- | --- | --- |
| `CRX_PRIVATE_KEY` | Chromium `.crx` signing. **Required**: the Chromium workflow fails without it. | Generate it once (below). Keep a backup copy: losing it changes the extension ID for every user. |
| `AMO_JWT_ISSUER` | Signing the Firefox `.xpi` | addons.mozilla.org → **Developer Hub** → **Tools** → **Manage API Keys** (you need a Firefox Account). Use the *JWT issuer* value. |
| `AMO_JWT_SECRET` | Signing the Firefox `.xpi` | Same page: the *JWT secret* is shown once when you generate the key. |

Create the Chromium key (one time, on your own computer):

```bash
openssl genrsa -out atlas-translation-key.pem 2048
# Store it as a secret. The workflow reads the PEM text.
gh secret set CRX_PRIVATE_KEY < atlas-translation-key.pem
# Keep atlas-translation-key.pem in a password manager, then delete the local copy.
```

Store the Firefox keys the same way:

```bash
gh secret set AMO_JWT_ISSUER --body "<issuer value from AMO>"
gh secret set AMO_JWT_SECRET --body "<secret value from AMO>"
```

**Firefox has two listings, and each one has its own add-on ID. Both are published from the Release workflow.**

- **GitHub** (`unlisted`): the ID is `browser_specific_settings.gecko.id` in `firefox_manifest.json`. With `submit_amo` on, the `.xpi` is signed by Mozilla as an unlisted add-on, never listed, and the signed file is attached to the GitHub release.
- **Firefox store** (`listed`): the ID is `FIREFOX_STORE_ID` in `.github/workflows/firefox.yml`. The workflow removes `update_url` and sends the version to addons.mozilla.org through the API, using the `AMO_JWT_*` secrets. Mozilla reviews every version before it is public. The store add-on is separate, so GitHub users and store users never mix.

Steps:

1. Add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` as secrets (see *Release secrets* above).
2. Check the store listing text in `.github/amo-metadata.json`, then set the repository variable (or a secret) `AMO_LISTING_READY` to `true` (**Settings → Secrets and variables → Actions → Variables**). Until it is `true`, the store step is skipped, so no empty listing is sent.
3. Run **Release** with `action: build-and-release` and `submit_amo` on. The GitHub build is signed as an unlisted add-on. The store version is sent for review. The first store submission creates the add-on under the store ID.
4. Screenshots are the one step the API cannot do. Upload `store/screenshots/` once in the Developer Hub (**Manage listing → Screenshots**). Later versions keep them.
5. Bump the `version` in `manifest.json` and `firefox_manifest.json` before each tag. AMO rejects a version number that already exists.

Firefox signing also needs the add-on ID in `firefox_manifest.json` to belong to your AMO account. This fork uses its own ID, so
the first upload creates the add-on under your account. If you change the ID later, you must sign with the new one too.

### Edge Add-ons automatic submission

The release workflow can upload the Chromium package to your existing Edge listing and submit it for certification. It
runs in `.github/workflows/edge.yml`, after a release is published. Without these secrets the job is skipped.

| Secret | Where the value comes from |
| --- | --- |
| `EDGE_PRODUCT_ID` | The product ID (a GUID) on your extension's **Overview** page in Partner Center. It's in the address bar between `microsoftedge/` and `/packages`. |
| `EDGE_CLIENT_ID` | Partner Center → **Microsoft Edge** → **Publish API** → **Create API credentials**. |
| `EDGE_API_KEY` | The API key from the same page. It expires, so note the date and create a new one before then. |

Do the **first** submission by hand in Partner Center. The API can only update a listing that already exists. After that,
each release uploads the new package and submits it. Edge can take up to seven business days to certify an update. Certification
notes are set in the workflow. Keep the listing text and screenshots in Partner Center.

### Checking for updates

`npm run update:check` queries the GitHub API for the latest release of `loxdpsy/AT` and compares it with the version in
`manifest.json`. It checks the API rate limit first (`GET /rate_limit`, which does not use up the quota) and skips the lookups when
too few requests remain. Add `--upstream` to also check FilipePS's project. Set `GITHUB_TOKEN` to raise the limit from
60 to 5,000 requests per hour. The **Update check** workflow runs this every Monday and writes the result to the run summary.

## Translating the interface

### Helper window and tray

The helper's window and tray text are translated in `tools/atlas-updater/i18n/`, one JSON file per language, keyed by the
English text. Batches 1 to 8 cover 39 languages: Chinese (Simplified and Traditional), Hindi, Spanish, Arabic, French, Bengali, Portuguese (Brazil and Portugal), Russian, Japanese, Vietnamese, German, Korean, Turkish, Italian, Polish, Dutch, Ukrainian, Czech, Thai, Greek, Hebrew, Persian, Catalan, Danish, Finnish, Croatian, Hungarian, Romanian, Swedish, Norwegian, Serbian, Slovenian, Latvian, Icelandic, Afrikaans, Uyghur and Karakalpak. Santali has no translation yet and shows English. A string with no translation shows in
English. Check that a translation keeps its placeholders (`{}`); `tests/unit/helperI18n.test.mjs` runs that check.

### Extension

The interface strings live in `_locales/<language>/messages.json`, with English in `_locales/en`. To see what a
language still needs:

```bash
npm run locales:check            # one line per language
node scripts/check-locales.mjs pl --details    # the messages of one language, with each problem
```

The report lists:

- **missing**: a message that English has and the language does not. Chrome shows English for it.
- **extra**: a message the language has and English does not. The extension never uses it.
- **empty**: a message with no text.
- **placeholder**: a `$NAME$` or `$1` that differs from English. For example, a placeholder that is declared but not
  used, or a `$1` that is missing. Fix these first, because the text shows the placeholder name instead of the value.

Only placeholder, empty and extra problems fail `npm test`. Missing messages are normal while a language is being translated.

## Project layout

```
manifest.json            Chromium manifest (MV3, service worker)
firefox_manifest.json    Firefox manifest (MV3, background scripts)
service_worker.js        Chromium background entry point
lib/mv3-shims.js         Small shims that let the MV2-era code run on MV3
background/              Translation services, cache, text-to-speech, background logic
contentScript/           Page translation and selected-text UI
offscreen/               Offscreen audio player used by Chromium (MV3)
options/                 Settings page
popup/                   Toolbar popup
_locales/                Interface translations
scripts/                 Build, check, and update-check scripts
.github/workflows/       Release builds for Chromium and Firefox, and the weekly update check
```

## Security and privacy

The full privacy policy, written for store listings, is in [docs/privacy-policy.md](docs/privacy-policy.md).

**What leaves your browser.** Text is sent to a translation service only when you ask for a translation: a page, a
selection, or a word. The text goes to the service you chose in *Translations* (Google, Bing, Yandex, DeepL, Groq,
OpenRouter, or your own LibreTranslate server). Each service handles the text under its own privacy policy.

- DeepL keys are sent only to `api.deepl.com` or `api-free.deepl.com`.
- Groq keys are sent only to `api.groq.com`, and OpenRouter keys only to `openrouter.ai`.
- LibreTranslate requests go only to the server address you enter.
- The extension has no accounts, analytics, or telemetry. Nothing is sent to the project's authors.
- All code ships inside the package. The extension does not load code from the internet while it runs.

**What is stored.** Settings, your API keys, and the translation cache are kept in the browser's extension storage on
your computer. Clear the cache in *Storage*. Removing the extension deletes all of it.

**Permissions and why they are needed.**

- `<all_urls>`: to translate any page you open.
- `activeTab` and `contextMenus`: the toolbar button and the right-click menu.
- `storage`: settings and the cache.
- `webRequest`: reads each page's `Content-Type` header so PDFs can be recognised. It does not change or block requests.
- `offscreen` (Chromium only): plays text-to-speech audio.
- `webNavigation` (optional): asked for only when you turn on *Automatically translate when clicking a link*.

**Third-party helper sites.** *Translate PDF* opens websites run by others: `pdf.translatewebpages.org`,
`pdftohtml.translatewebpages.org`, and `onlinedoctranslator.com`. Files you upload there go to those sites, not through
this extension. Do not upload confidential documents to them.

**Keys.** Anyone who has your DeepL key can use your quota. If a key leaks, revoke it in your DeepL account and create a new
one.

**Updates.** The update checker (`scripts/check-update.mjs`) and the Update check workflow run on GitHub, not in your
browser. They call the GitHub API and nothing else.

**Reporting a security problem.** Please do not open a public issue. Use GitHub's private vulnerability reporting
(**Security** tab → **Report a vulnerability**). If that option is not turned on for the repository yet, ask the maintainer
for a private way to report it.

## Logo

The icon is the Atlas Translation mark: a blue card with the white Atlas mark, and a grey card with the translate symbol. While a page is translated, the blue side of the icon is used for the toolbar and the popup.

The icon sources are `icons/icon.svg` and `icons/icon-translated.svg`. The PNG sizes in `icons/` and `store/store-logo-300.png` are rendered from them.

## Notes and limits

- Translation services are external. Google, Bing, Yandex, DeepL, and LibreTranslate have their own terms and limits. DeepL and LibreTranslate need your own key or server.
- Yandex reads a short-lived session id from a public page. If Yandex changes that page, the service stops until the code is updated.
- Fallback between services is per browser and resets when the browser restarts the extension. The popup still shows the service you chose, even when another one translated the page. Only the enabled services are used as fallbacks.
- Text-to-speech needs an audio-capable context. Chromium uses an offscreen document (Chromium 109+). Firefox plays directly.

## License

Atlas Translation is licensed under the **Mozilla Public License 2.0**. See [LICENSE](LICENSE). The original TWP project is
also MPL-2.0 and is credited in [NOTICE.md](NOTICE.md).
