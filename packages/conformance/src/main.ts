/**
 * The Unicode gate of typeset. This command reads the test files of the pinned version, checks each SHA-256, and scores the
 * break functions and the bidi resolver. It exits with 1 when a failed test has no reason in `data/reasons.json`.
 * `docs/UNICODE.md` tells the rule. The command also holds the gate of the language sets of `./hyphen`. `docs/HYPHENATION.md`
 * tells that rule.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { pinnedFile, readManifest, readPinned } from "@typeset/pinned";
import { unicodeVersion as bidiTableVersion } from "@mark1russell7/typeset/bidi";
import { canvasWords } from "@mark1russell7/typeset/fonts/inspect";
import { graphemes, lineBreaks, unicodeVersion as tableVersion, wordBreaks } from "@mark1russell7/typeset/segmentation";
import { eachBidiTest, eachCharacterTest, resolveCharacterTest, resolveClassTest, scoreBidi, type BidiScore } from "./bidi.ts";
import { classOf, offsetsOf, unlistedFailures, type Reasons } from "./check.ts";
import { hyphenGate } from "./hyphen/gate.ts";
import { parseTests, scoreTests, type Score } from "./parse.ts";
import { propertyFiles, testFiles, unicodeVersion, type UnicodeFile } from "./sources.ts";
import { bidiTableSource, makeBidiTable, makeTable, tableSource } from "./tables.ts";

const { values } = parseArgs({ options: { folder: { type: "string" }, out: { type: "string" }, write: { type: "boolean" } } });
if (values.folder === undefined) throw new Error("give the folder of the Unicode files with --folder");
const folder = values.folder;
const here = dirname(fileURLToPath(import.meta.url));
const tablePath = join(here, "..", "..", "typeset", "src", "segmentation", "line-table.ts");
const bidiTablePath = join(here, "..", "..", "typeset", "src", "bidi", "table.ts");

const manifest = readManifest();

/** This function gives the text of a pinned file from the folder. It does not fetch the file. The workflow restores the folder. */
const pinnedText = async (name: string): Promise<string> => readPinned(folder, pinnedFile(manifest, name)).toString("utf8");

/** This function gives the text of a file of the Unicode Character Database. */
const textOf = (file: UnicodeFile): Promise<string> => pinnedText(file.path.replace(/^.*\//u, ""));

const table = tableSource(makeTable(await textOf(propertyFiles.lineBreak), await textOf(propertyFiles.eastAsianWidth)), unicodeVersion);
const bidiTable = bidiTableSource(makeBidiTable(await textOf(propertyFiles.bidiClass), await textOf(propertyFiles.bidiBrackets)), unicodeVersion);
if (values.write) {
  writeFileSync(tablePath, table);
  writeFileSync(bidiTablePath, bidiTable);
}

const runtime = process.versions["unicode"];
const problems: string[] = [];
if (runtime === undefined || !unicodeVersion.startsWith(`${runtime}.`)) problems.push(`the runtime has Unicode ${runtime}, and the gate pins ${unicodeVersion}`);
if (tableVersion !== unicodeVersion) problems.push(`the table has Unicode ${tableVersion}, and the gate pins ${unicodeVersion}`);
if (bidiTableVersion !== unicodeVersion) problems.push(`the bidi table has Unicode ${bidiTableVersion}, and the gate pins ${unicodeVersion}`);
if (readFileSync(tablePath, "utf8") !== table) problems.push("the committed table differs from the table of the property files");
if (readFileSync(bidiTablePath, "utf8") !== bidiTable) problems.push("the committed bidi table differs from the table of the property files");

const hyphens = await hyphenGate(join(here, "..", "..", ".."), (file) => pinnedText(file.name), (file) => pinnedText(file.name), values.write === true);
problems.push(...hyphens.problems);

const wordTests = parseTests(await textOf(testFiles.word));
const scores: Record<string, Score> = {
  grapheme: scoreTests(parseTests(await textOf(testFiles.grapheme)), (text) => offsetsOf(graphemes(text))),
  word: scoreTests(wordTests, wordBreaks),
  line: scoreTests(parseTests(await textOf(testFiles.line)), (text) => lineBreaks(text).map((place) => place.offset)),
};
const blink = scoreTests(wordTests, (text) => offsetsOf(canvasWords(text)));
const bidiFile = await textOf(testFiles.bidi);
const characterFile = await textOf(testFiles.bidiCharacter);
const started = performance.now();
const bidiScores: Record<string, BidiScore> = {};
for (const [name, score] of Object.entries(scoreBidi((visit) => eachBidiTest(bidiFile, visit), resolveClassTest))) bidiScores[`bidi.${name}`] = score;
for (const [name, score] of Object.entries(scoreBidi((visit) => eachCharacterTest(characterFile, visit), resolveCharacterTest))) bidiScores[`bidiCharacter.${name}`] = score;
const bidiSeconds = (performance.now() - started) / 1000;

/** The most tests that the log names, and the most failures of one bidi score that the record keeps. The counts include all failures. */
const shownProblems = 20;
const keptFailures = 1000;

const reasons = JSON.parse(readFileSync(join(here, "..", "data", "reasons.json"), "utf8")) as Reasons;
const unlisted = unlistedFailures({ ...scores, ...bidiScores }, reasons);
for (const name of unlisted.slice(0, shownProblems)) problems.push(`${name} has no reason in data/reasons.json`);
if (unlisted.length > shownProblems) problems.push(`${unlisted.length - shownProblems} more failed tests have no reason in data/reasons.json`);
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
  bidi: {
    seconds: bidiSeconds,
    scores: Object.fromEntries(Object.entries(bidiScores).map(([name, score]) => [name, { tests: score.tests, passed: score.passed, failures: score.failures.slice(0, keptFailures).map((failure) => ({ ...failure, reason: reasons.failures[`${name}:${failure.line}`] })) }])),
  },
  hyphen: hyphens.record,
  hyphenMisses: hyphens.misses,
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
  ...Object.entries(bidiScores).map(([name, score]) => {
    const [file, direction, measure] = name.split(".");
    return `| \`resolveLevels\`, ${direction}, ${measure} | \`${file === "bidi" ? "BidiTest" : "BidiCharacterTest"}\` | ${score.passed} of ${score.tests} | ${rate(score)} |`;
  }),
  "",
  "| Language | Confirmed | Found | Gzip bytes |",
  "|---|---|---|---|",
  ...Object.entries(hyphens.record.languages).map(([name, language]) => `| \`${name}\` | ${language.confirmed} | ${language.found} | ${language.weight.gzip} |`),
  "",
  "| Language | Class | Found | Left out | Found on the rest | Target | Misses that the class explains | Other misses |",
  "|---|---|---|---|---|---|---|---|",
  ...Object.entries(hyphens.misses.languages).flatMap(([name, language]) =>
    Object.entries(language.classes).map(([reference, report]) => `| \`${name}\` | \`${reference}\` | ${report.found} | ${report.leftOut} | ${report.foundRest} | ${report.target} | ${report.explained} of ${language.misses} | ${report.rest.misses} |`),
  ),
  "",
  "| Language | Rule | Defects on the sample | Defects on the full list | Words of the full list | Defects of the pinned set alone (sample, full list) | Conflicts in the list | Words of the layer |",
  "|---|---|---|---|---|---|---|---|",
  ...Object.entries(hyphens.misses.languages).flatMap(([name, language]) => {
    const reference = language.reference;
    if (reference === null) return [];
    return Object.entries(reference.full.rules).map(([rule, full]) => `| \`${name}\` | \`${rule}\` | ${reference.sample[rule]!.defects} | ${full.defects} | ${reference.full.words} | ${reference.sample[rule]!.pinnedDefects}, ${full.pinnedDefects} | ${full.conflicts.length} | ${reference.layer} |`);
  }),
];
console.log(lines.join("\n"));
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary) appendFileSync(summary, `${lines.join("\n")}\n`);

for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
