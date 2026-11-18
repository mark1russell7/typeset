/**
 * The command `pnpm bench`. It starts each case of `cases/index.ts` with an A/A pair and writes the record as JSON.
 * Timing runs belong in CI (the workflow `bench.yml`), not on a shared machine.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gateLine, jobModels, writeGateLine } from "@mark1russell7/rigor-bench";
import { aa, arms, balancedRounds, fontFixtures, fontFolder } from "./cases/index.ts";
import { aaLevel, runBench } from "./harness.ts";

const { values } = parseArgs({
  options: {
    rounds: { type: "string", default: String(balancedRounds) },
    samples: { type: "string", default: "15" },
    "min-sample-ms": { type: "string", default: "5" },
    "warmup-ms": { type: "string", default: "300" },
    out: { type: "string", default: "bench-records.json" },
    label: { type: "string", default: "" },
  },
});

// The measurer cases read the pinned fonts. The harness checks the SHA-256 of each file before the first process.
const folder = process.env[fontFolder];
if (folder === undefined || folder === "") throw new Error(`the bench needs the pinned fonts in the folder of the variable ${fontFolder}`);

const us = (ms: number): string => (ms * 1e3).toFixed(1);
const ratio = (r: { ratio: number; low: number; high: number }): string => `${r.ratio.toFixed(4)} [${r.low.toFixed(4)}, ${r.high.toFixed(4)}]`;

const record = await runBench({
  module: fileURLToPath(new URL("./cases/index.ts", import.meta.url)),
  arms,
  rounds: Number(values.rounds),
  aa: [...aa],
  child: { samples: Number(values.samples), minSampleMs: Number(values["min-sample-ms"]), warmupMs: Number(values["warmup-ms"]) },
  fixtures: { folder, files: fontFixtures },
  onProcess: (p) => console.log(`round ${p.round} #${p.position} ${p.arm}: ${us(p.ms)} us (batch ${p.batch})`),
});

// A count of rounds that is not a multiple of the balanced count puts some arms at some positions more often. Then the A/A pair can show a bias of order.
for (const warning of record.warnings) console.warn(`warning: ${warning}`);

writeFileSync(values.out, JSON.stringify(record, null, 2) + "\n");
console.log(`\n${record.environment.cpu}, ${record.environment.node}, ${record.environment.mode}`);
for (const [arm, s] of Object.entries(record.arms)) {
  console.log(`${arm}: median ${us(s.median)} us, p90 / p10 ${s.spread.toFixed(4)}, process spread ${(s.processSpread * 100).toFixed(1)} % over ${s.processes} processes`);
}
if (record.aa !== undefined) {
  const { orders } = record.aa;
  console.log(`A/A ${record.aa.arms[1]} / ${record.aa.arms[0]}: ${ratio(orders.all)}`);
  if (orders.aFirst !== undefined) console.log(`  ${record.aa.arms[0]} first: ${ratio(orders.aFirst)} over ${orders.aFirst.rounds} rounds`);
  if (orders.bFirst !== undefined) console.log(`  ${record.aa.arms[1]} first: ${ratio(orders.bFirst)} over ${orders.bFirst.rounds} rounds`);
}
console.log(`wrote ${values.out}`);

// In GitHub Actions, the job summary gets a table of the arms.
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary !== undefined && summary !== "") {
  const lines = [
    `### Bench, ${record.config.rounds} rounds${values.label === "" ? "" : `, prediction ${values.label}`}`,
    "",
    `CPU: ${record.environment.cpu}, Node ${record.environment.node}`,
    "",
    "| Arm | Median (us) | Process spread | p90 / p10 | Processes |",
    "|---|---|---|---|---|",
    ...Object.entries(record.arms).map(([arm, s]) => `| ${arm} | ${us(s.median)} | ${(s.processSpread * 100).toFixed(1)} % | ${s.spread.toFixed(4)} | ${s.processes} |`),
  ];
  if (record.aa !== undefined) lines.push("", `A/A (${record.aa.arms[1]} / ${record.aa.arms[0]}): ${ratio(record.aa.orders.all)}, ${aaLevel * 100} % interval`);
  appendFileSync(summary, `${lines.join("\n")}\n`);
}

// The bench has no limit, so it reads no case. A green check is not a pass: the warning of `writeGateLine` puts the
// no-read of each arm on the check line and in the step summary.
const reads = Object.keys(record.arms).map((arm) => ({ case: arm, outcome: "no read" }));
writeGateLine(
  gateLine(reads, {
    title: "Bench",
    reason: `the bench has no limit, so it gives no verdict (${record.config.rounds} rounds)`,
    models: jobModels([{ cpu: record.environment.cpu }]),
  }),
);
