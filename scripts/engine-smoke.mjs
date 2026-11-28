// Checks a built atlas-engine with a real language pack: downloads the English to French pack from the catalogue
// (tools/atlas-updater/src/packs.json), checks every file's size and SHA-256, starts the engine, and translates two
// sentences. Fails when the download is wrong or the reply does not look like French.
// With a second path (the atlas-engine-check program built with the library), the same pack is also translated
// through the library, and the two sentences are checked the same way.
// Usage: node scripts/engine-smoke.mjs <path to atlas-engine> [path to atlas-engine-check]
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = process.argv[2];
const checker = process.argv[3];
if (!engine) {
  console.error("Usage: node scripts/engine-smoke.mjs <path to atlas-engine> [path to atlas-engine-check]");
  process.exit(2);
}
const catalogue = JSON.parse(await readFile(path.join(root, "tools", "atlas-updater", "src", "packs.json"), "utf8"));
const pack = catalogue.packs.find(p => p.pair === "enfr");
if (!pack) throw new Error("the catalogue has no English to French pack");

const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-engine-smoke-"));
// ATLAS_FP32_MODEL_URL: a float32 model (the .npz of a training run) replaces the int8 model of the pack. It is not in
// the catalogue yet, so its size and SHA-256 are printed instead of checked. This is the ARM build's test.
const fp32Url = process.env.ATLAS_FP32_MODEL_URL || "";
const files = fp32Url
  ? [{ name: "model.enfr.npz", url: fp32Url, size: null, sha256: null },
     ...pack.files.filter(f => !f.name.startsWith("model."))]
  : pack.files;
// Every file is tried, so the log shows which ones the download host refuses, not only the first.
const refused = [];
for (const file of files) {
  const response = await fetch(file.url, { redirect: "follow" });
  if (!response.ok) {
    refused.push(`${file.name}: HTTP ${response.status} from ${response.url}`);
    console.log(`  FAIL  ${file.name}: HTTP ${response.status}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (file.size == null) {
    console.log(`  info  ${file.name}: ${bytes.length} bytes, SHA-256 ${sha} (not in the catalogue)`);
  } else {
    if (bytes.length !== file.size) throw new Error(`${file.name}: size ${bytes.length}, catalogue says ${file.size}`);
    if (sha !== file.sha256) throw new Error(`${file.name}: SHA-256 ${sha}, catalogue says ${file.sha256}`);
    console.log(`  ok    ${file.name} (${bytes.length} bytes, SHA-256 checked)`);
  }
  await writeFile(path.join(dir, file.name), bytes);
}
if (refused.length) throw new Error(`download failed for ${refused.length} file(s):\n  ${refused.join("\n  ")}`);

const child = spawn(engine, [dir], { stdio: ["pipe", "pipe", "inherit"] });
const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const withTimeout = (promise, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out: ${what}`)), 240000))]);
// The engine's exit code and signal, so a crash shows in the log (a crash prints nothing of its own).
async function exitStatus() {
  if (child.exitCode !== null || child.signalCode !== null) return `code ${child.exitCode}, signal ${child.signalCode}`;
  const exited = await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000, null))]);
  if (exited) return `code ${exited[0]}, signal ${exited[1]}`;
  return `still running (code ${child.exitCode}, signal ${child.signalCode})`;
}
const ready = await withTimeout(lines.next(), "waiting for the engine to load the model");
if (ready.value !== "ready") {
  const status = await exitStatus();
  throw new Error(`engine did not say ready (${status}): ${ready.value ?? "no reply"}`);
}
console.log("  ok    engine loaded the English to French model");

const sentences = ["Hello, how are you today?", "The weather is very nice in the park."];
const translations = [];
for (const sentence of sentences) {
  child.stdin.write(Buffer.from(sentence, "utf8").toString("base64") + "\n");
  const reply = await withTimeout(lines.next(), "waiting for a translation");
  if (reply.done) {
    throw new Error(`the engine stopped before it translated "${sentence}" (${await exitStatus()})`);
  }
  const text = Buffer.from(reply.value, "base64").toString("utf8");
  translations.push(text);
  console.log(`  ok    "${sentence}" -> "${text}"`);
}
child.stdin.end();
child.kill();

const frenchHints = /\b(bonjour|comment|aujourd|temps|est|vous|le|la|parc|très|beau)\b/i;
for (const text of translations) {
  if (!text.trim() || !frenchHints.test(text)) throw new Error(`the translation does not look like French: "${text}"`);
}

if (checker) {
  // The library: the same pack, loaded and translated in the checker's own process.
  for (const sentence of sentences) {
    const { stdout } = await promisify(execFile)(checker, [dir, sentence], { timeout: 240000, maxBuffer: 1 << 20 });
    const text = stdout.trim();
    if (!text || !frenchHints.test(text)) throw new Error(`the library translation does not look like French: "${text}"`);
    console.log(`  ok    library: "${sentence}" -> "${text}"`);
  }
}
console.log("Engine smoke test passed.");
