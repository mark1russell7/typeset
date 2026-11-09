/**
 * The command `pnpm bench`. It starts each case of `cases/index.ts` with an A/A pair and writes the record as JSON.
 * Timing runs belong in CI (the workflow `bench.yml`), not on a shared machine.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gateLine, jobModels, writeGateLine } from "@mark1russell7/rigor-bench";
import { aa, arms, balancedRounds } from "./cases/index.ts";
import { runBench } from "./harness.ts";

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

// A count of rounds that is not a multiple of the balanced count puts some arms at some positions more often. Then the A/A pair can show a bias of order.
if (Number(values.rounds) % balancedRounds !== 0) console.warn(`warning: ${values.rounds} rounds is not a multiple of ${balancedRounds}, so the order of the arms is not balanced`);

const record = runBench({
  module: fileURLToPath(new URL("./cases/index.ts", import.meta.url)),
  arms,
  rounds: Number(values.rounds),
  aa: [...aa],
  child: { samples: Number(values.samples), minSampleMs: Number(values["min-sample-ms"]), warmupMs: Number(values["warmup-ms"]) },
  onProcess: (p) => console.log(`round ${p.round} #${p.position} ${p.arm}: ${(p.medianNs / 1e3).toFixed(1)} us (batch ${p.batch})`),
});

writeFileSync(values.out, JSON.stringify(record, null, 2) + "\n");
console.log(`\n${record.environment.cpu}, ${record.environment.node}, ${record.environment.mode}`);
for (const [arm, s] of Object.entries(record.arms)) {
  console.log(`${arm}: median ${(s.medianNs / 1e3).toFixed(1)} us, process spread ${(s.processSpread * 100).toFixed(1)} % over ${s.processes} processes`);
}
if (record.aa !== undefined) {
  const [low, high] = record.aa.interval;
  console.log(`A/A ${record.aa.arms.join(" / ")}: ${record.aa.ratio.toFixed(4)} [${low.toFixed(4)}, ${high.toFixed(4)}]`);
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
    ...Object.entries(record.arms).map(([arm, s]) => `| ${arm} | ${(s.medianNs / 1e3).toFixed(1)} | ${(s.processSpread * 100).toFixed(1)} % | ${s.processP90P10.toFixed(4)} | ${s.processes} |`),
  ];
  if (record.aa !== undefined) lines.push("", `A/A: ${record.aa.ratio.toFixed(4)}, 90 % interval [${record.aa.interval.map((x) => x.toFixed(4)).join(", ")}]`);
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
