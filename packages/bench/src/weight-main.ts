/**
 * The weight gate of typeset. This command compares the weight of each public entry with the last release. It exits with 1
 * when an entry grows over the limit in `packages/bench/weight.json`.
 *
 * It also exits with 1 when an entry that no release has fails its line in `newEntries` of that file. An entry over its
 * cap in `caps` also fails. A `null` limit only reports. `docs/BENCH.md` tells the rule.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gateLine, writeGateLine } from "@mark1russell7/rigor-bench";
import { version } from "esbuild";
import { compareWeights, latestTag, sameWeights, weighRelease, weighTree, type CapLines, type NewEntryLines } from "./weight.ts";

const { values } = parseArgs({ options: { out: { type: "string" }, tag: { type: "string" } } });
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repo, "packages", "typeset");
const nodePaths = [join(root, "node_modules")];
const config = JSON.parse(readFileSync(join(repo, "packages", "bench", "weight.json"), "utf8")) as { limitGzipBytes: number | null; newEntries?: NewEntryLines; caps?: CapLines };
const limit = config.limitGzipBytes;

const tag = values.tag ?? latestTag(repo);
const head = weighTree(root, nodePaths);
const repeat = sameWeights(head, weighTree(root, nodePaths));
const rows = compareWeights(head, weighRelease(repo, tag, nodePaths), limit, config.newEntries, config.caps);

const record = {
  schema: 1,
  runId: process.env["GITHUB_RUN_ID"] ?? null,
  head: process.env["WEIGHT_HEAD"] ?? null,
  tag,
  esbuild: version,
  gzipLevel: 9,
  limitGzipBytes: limit,
  repeat,
  rows,
  files: Object.fromEntries(Object.entries(head).map(([entry, weight]) => [entry, weight.files])),
};
if (values.out !== undefined) writeFileSync(values.out, `${JSON.stringify(record, null, 2)}\n`);

const lines = [
  `### Weight against ${tag}, limit ${limit ?? "none"} gzip bytes`,
  "",
  "| Entry | Minified | Gzip | Gzip at the release | Growth | Cap |",
  "|---|---|---|---|---|---|",
  ...rows.map((row) => {
    const base = row.releaseGzip ?? (row.line === undefined ? "new, no line" : `new: base ${row.line.baseGzipBytes}, limit ${row.line.limitGzipBytes}`);
    return `| \`${row.entry}\` | ${row.minified} | ${row.gzip} | ${base} | ${row.growth ?? "new"}${row.over ? ` **over** (${row.cause})` : ""} | ${row.cap ?? "none"} |`;
  }),
];
console.log(lines.join("\n"));
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary) appendFileSync(summary, `${lines.join("\n")}\n`);

// The check line names each entry over a line as a block, and an error decides the check. A `null` limit only reports,
// so each other entry is then a no-read, and the line is a warning.
const reads = rows.map((row) => ({ case: row.entry, outcome: row.over ? "beyond" : limit === null ? "no read" : "pass" }));
const causes = rows.filter((row) => row.over).map((row) => `${row.entry}: ${row.cause ?? "over"}`);
const reasons = [...(causes.length > 0 ? [`the rules: ${causes.join(", ")}`] : []), ...(limit === null ? ["the limit is null, so the gate gives no verdict"] : [])];
writeGateLine(gateLine(reads, { title: `Weight against ${tag}`, enforced: rows.some((row) => row.over), reason: reasons.join(", and ") }));
if (!repeat) console.error("two measures of one tree gave different bytes");
if (!repeat || rows.some((row) => row.over)) process.exitCode = 1;
