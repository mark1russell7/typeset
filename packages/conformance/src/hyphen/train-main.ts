/**
 * This command trains the `en-us` set with `patgen` on the training half of Moby Hyphenator II. It scores the set and the
 * shipped set on the held-out half and on the TUGboat exceptions. The field `--folder` keeps the downloads and the work files,
 * and `--patgen` names the program. With `--write`, the command writes the patterns and the record in `data/hyphen`. Without
 * it, the command exits with 1 when a new run differs from the committed files. A workflow in CI starts it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { hyphenator } from "@mark1russell7/typeset/hyphen";
import { hyphenate as shipped } from "@mark1russell7/typeset/hyphen/en-us";
import { pinnedFile, readManifest, readPinned, sha256Of } from "@typeset/pinned";
import { hyphenFiles, tugboatExceptions } from "./sources.ts";
import { compareSets, levelAnswers, listedForms, patgenPatterns, ratesOf, splitForms, texExceptionForms, translateFile, wordCounts, type TrainParams } from "./train.ts";

const { values } = parseArgs({ options: { folder: { type: "string" }, patgen: { type: "string" }, out: { type: "string" }, runs: { type: "string" }, write: { type: "boolean" } } });
if (values.folder === undefined || values.patgen === undefined) throw new Error("give --folder and --patgen");
const folder = values.folder;
const data = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "hyphen");
const paths = { params: join(data, "en-us-train-params.json"), patterns: join(data, "en-us-moby.pat"), record: join(data, "en-us-train.json") };
const params = JSON.parse(readFileSync(paths.params, "utf8")) as TrainParams;
const runs = Number(values.runs ?? 10000);
mkdirSync(folder, { recursive: true });

// The workflow restores the pinned files into the folder. The command does not fetch them.
const manifest = readManifest();
const moby = hyphenFiles.find((file) => file.language === "en-us")!.list;
const mobyText = readPinned(folder, pinnedFile(manifest, "mhyph.txt")).toString("latin1");
const tugText = readPinned(folder, pinnedFile(manifest, "ushyphex.tex")).toString("utf8");

// The forms of Moby: each single word in lowercase, with a hyphen at each place. draw.ts uses the same filter.
const listed = listedForms(mobyText.split(/\r?\n/u).filter((line) => /^[a-z¥]+$/u.test(line)).map((line) => line.replaceAll("¥", "-")));
const halves = splitForms(listed.forms, params.seed);

const work = join(folder, "train");
mkdirSync(work, { recursive: true });
writeFileSync(join(work, "train.dic"), `${halves.train.join("\n")}\n`);
writeFileSync(join(work, "translate.tr"), translateFile(listed.forms, params.left, params.right));
writeFileSync(join(work, "level0.pat"), "");
const levels: { readonly level: number; readonly patterns: number; readonly log: string }[] = [];
for (const [index, level] of params.levels.entries()) {
  const input = `level${index}.pat`;
  const output = `level${index + 1}.pat`;
  const run = spawnSync(values.patgen, ["train.dic", input, output, "translate.tr"], { cwd: work, input: levelAnswers(level, index + 1), encoding: "utf8", maxBuffer: 1 << 26 });
  writeFileSync(join(work, `level${index + 1}.log`), `${run.stdout ?? ""}${run.stderr ?? ""}`);
  if (run.status !== 0 || !existsSync(join(work, output))) throw new Error(`patgen stopped at level ${index + 1} with status ${run.status}. See ${join(work, `level${index + 1}.log`)}`);
  const patterns = patgenPatterns(readFileSync(join(work, output), "utf8"));
  levels.push({ level: index + 1, patterns: patterns === "" ? 0 : patterns.split(" ").length, log: run.stdout.split(/\r?\n/u).filter((line) => /hyphens|good|bad|missed/u.test(line)).slice(-3).join(" | ") });
}
const patterns = patgenPatterns(readFileSync(join(work, `level${params.levels.length}.pat`), "utf8"));
const trained = hyphenator({ patterns, exceptions: "", left: params.left, right: params.right });

const tug = texExceptionForms(tugText);
const record = {
  schema: "typeset-hyphen-train/1",
  language: params.language,
  params: { file: "en-us-train-params.json", sha256: sha256Of(readFileSync(paths.params)) },
  patgen: spawnSync(values.patgen, ["--version"], { encoding: "utf8" }).stdout.split(/\r?\n/u)[0] ?? "",
  list: { name: moby.name, sha256: moby.sha256, forms: listed.forms.length, conflicts: listed.conflicts, train: halves.train.length, heldOut: halves.heldOut.length },
  patterns: patterns.split(" ").length,
  levels: levels.map(({ level, patterns: count }) => ({ level, patterns: count })),
  heldOut: compareSets(wordCounts(halves.heldOut, trained, shipped, params.left, params.right), { runs, seed: `${params.seed}/held-out` }),
  train: ((counts) => ({ words: counts.length, candidate: ratesOf(counts, 0), baseline: ratesOf(counts, 1) }))(wordCounts(halves.train, trained, shipped, params.left, params.right)),
  tugboat: { list: tugboatExceptions.name, sha256: tugboatExceptions.sha256, skipped: tug.skipped, ...compareSets(wordCounts(tug.forms, trained, shipped, params.left, params.right), { runs, seed: `${params.seed}/tugboat` }) },
};
// The pass rule of docs/HYPHENATION.md: on the held-out half, a found gain outside the noise and no loss of confirmed. On the
// TUGboat list, no loss of either rate.
const verdict = {
  heldOutFound: record.heldOut.foundGain.low > 0,
  heldOutConfirmed: record.heldOut.candidate.confirmed >= record.heldOut.baseline.confirmed,
  tugboatFound: record.tugboat.candidate.found >= record.tugboat.baseline.found,
  tugboatConfirmed: record.tugboat.candidate.confirmed >= record.tugboat.baseline.confirmed,
};
const scored = { ...record, verdict: { ...verdict, pass: Object.values(verdict).every(Boolean) } };
for (const { level, patterns: count, log } of levels) console.log(`level ${level}: ${count} patterns. ${log}`);
console.log(JSON.stringify({ heldOut: record.heldOut, tugboat: record.tugboat, verdict: scored.verdict }, null, 2));

const patternText = `${patterns.split(" ").join("\n")}\n`;
const recordText = `${JSON.stringify(scored, null, 2)}\n`;
if (values.out !== undefined) {
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, "en-us-moby.pat"), patternText);
  writeFileSync(join(values.out, "en-us-train.json"), recordText);
}
if (values.write === true) {
  writeFileSync(paths.patterns, patternText);
  writeFileSync(paths.record, recordText);
}
const problems: string[] = [];
if (!existsSync(paths.patterns) || readFileSync(paths.patterns, "utf8") !== patternText) problems.push("the committed patterns differ from the patterns of a new training");
if (!existsSync(paths.record) || readFileSync(paths.record, "utf8") !== recordText) problems.push("the committed record differs from the record of a new training");
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
