// The release notes' download table and SHA256SUMS.txt, made from the files of a release folder.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRelease, describe } from "../../scripts/release-downloads.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "release-downloads-"));
const files = {
  "atlas-updater-windows-setup.exe": "setup",
  "atlas-updater-windows.exe": "portable",
  "atlas-updater-macos.dmg": "dmg",
  "atlas-updater-macos-intel.dmg": "intel",
  "atlas-updater-linux.AppImage": "appimage",
  "atlas-translation-9.9.9-chromium.zip": "chromium",
  "atlas-translation-9.9.9-edge.zip": "edge",
  "atlas-translation-9.9.9-firefox-signed.xpi": "signed",
  "updates.json": "{}",
  "something-new.bin": "unknown",
};
for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
writeFileSync(path.join(dir, "SHA256SUMS.txt"), "stale\n");

try {
  const { markdown, sums, files: found } = buildRelease(dir, { version: "9.9.9", repo: "owner/repo", storeSubmitted: false });

  // Every file has a checksum that matches the file, in sha256sum format, and the old sums file is not listed.
  assert.equal(found.length, Object.keys(files).length);
  for (const [name, text] of Object.entries(files)) {
    const hash = createHash("sha256").update(text).digest("hex");
    assert.ok(sums.includes(`${hash}  ${name}\n`), `missing checksum for ${name}`);
  }
  assert.ok(!sums.includes("stale"), "the old SHA256SUMS.txt is not listed");
  assert.equal(readFileSync(path.join(dir, "SHA256SUMS.txt"), "utf8"), sums, "the file is written");

  // The table has the OS rows, the platforms not built yet, and the Android line.
  assert.match(markdown, /\| Windows \| \[Setup \(installer\), x64\]\(https:\/\/github\.com\/owner\/repo\/releases\/download\/v9\.9\.9\/atlas-updater-windows-setup\.exe\)/);
  assert.match(markdown, /Windows ARM64 \(Snapdragon and other ARM PCs\) is not built yet\./);
  assert.doesNotMatch(markdown, /Intel Macs are not built yet/);
  assert.match(markdown, /\[DMG, Intel\]\(https:\/\/github\.com\/owner\/repo\/releases\/download\/v9\.9\.9\/atlas-updater-macos-intel\.dmg\)/);
  assert.match(markdown, /\| macOS \|/);
  assert.match(markdown, /Linux ARM64 \(Raspberry Pi 5 and ARM servers\) is not built yet, and so are the \.deb and \.rpm packages\./);
  assert.match(markdown, /\| Android \| Not in this release/);
  assert.match(markdown, /\*\*Other files\*\*/, "an unknown file is listed, not dropped");
  assert.match(markdown, /something-new\.bin/);
  assert.match(markdown, /sha256sum -c SHA256SUMS\.txt/);
  assert.match(markdown, /Firefox, self-hosted/);

  // A release without a signed Firefox add-on says so.
  rmSync(path.join(dir, "atlas-translation-9.9.9-firefox-signed.xpi"));
  const plain = buildRelease(dir, { version: "9.9.9", repo: "owner/repo", storeSubmitted: true }).markdown;
  assert.match(plain, /no signed `\.xpi`/);
  assert.match(plain, /submitted to addons\.mozilla\.org for review/);

  assert.equal(describe("atlas-updater-macos.dmg").group, "macOS");
  assert.equal(describe("atlas-updater-macos-intel.dmg").group, "macOS");
  assert.equal(describe("atlas-updater-macos-intel.dmg").label, "DMG, Intel");
  assert.match(describe("atlas-updater-macos.dmg").description, /Rosetta 2/, "the Apple Silicon file says how its engine runs");
  assert.match(markdown, /For Intel-based Macs/, "each file has its description in the list");
  assert.equal(describe("x.txt").group, "Other files");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("release downloads: table and checksums ok");
