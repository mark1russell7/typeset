/**
 * The Unicode gate of typeset. This command reads the test files of the pinned version, checks each SHA-256, and scores the
 * break functions. It exits with 1 when a failed test has no reason in `data/reasons.json`. `docs/UNICODE.md` tells the rule.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { canvasWords } from "@mark1russell7/typeset/fonts/inspect";
import { graphemes, lineBreaks, unicodeVersion as tableVersion, wordBreaks } from "@mark1russell7/typeset/segmentation";
import { classOf, offsetsOf, unlistedFailures, type Reasons } from "./check.ts";
import { parseTests, scoreTests, type Score } from "./parse.ts";
import { fileUrl, propertyFiles, testFiles, unicodeVersion, type UnicodeFile } from "./sources.ts";
import { makeTable, tableSource } from "./tables.ts";

const { values } = parseArgs({ options: { folder: { type: "string" }, out: { type: "string" }, write: { type: "boolean" } } });
if (values.folder === undefined) throw new Error("give the folder of the Unicode files with --folder");
const folder = values.folder;
const here = dirname(fileURLToPath(import.meta.url));
const tablePath = join(here, "..", "..", "typeset", "src", "segmentation", "line-table.ts");

/** This function gives the text of a file. It downloads the file when the folder does not have the correct bytes. */
async function textOf(file: UnicodeFile): Promise<string> {
  const path = join(folder, file.path.replace(/^.*\//u, ""));
  const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
  if (existsSync(path) && sha256(readFileSync(path)) === file.sha256) return readFileSync(path, "utf8");
  const response = await fetch(fileUrl(file));
  if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== file.sha256) throw new Error(`${file.path}: the SHA-256 is ${sha256(bytes)}, not ${file.sha256}`);
  writeFileSync(path, bytes);
  return readFileSync(path, "utf8");
}

mkdirSync(folder, { recursive: true });
const table = tableSource(makeTable(await textOf(propertyFiles.lineBreak), await textOf(propertyFiles.eastAsianWidth)), unicodeVersion);
if (values.write) writeFileSync(tablePath, table);

const runtime = process.versions["unicode"];
const problems: string[] = [];
if (runtime === undefined || !unicodeVersion.startsWith(`${runtime}.`)) problems.push(`the runtime has Unicode ${runtime}, and the gate pins ${unicodeVersion}`);
if (tableVersion !== unicodeVersion) problems.push(`the table has Unicode ${tableVersion}, and the gate pins ${unicodeVersion}`);
if (readFileSync(tablePath, "utf8") !== table) problems.push("the committed table differs from the table of the property files");

const wordTests = parseTests(await textOf(testFiles.word));
const scores: Record<string, Score> = {
  grapheme: scoreTests(parseTests(await textOf(testFiles.grapheme)), (text) => offsetsOf(graphemes(text))),
  word: scoreTests(wordTests, wordBreaks),
  line: scoreTests(parseTests(await textOf(testFiles.line)), (text) => lineBreaks(text).map((place) => place.offset)),
};
const blink = scoreTests(wordTests, (text) => offsetsOf(canvasWords(text)));

const reasons = JSON.parse(readFileSync(join(here, "..", "data", "reasons.json"), "utf8")) as Reasons;
const unlisted = unlistedFailures(scores, reasons);
for (const name of unlisted) problems.push(`${name} has no reason in data/reasons.json`);
const classes: Record<string, number> = {};
for (const failure of blink.failures) classes[classOf(failure)] = (classes[classOf(failure)] ?? 0) + 1;
for (const name of Object.keys(classes)) if (reasons.canvasWords[name] === undefined) problems.push(`the class ${name} of canvasWords has no reason in data/reasons.json`);

const rate = (score: Pick<Score, "passed" | "tests">): string => `${((100 * score.passed) / score.tests).toFixed(3)} %`;
const record = {
  schema: "typeset-conformance/1",
  runId: process.env["GITHUB_RUN_ID"] ?? null,
  head: process.env["CONFORMANCE_HEAD"] ?? null,
  unicode: unicodeVersion,
  runtime: { node: process.version, unicode: runtime, icu: process.versions["icu"] },
  files: Object.fromEntries(Object.entries(scores).map(([name, score]) => [name, { tests: score.tests, passed: score.passed, failures: score.failures.map((failure) => ({ line: failure.line, source: failure.source, reason: reasons.failures[`${name}:${failure.line}`] })) }])),
  canvasWords: { tests: blink.tests, passed: blink.passed, classes: Object.fromEntries(Object.entries(classes).map(([name, count]) => [name, { count, reason: reasons.canvasWords[name] }])) },
};
if (values.out !== undefined) writeFileSync(values.out, `${JSON.stringify(record, null, 2)}\n`);

const lines = [
  `### Unicode ${unicodeVersion}, runtime ${runtime}, ICU ${process.versions["icu"]}`,
  "",
  "| Function | File | Passed | Rate |",
  "|---|---|---|---|",
  `| \`graphemes\` | \`GraphemeBreakTest\` | ${scores["grapheme"]!.passed} of ${scores["grapheme"]!.tests} | ${rate(scores["grapheme"]!)} |`,
  `| \`wordBreaks\` | \`WordBreakTest\` | ${scores["word"]!.passed} of ${scores["word"]!.tests} | ${rate(scores["word"]!)} |`,
  `| \`lineBreaks\` | \`LineBreakTest\` | ${scores["line"]!.passed} of ${scores["line"]!.tests} | ${rate(scores["line"]!)} |`,
  `| \`canvasWords\` | \`WordBreakTest\` | ${blink.passed} of ${blink.tests} | ${rate(blink)} |`,
];
console.log(lines.join("\n"));
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary) appendFileSync(summary, `${lines.join("\n")}\n`);

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
