// Packs Atlas Translation for Chromium (ZIP + CRX) and Firefox (ZIP + XPI).
//
//   node scripts/build.mjs all          # both targets (default)
//   node scripts/build.mjs chromium     # build/atlas-translation-<version>-chromium.{zip,crx}
//   node scripts/build.mjs firefox      # build/atlas-translation-<version>-firefox.{zip,xpi}
//
// CRX signing key: set CRX_PRIVATE_KEY to the PEM text of your key (keep it in a secret).
// The same key keeps the extension ID stable between releases. Without it, a new key is
// generated for this build and the extension ID changes.
import { cp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import crx3 from "crx3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const target = process.argv[2] ?? "all";
if (!["all", "chromium", "firefox"].includes(target)) {
  console.error(`Unknown target "${target}". Use all, chromium or firefox.`);
  process.exit(1);
}

// Files and folders that ship inside the extension. Everything else (tests, scripts, CI,
// the original build helpers) stays out of the package.
const SHIPPED = [
  "_locales",
  "background",
  "contentScript",
  "icons",
  "lib",
  "offscreen",
  "onboarding",
  "options",
  "popup",
  "translator",
  "w3css",
  "LICENSE",
  "NOTICE.md"
];
const EXCLUDED_NAMES = new Set([".DS_Store", "Thumbs.db"]);

const manifestChromium = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const version = manifestChromium.version;
const name = "atlas-translation";

function log(message) {
  console.log(`[build] ${message}`);
}

async function runCheck() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "check.mjs")], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("[build] Checks failed. Nothing was packed.");
    process.exit(1);
  }
}

// Copies the shipped files into build/staging/<target>. `extra` adds target-specific files.
async function stage(targetName, manifestSource, extra = []) {
  const dir = path.join(buildDir, "staging", targetName);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const entry of [...SHIPPED, ...extra]) {
    const from = path.join(root, entry);
    const to = path.join(dir, entry);
    try {
      await cp(from, to, {
        recursive: true,
        filter: src => {
          const base = path.basename(src);
          return !EXCLUDED_NAMES.has(base) && !base.endsWith(".map") && !base.startsWith(".");
        }
      });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  await copyFile(path.join(root, manifestSource), path.join(dir, "manifest.json"));
  return dir;
}

// Zip with the staged folder as the root (what Firefox and Chromium expect).
function zipDirectory(dir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.on("warning", reject);
    archive.pipe(output);
    archive.directory(dir, false);
    archive.finalize();
  });
}

// The "key" field makes an unpacked copy (the zip) get the same extension ID as the signed CRX. Chrome and Edge
// only accept a native messaging connection from a known ID, so the ID must not depend on the folder name.
// Only the public half goes into the manifest. The private key stays in the signing file.
function publicKeyManifestValue(privateKeyPem) {
  const spki = createPublicKey(privateKeyPem).export({ type: "spki", format: "der" });
  const id = createHash("sha256").update(spki).digest().subarray(0, 16);
  const extensionId = [...id].map(b => String.fromCharCode(97 + (b >> 4), 97 + (b & 15))).join("");
  return { key: spki.toString("base64"), extensionId };
}

async function buildChromium() {
  log("Chromium: staging files");
  const dir = await stage("chromium", "manifest.json", ["service_worker.js"]);
  const crxPath = path.join(buildDir, `${name}-${version}-chromium.crx`);
  const keyPath = path.join(buildDir, `${name}-signing-key.pem`);
  if (process.env.CRX_PRIVATE_KEY) {
    const pem = process.env.CRX_PRIVATE_KEY.replace(/\\n/g, "\n");
    await writeFile(keyPath, pem, { mode: 0o600 });
    const { key, extensionId } = publicKeyManifestValue(pem);
    const manifestPath = path.join(dir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.key = key;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    log(`Chromium: using CRX_PRIVATE_KEY, extension ID ${extensionId} (the same in the zip and the CRX)`);
  } else if (process.env.GITHUB_ACTIONS === "true") {
    // A random key on every CI run would give each release a different extension ID.
    throw new Error("CRX_PRIVATE_KEY secret is missing. Add it in Settings > Secrets and variables > Actions (see README, 'Release secrets').");
  } else {
    await rm(keyPath, { force: true });
    log("Chromium: CRX_PRIVATE_KEY not set, a new key is generated (the extension ID will change)");
  }
  const zipPath = path.join(buildDir, `${name}-${version}-chromium.zip`);
  await zipDirectory(dir, zipPath);
  log(`Chromium: wrote ${path.relative(root, zipPath)}`);
  await crx3([path.join(dir, "manifest.json")], { keyPath, crxPath });
  log(`Chromium: wrote ${path.relative(root, crxPath)}`);
}

async function buildFirefox() {
  log("Firefox: staging files");
  const dir = await stage("firefox", "firefox_manifest.json");
  const zipPath = path.join(buildDir, `${name}-${version}-firefox.zip`);
  const xpiPath = path.join(buildDir, `${name}-${version}-firefox.xpi`);
  await zipDirectory(dir, zipPath);
  await copyFile(zipPath, xpiPath);
  log(`Firefox: wrote ${path.relative(root, zipPath)} and ${path.relative(root, xpiPath)}`);
}

await runCheck();
await mkdir(buildDir, { recursive: true });
if (target === "all" || target === "chromium") await buildChromium();
if (target === "all" || target === "firefox") await buildFirefox();
// build/staging is kept on purpose: web-ext lint/sign read the Firefox folder from there.
log("done");
