/**
 * The command `node src/rescore.ts <folder>`. It reads each `bench-records.json` under the folder,
 * calculates its values again from the raw samples, and compares each value with `===`.
 * Use it when the code of the statistics changes, to show that old records keep their values.
 * A record of the schema `typeset-bench/1` gets the rules of the old harness. A record of `typeset-bench/2` gets the rules of rigor-bench.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { aaOrders, type AaOrders, type OrderRatio, type PairedTime } from "@mark1russell7/rigor-bench";
import { armTimes } from "@mark1russell7/rigor-bench/fresh";
import { bootstrapMedian, median, quantile, summarize } from "@mark1russell7/rigor-statistics";
import { aaLevel, type BenchRecord } from "./harness.ts";

/** The result of a comparison of one value. */
export interface Check {
  readonly name: string;
  readonly stored: number;
  readonly computed: number;
  readonly equal: boolean;
}

/** A record of the old harness: the schema `typeset-bench/1`. The times are in nanoseconds. */
export interface BenchRecordV1 {
  readonly schema: "typeset-bench/1";
  readonly processes: readonly { readonly arm: string; readonly round: number; readonly position: number; readonly medianNs: number; readonly samples: readonly number[] }[];
  readonly arms: Readonly<Record<string, { readonly medianNs: number; readonly processSpread: number; readonly processP90P10?: number }>>;
  readonly aa?: { readonly arms: readonly [string, string]; readonly perRound: readonly number[]; readonly ratio: number; readonly interval: readonly [number, number] };
}

type Add = (name: string, stored: number, computed: number) => void;

/** This function gives the process of an arm in a round of a record. It throws when the record has no such process. */
function processOf<P extends { readonly arm: string; readonly round: number }>(processes: readonly P[], round: number, arm: string): P {
  const p = processes.find((x) => x.round === round && x.arm === arm);
  if (p === undefined) throw new Error(`the record has no process of ${arm} in round ${round}`);
  return p;
}

function checker(): { checks: Check[]; add: Add } {
  const checks: Check[] = [];
  return { checks, add: (name, stored, computed) => checks.push({ name, stored, computed, equal: stored === computed }) };
}

/** This function calculates the values of a record of the old harness again with its old rules. */
export function rescoreV1(record: BenchRecordV1): Check[] {
  const { checks, add } = checker();
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
      const a = processOf(record.processes, round, first);
      const b = processOf(record.processes, round, second);
      add(`aa round ${round}`, stored, a.medianNs / b.medianNs);
    });
    const interval = bootstrapMedian(record.aa.perRound, { level: 0.9, runs: 2000, seed: 1 });
    add("aa ratio", record.aa.ratio, interval.estimate);
    add("aa interval low", record.aa.interval[0], interval.low);
    add("aa interval high", record.aa.interval[1], interval.high);
  }
  return checks;
}

/** This function calculates the values of a record of the new harness again with the functions of rigor-bench. */
export function rescoreV2(record: BenchRecord): Check[] {
  const { checks, add } = checker();
  record.processes.forEach((p, i) => {
    add(`process ${i} ${p.arm} ms`, p.ms, median(p.samples));
    const half = Math.floor(p.samples.length / 2);
    if (p.warm !== undefined) add(`process ${i} ${p.arm} warm`, p.warm, median(p.samples.slice(p.samples.length - half)) / median(p.samples.slice(0, half)));
  });
  for (const times of armTimes(record.processes)) {
    const stored = record.arms[times.arm];
    if (stored === undefined) {
      add(`${times.arm} summary`, Number.NaN, times.median);
      continue;
    }
    for (const key of ["processes", "median", "p10", "p90", "spread", "min", "max"] as const) add(`${times.arm} ${key}`, stored[key], times[key]);
    add(`${times.arm} processSpread`, stored.processSpread, (times.max - times.min) / times.median);
  }
  if (record.aa !== undefined) {
    const [a, b] = record.aa.arms;
    for (const stored of record.aa.rounds) {
      const pa = processOf(record.processes, stored.round, a);
      const pb = processOf(record.processes, stored.round, b);
      add(`aa round ${stored.round} a`, stored.a, pa.ms);
      add(`aa round ${stored.round} b`, stored.b, pb.ms);
      add(`aa round ${stored.round} first is a`, stored.first === "a" ? 1 : 0, pa.position < pb.position ? 1 : 0);
    }
    const [orders] = aaOrders(record.aa.rounds, aaLevel);
    const pairs: [string, OrderRatio | undefined, OrderRatio | undefined][] = [
      ["all", record.aa.orders.all, orders?.all],
      ["a first", record.aa.orders.aFirst, orders?.aFirst],
      ["b first", record.aa.orders.bFirst, orders?.bFirst],
    ];
    for (const [name, stored, computed] of pairs) {
      if (stored === undefined && computed === undefined) continue;
      for (const key of ["ratio", "low", "high", "coverage", "rounds"] as const) add(`aa ${name} ${key}`, stored?.[key] ?? Number.NaN, computed?.[key] ?? Number.NaN);
    }
  }
  return checks;
}

/**
 * This function applies the A/A rule of the new harness to an old record: `aaOrders` over the stored medians of the
 * processes. The ratio is `b / a`, the inverse of the old ratio `a / b`. A record with no A/A pair gives `undefined`.
 */
export function replayAa(record: BenchRecordV1): AaOrders | undefined {
  if (record.aa === undefined) return undefined;
  const [a, b] = record.aa.arms;
  const rounds: PairedTime[] = [...new Set(record.processes.map((p) => p.round))]
    .sort((x, y) => x - y)
    .map((round) => {
      const pa = processOf(record.processes, round, a);
      const pb = processOf(record.processes, round, b);
      return { case: a, round, first: pa.position < pb.position ? "a" : "b", a: pa.medianNs / 1e6, b: pb.medianNs / 1e6 };
    });
  return aaOrders(rounds, aaLevel)[0];
}

/** This function calculates the values of one record again by the rules of its schema, and compares each one with the stored value. */
export function rescore(record: BenchRecord | BenchRecordV1): Check[] {
  if (record.schema === "typeset-bench/1") return rescoreV1(record);
  if (record.schema === "typeset-bench/2") return rescoreV2(record);
  throw new Error(`the record has the unknown schema ${JSON.stringify((record as { schema?: unknown }).schema)}`);
}

function main(): void {
  const folder = process.argv[2];
  if (folder === undefined) throw new Error("give the folder of the records");
  const files = readdirSync(folder, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("bench-records.json")).sort();
  if (files.length === 0) throw new Error(`the folder ${folder} has no bench-records.json`);
  let unequal = 0;
  let total = 0;
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(folder, file), "utf8")) as BenchRecord | BenchRecordV1;
    const checks = rescore(record);
    const bad = checks.filter((c) => !c.equal);
    total += checks.length;
    unequal += bad.length;
    console.log(`${file}: ${checks.length - bad.length} of ${checks.length} values equal`);
    for (const c of bad) console.log(`  differs: ${c.name}: stored ${c.stored}, computed ${c.computed}`);
    if (record.schema === "typeset-bench/1" && record.aa !== undefined) {
      const replay = replayAa(record)!;
      const show = (r: OrderRatio) => `${r.ratio.toFixed(4)} [${r.low.toFixed(4)}, ${r.high.toFixed(4)}]${r.low <= 1 && 1 <= r.high ? "" : ", without 1"}`;
      const [low, high] = record.aa.interval;
      console.log(`  A/A, old rule a / b: ${record.aa.ratio.toFixed(4)} [${low.toFixed(4)}, ${high.toFixed(4)}]${low <= 1 && 1 <= high ? "" : ", without 1"}`);
      console.log(`  A/A, new rule b / a: ${show(replay.all)}`);
      if (replay.aFirst !== undefined) console.log(`    a first: ${show(replay.aFirst)} over ${replay.aFirst.rounds} rounds`);
      if (replay.bFirst !== undefined) console.log(`    b first: ${show(replay.bFirst)} over ${replay.bFirst.rounds} rounds`);
    }
  }
  console.log(`${files.length} records, ${total - unequal} of ${total} values equal`);
}

if (import.meta.main) main();
