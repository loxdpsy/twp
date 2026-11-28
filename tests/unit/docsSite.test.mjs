// The GitHub Pages site in docs/ (published from main, /docs): its pages, links and images, and the web page address
// that the helper's About tab and the README use. Pages turns docs/privacy-policy.md into privacy-policy.html, so a
// link to the .html name is accepted when the .md source exists.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../..", import.meta.url).pathname;
const docs = join(root, "docs");
const pageUrl = "https://loxdpsy.github.io/AT/";
const html = readFileSync(join(docs, "index.html"), "utf8");

function attrs(tag, name) {
  return [...html.matchAll(new RegExp(`<[a-zA-Z]+[^>]*\\s${name}="([^"]*)"`, "g"))].map((m) => m[1]);
}

function resolvesLocally(target) {
  const path = target.split("#")[0].split("?")[0];
  if (path === "") return true;
  if (existsSync(join(docs, path))) return true;
  if (path.endsWith(".html") && existsSync(join(docs, path.replace(/\.html$/, ".md")))) return true;
  return false;
}

test("the page has the basics: language, charset, viewport, title and description", () => {
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html[^>]*\slang="[a-z-]{2,}"/i, "html needs a lang attribute");
  assert.match(html, /<meta charset="UTF-8">/i);
  assert.match(html, /<meta name="viewport"/);
  const title = html.match(/<title>([^<]+)<\/title>/);
  assert.ok(title && title[1].length >= 20 && title[1].length <= 70, `title length: ${title && title[1].length}`);
  const description = html.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(description && description[1].length >= 50 && description[1].length <= 160, "description length 50-160");
});

test("social and canonical addresses are absolute", () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${pageUrl.replace(/[.\/]/g, "\\$&")}"`));
  for (const content of [...html.matchAll(/property="og:(image|url)" content="([^"]*)"/g)].map((m) => m[2])) {
    assert.ok(content.startsWith("https://"), `og address must be absolute: ${content}`);
  }
});

test("every local link, image and script resolves to a file in docs/", () => {
  const targets = [...attrs(html, "href"), ...attrs(html, "src"), ...attrs(html, "poster")];
  for (const t of targets) {
    if (/^(https?:|mailto:|data:)/.test(t) || t.startsWith("#")) continue;
    assert.ok(resolvesLocally(t), `missing local file for ${t}`);
  }
});

test("every in-page anchor has a target", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const href of attrs(html, "href")) {
    if (!href.startsWith("#") || href === "#") continue;
    assert.ok(ids.has(href.slice(1)), `no element with id for ${href}`);
  }
});

test("external links use https and images have alt text", () => {
  for (const href of attrs(html, "href")) {
    if (/^[a-z]+:/i.test(href)) assert.ok(href.startsWith("https://"), `external link must be https: ${href}`);
  }
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    assert.match(tag, /\salt="[^"]*"/, `image without alt text: ${tag.slice(0, 80)}`);
  }
});

test("the helper's About tab and the README use the same web page address", () => {
  const gui = readFileSync(join(root, "tools/atlas-updater/src/gui.rs"), "utf8");
  assert.ok(gui.includes(`pub const WEB_PAGE: &str = "${pageUrl}";`), "WEB_PAGE in gui.rs");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.ok(readme.includes(pageUrl), "the README links to the web page");
});

test("the page has no placeholder text", () => {
  assert.doesNotMatch(html, /lorem ipsum|TODO|FIXME|coming soon\.\.\./i);
});

test("the site folder has the pages the links point to", () => {
  const files = readdirSync(docs);
  for (const f of ["index.html", "privacy-policy.md", "icon-128.png"]) assert.ok(files.includes(f), `${f} is missing`);
});
