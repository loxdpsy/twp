# atlas-updater

A small helper that installs the newest Atlas Translation release into the unpacked copy of the extension
(the copy you load with "Load unpacked" after unzipping the GitHub release).

Chrome, Edge and Brave never update an unpacked copy by themselves. This helper does the copy step:

1. Asks GitHub for the latest release.
2. If it is newer than the copy in your folder, downloads the Chromium zip.
3. Checks the zip against the SHA-256 that GitHub publishes for it. A mismatch changes nothing.
4. Copies the new files over your folder. Nothing is deleted.

Then, in the browser, open Atlas Translation's Settings and click **Reload extension** (Updates section).

## Get the program

**Windows: the installer.** `atlas-updater-windows-setup.exe` installs Atlas Helper like most apps do. It asks no
administrator password: it installs for your user account, in `%LOCALAPPDATA%\Programs\Atlas Helper`. It adds a Start
menu entry, and it can add a desktop shortcut and a start-at-sign-in shortcut (both are checkboxes). The shortcut lives in your Startup folder, and Windows Settings, under Apps, then Startup, can turn it off. The helper does not write to the Windows startup registry. Uninstall it from
Windows Settings, under Apps.

**macOS: the disk image.** `atlas-updater-macos.dmg` is for Apple Silicon Macs, and `atlas-updater-macos-intel.dmg` is for Intel
Macs (Apple menu, About This Mac, shows Chip or Processor). It opens a window with Atlas Helper and the Applications folder. Drag
Atlas Helper into Applications, then open it. The offline engine is inside the app, so there is nothing else to install. The
app is not signed by Apple yet: the first time, right-click Atlas Helper, choose **Open**, and confirm. If macOS still says
the app is damaged, run `xattr -dr com.apple.quarantine "/Applications/Atlas Helper.app"` once in Terminal.

**Linux: the AppImage.** `atlas-updater-linux.AppImage` is one file that holds the helper and the offline engine. Make it
runnable with `chmod +x atlas-updater-linux.AppImage`, then start it. Nothing is installed on the system. Start-at-login and
the browser connection use the AppImage file itself, so keep the file where you put it.

Every release also attaches `atlas-updater-windows.exe` (a portable copy: it installs nothing, has no Start menu entry, has
no engine, and Task Manager shows the file name you downloaded). The release has no separate engine files: the setup file,
the AppImage and the disk image each include the engine. Between releases, each build is an artifact of the **Updater**
workflow run in GitHub Actions (Actions tab, then the newest run).

The programs and the installers are not code-signed yet. Windows shows "Unknown publisher" (choose **More info**, then
**Run anyway**). macOS asks for the right-click step above. Signing is the lasting fix.

## Use

**Settings.** Look: the theme (system, light or dark), the colour (blue, teal, green, violet or orange), the language
and the text size. The language sets the layout direction (right to left for Arabic, Hebrew, Persian and Urdu); the helper's
text stays English until it is translated.

**The helper window.** Start the program with no arguments (double-click it on Windows, or run `./atlas-updater-macos`
or `./atlas-updater-linux` from a terminal). The helper opens its own native window (drawn with egui, not a browser page), and puts an icon in the
tray (Windows and Linux) or the menu bar (macOS). Closing the window keeps the helper in the tray; **Quit helper** stops it.
When you start it at sign-in, it starts in the tray with no window. It checks GitHub for a new version, then shows:

- **Update:** shows the version you have and the newest release, and installs the update in one click.
- **Folder:** where the extension lives. A new folder (empty or missing) gets a fresh copy.
- **Which browser?** The helper lists the browsers that the system lists for web addresses (Windows default apps, applications on macOS, desktop entries on Linux). Firefox links to the Add-ons store. Every other browser (Chrome, Edge, Brave, Opera, Vivaldi, Comet and any other Chromium-based browser) gets the extensions page and the Load unpacked steps. Chromium browsers do not let an app install an extension by itself, so the last step is always yours. Safari and Internet Explorer are not supported.

- **Offline translation:** installs the offline engine, installs or
  removes language packs. A pack is one language pair, such as English to French, from Mozilla's translation models
  (the base models where Mozilla has them, otherwise the tiny ones). The files come from Firefox's Remote Settings. The engine is Mozilla's Bergamot engine, built by the Engine workflow and attached to each release as
  `atlas-engine-windows.exe`, `atlas-engine-macos` or `atlas-engine-linux`. See "Offline translation" below.

- **Start at login:** starts the helper in the tray when you log in, with no window. On Windows the entry is a shortcut in your
  Startup folder, made by the installer. On macOS it is a LaunchAgent, and on Linux an autostart file.

The window is a native app: it opens no web page and listens on no network port. Only the offline service listens, on
`127.0.0.1:47632`, for extension pages (see "Offline translation").
Closing the window keeps the helper in the tray. Choose **Quit** in the tray menu to stop it. `--serve` starts the
helper in the tray only, with no window, and clicking the tray icon opens the window.

**Command line** (for scripts):

```
atlas-updater --check "C:\path\to\atlas-translation"    # Windows: only report
atlas-updater "C:\path\to\atlas-translation"            # Windows: install
atlas-updater --check ~/atlas-translation               # macOS and Linux
```

The folder is the one that holds `manifest.json` of the unpacked extension. The program refuses any other folder (the window
only makes a new folder when it is empty or missing).

The helper downloads and unzips the release itself. It needs no PowerShell, curl, unzip or other program, and it opens no
command window on Windows.

## Offline translation

The helper can translate text on this computer, so the extension does not send it to a web service. The extension
uses it as the service named **Offline (desktop helper)**.

1. The engine is already inside the program you installed (the setup file on Windows, the disk image on macOS, the AppImage on
   Linux), so there is nothing to install.
2. Install one or more language packs. Each pack is about 37 MB. Type a language name or code in the search box (for
   example `German` or `de`), or tick **Installed only**. Installed packs are listed first. A pack is downloaded from
   the catalogue in the program, checked against its SHA-256, and only then kept. A file that fails the check is removed, and nothing is
   left behind.
   To install many at once, choose a language under **Install many packs** ("Translate to") and then **Install all to
   <language>**, or **Install all packs**. The window shows the total size first, and the packs install one after another.
3. In the extension's options, under Translation services, turn on Offline (desktop helper) and choose **Bind this
   browser**. The helper window asks you to allow it (Allow or Deny). Nothing is sent until you allow it.

The engine and the packs are kept in the data folder of the helper: `%LOCALAPPDATA%\AtlasTranslation` on Windows,
`~/Library/Application Support/AtlasTranslation` on macOS, and `~/.local/share/AtlasTranslation` on Linux. Updating
the extension does not remove them.

While the helper is running, it answers translation requests on `127.0.0.1:47632`. It accepts only requests from the
extension (its origin must be `chrome-extension://` or `moz-extension://`), and only with a token. The helper gives the
token once, when you allow a bind; it keeps only a SHA-256 hash of it, in `bindings.json` in the data folder. Each
binding is listed under **Connections** in the helper window, and removing it refuses that browser from then on. A
missing pack, or a language pair the packs do not cover, makes the extension use its next enabled service.

Mozilla's packs translate between English and one other language, so a pair such as French to German is not
available offline.

## If Windows Defender warns about the helper

Windows Defender sometimes flags a new, unsigned program with a machine-learning guess. The name ends in `!ml`, for
example `Trojan:Win32/Bearfoos.A!ml`. That is a guess, not a confirmed virus. Before you allow the file:

1. Check its SHA-256 against the release. In PowerShell, run `Get-FileHash -Algorithm SHA256 "<path to the file>"`.
   Compare the value with the `digest` of the same file on the release page. If the values differ, do not run the
   file. Download it again from the release.
2. If they match, open Windows Security, go to Virus & threat protection, then Protection history, and choose
   **Allow on device** for that file only. Do not turn off Defender, and do not exclude a whole folder.
3. Report the file to Microsoft as a false positive at https://www.microsoft.com/en-us/wdsi/filesubmission
   (choose *Software developer*, then *Incorrectly detected*).

The digests of the release files can also be read with GitHub's command line tool:

```
gh api repos/loxdpsy/AT/releases/latest --jq '.assets[] | [.name, .digest]'
```

Signing the program with a code-signing certificate is the lasting fix. It is not in place yet: the certificate has to be
bought from a certificate authority, and until then Windows and Defender judge each new file on its own record.

What the helper does not do, which is what keeps the file's behaviour simple to check:

- It does not run a program it downloaded on Windows. The offline engine is in the setup file, next to the helper.
- It does not run PowerShell, cmd, curl or unzip, and it opens no command window.
- Its only writes to the registry are the browser entries described under "Windows: every detail" below.
- It contains no analytics or telemetry code.

## Windows: every detail

This section lists everything the installer and the helper do on Windows.

**Installing.** `atlas-updater-windows-setup.exe` is an Inno Setup installer. It runs for your user account only, so it never
asks for an administrator password. It shows a folder page (the default is `%LOCALAPPDATA%\Programs\Atlas Helper`, and you
can choose another folder). It then:

- copies `atlas-updater.exe` (the helper), `atlas-engine.exe` (the offline engine) and `atlas_engine.dll` (the engine
  library) into the folder, with an uninstaller (`unins000.exe`) and the icon;
- adds a Start menu group, **Atlas Helper**, with the helper and an uninstall shortcut;
- optionally adds a desktop shortcut;
- optionally adds a Startup shortcut, `Atlas Helper.lnk`, in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`,
  so the helper starts in the tray when you sign in;
- adds an entry under Windows Settings, Apps, which Inno Setup writes under your user account;
- removes an old sign-in entry from an earlier version, the Run value `AtlasTranslationHelper` under
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
- removes copies of the engine that an earlier version had downloaded to `%LOCALAPPDATA%\AtlasTranslation\engine`.

The installer starts no service, adds no scheduled task, installs no driver, and downloads nothing.

**Running.** The helper is a native window with a tray icon. It stores its settings in `%LOCALAPPDATA%\AtlasTranslation`:
`settings.txt`, `bindings.json` (the browsers allowed to connect, with a SHA-256 hash of each token, never the token itself),
the language packs and the native-host manifests. It listens on `127.0.0.1:47632` only, and only for the extension.
It uses the network for these, and nothing else:

- `api.github.com` and `github.com`: to check for a new release, and to download the newest extension when you click
  **Update**. Each download is checked against its SHA-256.
- `firefox-settings-attachments.cdn.mozilla.net`: to download a language pack when you install it. Each file is checked
  against its SHA-256 in the program's catalogue, and a file that fails is removed.
- The add-ons page of Firefox opens in your browser only when you click the link.

**Browser connection (the registry).** When you allow a browser to connect (**Allow** in the helper window), the helper
writes one default value in each of these keys, so the browser can find the native host. The value is the path of a
manifest file in `%LOCALAPPDATA%\AtlasTranslation\native-host`:

- `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.atlas.helper`
- `HKCU\Software\Chromium\NativeMessagingHosts\com.atlas.helper`
- `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.atlas.helper`
- `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.atlas.helper`
- `HKCU\Software\Vivaldi\NativeMessagingHosts\com.atlas.helper`
- `HKCU\Software\Mozilla\NativeMessagingHosts\com.atlas.helper` (Firefox)

These keys are for your user account only. Removing a binding in the helper window does **not** delete them, and neither
does uninstalling the helper. To remove them, delete the keys above in Registry Editor (`regedit`). Without them the browser
simply cannot start the helper.

**Starting with the browser.** If you turn on "Start the helper when the browser starts" in the extension's Options, the
extension asks the helper, through that native host, to start in the tray. The setting is kept by the helper.

**Uninstalling.** Choose Atlas Helper under Windows Settings, Apps. The uninstaller removes the program files, the Start
menu and desktop shortcuts, and the Startup shortcut. It keeps your settings and language packs in
`%LOCALAPPDATA%\AtlasTranslation`, and it does not remove the registry keys above. Delete that folder and those keys too
if you want nothing left behind.

**Not signed yet.** The installer and the programs are not code-signed (see the Defender section). Windows may show
"Unknown publisher" when you run the installer.

## Build from source

## Build from source

```
cd tools/atlas-updater
cargo test
cargo build --release
```

It needs Rust 1.92 or later. The window uses `eframe` (egui, with the OpenGL backend) and the tray icon uses
`tray-icon`. The window and the tray icon use the logo in `icons/atlas-logo.png`. No web view or GTK library is needed.
