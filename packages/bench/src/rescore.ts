/**
 * The command `node src/rescore.ts <folder>`. It reads each `bench-records.json` under the folder,
 * calculates its values again from the raw samples, and compares each value with `===`.
 * Use it when the code of the statistics changes, to show that old records keep their values.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapMedian, median, quantile, summarize } from "@mark1russell7/rigor-statistics";
import type { BenchRecord } from "./harness.ts";

/** The result of a comparison of one value. */
export interface Check {
  readonly name: string;
  readonly stored: number;
  readonly computed: number;
  readonly equal: boolean;
}

/** This function calculates the values of one record again and compares each one with the stored value. */
export function rescore(record: BenchRecord): Check[] {
  const checks: Check[] = [];
  const add = (name: string, stored: number, computed: number): void => {
    checks.push({ name, stored, computed, equal: stored === computed });
  };
  record.processes.forEach((p, i) => add(`process ${i} ${p.arm} medianNs`, p.medianNs, median(p.samples)));
  for (const [arm, summary] of Object.entries(record.arms)) {
    const medians = record.processes.filter((p) => p.arm === arm).map((p) => p.medianNs);
    const s = summarize(medians);
    add(`${arm} medianNs`, summary.medianNs, s.median);
    add(`${arm} processSpread`, summary.processSpread, (s.max - s.min) / s.median);
    if (summary.processP90P10 !== undefined) add(`${arm} processP90P10`, summary.processP90P10, quantile(medians, 0.9) / quantile(medians, 0.1));
  }
  if (record.aa !== undefined) {
    const [first, second] = record.aa.arms;
    record.aa.perRound.forEach((stored, round) => {
      const a = record.processes.find((p) => p.round === round && p.arm === first)!;
      const b = record.processes.find((p) => p.round === round && p.arm === second)!;
      add(`aa round ${round}`, stored, a.medianNs / b.medianNs);
    });
    const interval = bootstrapMedian(record.aa.perRound, { level: 0.9, runs: 2000, seed: 1 });
    add("aa ratio", record.aa.ratio, interval.estimate);
    add("aa interval low", record.aa.interval[0], interval.low);
    add("aa interval high", record.aa.interval[1], interval.high);
  }
  return checks;
}

function main(): void {
  const folder = process.argv[2];
  if (folder === undefined) throw new Error("give the folder of the records");
  const files = readdirSync(folder, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("bench-records.json")).sort();
  if (files.length === 0) throw new Error(`the folder ${folder} has no bench-records.json`);
  let unequal = 0;
  let total = 0;
  for (const file of files) {
    const checks = rescore(JSON.parse(readFileSync(join(folder, file), "utf8")) as BenchRecord);
    const bad = checks.filter((c) => !c.equal);
    total += checks.length;
    unequal += bad.length;
    console.log(`${file}: ${checks.length - bad.length} of ${checks.length} values equal`);
    for (const c of bad) console.log(`  differs: ${c.name}: stored ${c.stored}, computed ${c.computed}`);
  }
  console.log(`${files.length} records, ${total - unequal} of ${total} values equal`);
}

if (import.meta.main) main();
