// Tests the PDF text layout helpers (translator/pdf-text.js): lines, paragraphs, long-paragraph splits and batches.
// The file has no browser APIs, so it runs as a plain script in a sandbox. The PDF itself is checked in tests/browser/translator.mjs.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(ROOT + "translator/pdf-text.js", "utf8") + "\n;this.TwpPdfText = TwpPdfText;", context);
const T = context.TwpPdfText;
// Arrays made inside vm come from another realm, so comparisons use deepEqual.

// Items on one baseline join into one line, with a space only where there is a real gap
{
  const lines = T.groupLines([
    { str: "Hello", x: 72, y: 700, width: 30, height: 11 },
    { str: "world", x: 106, y: 700, width: 30, height: 11 },
    { str: "Next", x: 72, y: 680, width: 25, height: 11 }
  ]);
  assert.deepEqual(lines.map(l => l.text), ["Hello world", "Next"]);
}

// Runs that touch each other (no gap, as PDFs often split one word) are joined without a space
{
  const lines = T.groupLines([
    { str: "Atlas", x: 72, y: 700, width: 30, height: 11 },
    { str: "Translation", x: 102, y: 700, width: 50, height: 11 }
  ]);
  assert.deepEqual(lines.map(l => l.text), ["AtlasTranslation"]);
}

// Lines close together are one paragraph; a large gap starts a new one
{
  const lines = [
    { text: "First line", y: 700, x: 72, height: 11 },
    { text: "second line", y: 686, x: 72, height: 11 },
    { text: "A new paragraph", y: 640, x: 72, height: 11 }
  ];
  assert.deepEqual(T.buildParagraphs(lines), ["First line second line", "A new paragraph"]);
}

// A word split at the end of a line is joined when the next line goes on in lower case
{
  const lines = [
    { text: "This is trans-", y: 700, x: 72, height: 11 },
    { text: "lated text.", y: 686, x: 72, height: 11 },
    { text: "Dash - stays", y: 672, x: 72, height: 11 }
  ];
  assert.deepEqual(T.buildParagraphs(lines), ["This is translated text. Dash - stays"]);
}

// A sideways jump (a new column) starts a new paragraph
{
  const lines = [
    { text: "Left column", y: 700, x: 72, height: 11 },
    { text: "Right column", y: 698, x: 330, height: 11 }
  ];
  assert.deepEqual(T.buildParagraphs(lines), ["Left column", "Right column"]);
}

// Long paragraphs are cut at spaces, and nothing is lost
{
  const long = Array.from({ length: 60 }, (_, i) => "word" + i).join(" ");
  const pieces = T.splitLong(long, 100);
  assert.ok(pieces.every(p => p.length <= 100), "every piece fits");
  assert.strictEqual(pieces.join(" "), long);
}

// Batches respect the item and character limits
{
  const paragraphs = Array.from({ length: 5 }, () => "x".repeat(30));
  assert.deepEqual(T.batches(paragraphs, 2, 1000).map(b => b.length), [2, 2, 1]);
  assert.deepEqual(T.batches(paragraphs, 10, 70).map(b => b.length), [2, 2, 1]);
  assert.deepEqual(T.batches([], 5, 100), []);
}

// Language guess from a sample text
{
  const en = "The report is based on the data that was collected during the study and this is not the final version of the work for the team.";
  const fr = "Le rapport est basé sur les données qui ont été collectées pendant l'étude et ce n'est pas la version finale du travail pour une équipe.";
  const de = "Der Bericht basiert auf den Daten, die während der Studie gesammelt wurden, und das ist nicht die endgültige Fassung der Arbeit für das Team.";
  assert.strictEqual(T.detectLanguage(en).code, "en");
  assert.strictEqual(T.detectLanguage(fr).code, "fr");
  assert.strictEqual(T.detectLanguage(de).code, "de");
  // Only the allowed languages are returned
  assert.strictEqual(T.detectLanguage(fr, ["en", "de"]), null, "French is not allowed here");
  // Scripts
  assert.strictEqual(T.detectLanguage("Привет, это тестовый документ с достаточно длинным текстом для проверки языка.").code, "ru");
  assert.strictEqual(T.detectLanguage("これはテストの文書です。言語を判定するために十分な長さの文章を用意しています。").code, "ja");
  // Too short, or no clear winner
  assert.strictEqual(T.detectLanguage("Hello there."), null);
  assert.strictEqual(T.detectLanguage("the de la der die und et y il che"), null);
}

console.log("pdfText: all checks passed");
