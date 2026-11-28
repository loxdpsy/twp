// Writes the download part of a GitHub release's notes, and SHA256SUMS.txt for every file in the release.
// Usage: node scripts/release-downloads.mjs --dist dist --version 0.0.2.7 --repo owner/name [--store-submitted true|false]
// The notes go to stdout. The checksum file is written to <dist>/SHA256SUMS.txt, so the release step uploads it
// with the other files (it uses dist/*). A file that is not recognised still gets a checksum, under "Other files".
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

// Platforms the release does not build yet. They are named in the table, so nobody looks for them in vain.
export const NOT_BUILT_YET = {
  Windows: "Windows ARM64 (Snapdragon and other ARM PCs) is not built yet. The offline engine has no ARM64 version yet.",
  Linux: "Linux ARM64 (Raspberry Pi 5 and ARM servers) is not built yet, and so are the .deb and .rpm packages.",
};

const GROUP_ORDER = ["Windows", "macOS", "Linux", "Browser extension", "Other files"];

// The first rule that matches a file name gives its group, its short label (the table link) and a description
// (shown under the file in the list).
const RULES = [
  [/^atlas-updater-windows-setup\.exe$/, "Windows", "Setup (installer), x64",
    "For 64-bit Intel and AMD Windows PCs. It installs for your user account and includes the offline engine."],
  [/^atlas-updater-windows\.exe$/, "Windows", "Portable, x64",
    "A single program with no installer and no offline engine. Use the setup file unless you need a portable copy."],
  [/^atlas-updater-macos\.dmg$/, "macOS", "DMG, Apple Silicon",
    "For Macs with an M-series chip (M1 and later). The offline engine runs through Rosetta 2, which macOS offers to install the first time."],
  [/^atlas-updater-macos-intel\.dmg$/, "macOS", "DMG, Intel",
    "For Intel-based Macs (macOS 11 or later). The offline engine runs natively."],
  [/^atlas-updater-linux\.AppImage$/, "Linux", "AppImage, x64",
    "For 64-bit Intel and AMD Linux. One file with the helper and the offline engine. Run chmod +x on it first."],
  [/-chromium\.crx$/, "Browser extension", "Chromium: self-hosted package (.crx, Chromium 109 or newer)",
    "For installing the extension yourself in Chromium 109 or newer, outside the Chrome Web Store."],
  [/-chromium\.zip$/, "Browser extension", "Chrome Web Store package (.zip)",
    "The package for the Chrome Web Store upload."],
  [/-edge\.zip$/, "Browser extension", "Microsoft Edge Add-ons package (.zip)",
    "The same package as Chromium, for the Microsoft Edge Add-ons store."],
  [/-firefox-signed\.xpi$/, "Browser extension", "Firefox: signed add-on (.xpi), self-hosted",
    "Signed by Mozilla. Firefox installs it from this link and updates it from updates.json."],
  [/-firefox\.xpi$/, "Browser extension", "Firefox: unsigned add-on (.xpi)",
    "Not signed. Firefox will not install it."],
  [/-firefox\.zip$/, "Browser extension", "Firefox: add-on files (.zip)",
    "The unpacked add-on files, for developers."],
  [/^updates\.json$/, "Browser extension", "Firefox update manifest (updates.json)",
    "Tells self-hosted Firefox installs where the latest signed add-on is."],
];

export function describe(name) {
  for (const [pattern, group, label, description] of RULES) {
    if (pattern.test(name)) return { group, label, description };
  }
  return { group: "Other files", label: "File", description: "Not recognised by the release script. Check it before you rely on it." };
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sizeText(bytes) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

// Reads every file in the folder (except an older SHA256SUMS.txt) and returns the release's files, sorted by name.
export function releaseFiles(dist) {
  return readdirSync(dist)
    .filter(name => name !== "SHA256SUMS.txt" && statSync(path.join(dist, name)).isFile())
    .sort()
    .map(name => {
      const bytes = readFileSync(path.join(dist, name));
      return { name, bytes: bytes.length, sha256: sha256(bytes), ...describe(name) };
    });
}

// The checksum file in the format of `sha256sum`: "<hash>  <name>", one file per line.
export function checksumText(files) {
  return files.map(f => `${f.sha256}  ${f.name}`).join("\n") + "\n";
}

// The Downloads part of the release notes (Markdown).
export function downloadsMarkdown(files, { version, repo, storeSubmitted }) {
  const base = `https://github.com/${repo}/releases/download/v${version}`;
  const link = f => `[${f.label}](${base}/${encodeURIComponent(f.name)})`;
  const lines = [];
  lines.push("## Download based on your OS", "");
  lines.push("| OS | Download |", "| --- | --- |");
  for (const group of ["Windows", "macOS", "Linux"]) {
    const items = files.filter(f => f.group === group).map(link);
    const cell = [...items, NOT_BUILT_YET[group]].filter(Boolean).join(" · ");
    lines.push(`| ${group} | ${cell} |`);
  }
  lines.push("| Android | Not in this release. The helper is a desktop program, and Chrome for Android does not run extensions. Firefox for Android installs Atlas Translation from addons.mozilla.org. |");
  const browser = files.filter(f => f.group === "Browser extension").map(link);
  lines.push(`| Browser extension | ${browser.length ? browser.join(" · ") : "No package in this release."} |`);
  lines.push("");

  lines.push("## Files and SHA-256", "");
  for (const group of GROUP_ORDER) {
    const items = files.filter(f => f.group === group);
    if (!items.length) continue;
    lines.push(`**${group}**`, "");
    for (const f of items) {
      lines.push(`- [**${f.name}**](${base}/${encodeURIComponent(f.name)}): ${f.label}, ${sizeText(f.bytes)}  `);
      if (f.description) lines.push(`  ${f.description}  `);
      lines.push(`  \`sha256:${f.sha256}\``);
    }
    lines.push("");
  }
  lines.push(`All checksums: [SHA256SUMS.txt](${base}/SHA256SUMS.txt). On Linux or macOS, run \`sha256sum -c SHA256SUMS.txt\` in the download folder. On Windows, run \`certutil -hashfile <file> SHA256\` and compare the value with the list above.`, "");

  lines.push("## Stores", "");
  lines.push("- **Chrome Web Store:** upload `atlas-translation-" + version + "-chromium.zip`.");
  lines.push("- **Microsoft Edge Add-ons:** the same package as Chromium, submitted automatically when the Edge secrets are set.");
  if (files.some(f => /-firefox-signed\.xpi$/.test(f.name))) {
    lines.push("- **Firefox, self-hosted:** the signed `.xpi` opens in Firefox. Firefox then updates it from `updates.json` in this release. Firefox for Android installs from addons.mozilla.org only.");
  } else {
    lines.push("- **Firefox:** install from addons.mozilla.org. This release has no signed `.xpi`, so self-hosted installs and updates are not available for it.");
  }
  lines.push(storeSubmitted
    ? "- **Firefox store:** submitted to addons.mozilla.org for review with this release. It appears in the store after Mozilla approves it. The store file is not attached here."
    : "- **Firefox store:** not submitted in this run. The store file is not attached to the release.");
  lines.push("");

  lines.push("## Helper (atlas-updater)", "");
  lines.push("The helper installs the extension, the offline engine and the language packs. The Windows setup file, the Linux AppImage and both macOS disk images include the offline engine. The portable Windows program does not, so use the setup file. Android is not supported: the helper is a desktop program. See tools/atlas-updater/README.md.", "");
  return lines.join("\n");
}

// Does the whole job for one release folder. Returns the Markdown and the checksum text, and writes SHA256SUMS.txt.
export function buildRelease(dist, options) {
  const files = releaseFiles(dist);
  const sums = checksumText(files);
  writeFileSync(path.join(dist, "SHA256SUMS.txt"), sums);
  return { markdown: downloadsMarkdown(files, options), sums, files };
}

function argValue(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const dist = argValue(args, "--dist") ?? "dist";
  const version = argValue(args, "--version");
  const repo = argValue(args, "--repo");
  if (!version || !repo) {
    console.error("usage: release-downloads.mjs --dist <folder> --version <version> --repo <owner/name> [--store-submitted true|false]");
    process.exit(2);
  }
  const { markdown } = buildRelease(dist, {
    version,
    repo,
    storeSubmitted: argValue(args, "--store-submitted") === "true",
  });
  process.stdout.write(markdown);
}
