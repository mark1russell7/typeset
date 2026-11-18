import { totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { aaOrders, type AaOrders, type PairedTime } from "@mark1russell7/rigor-bench";
import { armTimes, freshArms, type ArmProcess, type ArmsFixtures, type ArmTimes, type BenchEnv, type CaseArm, type FixtureHash } from "@mark1russell7/rigor-bench/fresh";
import type { ChildOptions } from "./child.ts";

/** The input of `runBench`. */
export interface BenchConfig {
  /** The path of the module of the cases. */
  readonly module: string;
  /** The arms. Two arms with the same case make an A/A pair. */
  readonly arms: readonly CaseArm[];
  /** The count of rounds. Each round starts one fresh process for each arm. */
  readonly rounds: number;
  /** The ids of the two arms of the A/A pair. Arm `a` is the first id. */
  readonly aa?: readonly [string, string];
  readonly child: ChildOptions;
  /** The files that the cases read, with their pinned SHA-256. The run checks them before the first process. */
  readonly fixtures?: ArmsFixtures;
  /** This function gets each process record when the process ends. */
  readonly onProcess?: (record: ProcessRecord) => void;
}

/** The record of one process. */
export interface ProcessRecord extends ArmProcess {
  /** The median time of one call, in milliseconds. It is the median of `samples`. */
  readonly ms: number;
  /** The count of calls in each sample. */
  readonly batch: number;
  /** The time of one call, in milliseconds, for each sample. */
  readonly samples: readonly number[];
  /** The median of the last half of the samples over the median of the first half. */
  readonly warm?: number;
}

/** The summary of one arm over its processes: `armTimes` of rigor-bench, in milliseconds, and the spread of the range. */
export interface ArmSummary extends ArmTimes {
  /** The value (max - min) / median. The worst process decides it, so it grows with the count of processes. A claim uses `spread`. */
  readonly processSpread: number;
}

/** The A/A pair of a run: the times of each round and the ratio `b / a` of each order. */
export interface AaRecord {
  readonly arms: readonly [string, string];
  /** The times of the two arms in each round, in milliseconds. */
  readonly rounds: readonly PairedTime[];
  /** The ratio `b / a` over all rounds and over the rounds of each order, with the 90 % interval of each median. */
  readonly orders: AaOrders;
}

/** The computer and the run that made a record. A claim needs it to compare two records. */
export interface BenchEnvironment extends BenchEnv {
  /** The memory of the computer, in MiB. */
  readonly memoryMb: number;
  readonly mode: "ci" | "local";
  readonly commit?: string;
  readonly runId?: string;
}

/** The record of a bench run: the schema `typeset-bench/2`. */
export interface BenchRecord {
  readonly schema: "typeset-bench/2";
  readonly createdAt: string;
  readonly environment: BenchEnvironment;
  readonly config: { readonly rounds: number; readonly child: ChildOptions; readonly arms: readonly CaseArm[] };
  /** The value is `true` when the count of rounds puts each arm at each position the same number of times. */
  readonly balanced: boolean;
  readonly warnings: readonly string[];
  readonly processes: readonly ProcessRecord[];
  readonly arms: Readonly<Record<string, ArmSummary>>;
  readonly aa?: AaRecord;
  /** The hashes of the files that the cases read. Only a run with fixtures has them. */
  readonly fixtures?: readonly FixtureHash[];
}

/** The level of the interval of each A/A ratio. */
export const aaLevel = 0.9;

/** This function adds the memory, the mode and the run of GitHub Actions to the computer of a run. */
export function environment(env: BenchEnv): BenchEnvironment {
  const vars = process.env;
  const ci = vars["CI"] === "true" || vars["GITHUB_ACTIONS"] === "true";
  return {
    ...env,
    memoryMb: Math.round(totalmem() / 2 ** 20),
    mode: ci ? "ci" : "local",
    ...(vars["GITHUB_SHA"] === undefined ? {} : { commit: vars["GITHUB_SHA"] }),
    ...(vars["GITHUB_RUN_ID"] === undefined ? {} : { runId: vars["GITHUB_RUN_ID"] }),
  };
}

/** This function gives the summary of each arm by its id, in the order of the first process of each arm. */
export function armSummaries(processes: readonly ArmProcess[]): Record<string, ArmSummary> {
  const out: Record<string, ArmSummary> = {};
  for (const times of armTimes(processes)) out[times.arm] = { ...times, processSpread: (times.max - times.min) / times.median };
  return out;
}

/** This function gives the record of one process from the record of `freshArms`. A line with a bad field is an error. */
function processRecord(p: ArmProcess, samples: number): ProcessRecord {
  const extra = p.fields?.extra ?? {};
  const got = extra["samples"];
  const batch = extra["batch"];
  if (extra["case"] !== p.case || !Array.isArray(got) || got.length !== samples || !got.every((s) => typeof s === "number") || typeof batch !== "number") {
    throw new Error(`the process of ${p.arm} in round ${p.round} gave ${Array.isArray(got) ? got.length : "no"} samples of ${String(extra["case"])}, not ${samples} of ${p.case}`);
  }
  const { fields: _fields, ...rest } = p;
  return { ...rest, batch, samples: got as number[], ...(p.fields?.warm === undefined ? {} : { warm: p.fields.warm }) };
}

const childPath = fileURLToPath(new URL("./child.ts", import.meta.url));

/**
 * This function starts the bench with `freshArms` of rigor-bench: in each round, one fresh process for each arm, in the
 * order of `armOrder`. It throws when a process fails, a fixture file is not the pinned file or a record is not
 * complete. Thus a bench does not pass on missing data.
 */
export async function runBench(config: BenchConfig): Promise<BenchRecord> {
  const { child } = config;
  const processes: ProcessRecord[] = [];
  const run = await freshArms({
    arms: config.arms,
    command: [process.execPath, childPath, "--module", config.module],
    args: (caseId) => ["--case", caseId, "--samples", String(child.samples), "--min-sample-ms", String(child.minSampleMs), "--warmup-ms", String(child.warmupMs)],
    rounds: config.rounds,
    timeoutMs: 120_000,
    ...(config.aa === undefined ? {} : { aa: config.aa }),
    ...(config.fixtures === undefined ? {} : { fixtures: config.fixtures }),
    onProcess: (p) => {
      const record = processRecord(p, child.samples);
      processes.push(record);
      config.onProcess?.(record);
    },
  });
  if (processes.length !== config.rounds * config.arms.length) throw new Error(`the bench has ${processes.length} processes, not ${config.rounds * config.arms.length}`);
  let aa: AaRecord | undefined;
  if (config.aa !== undefined) {
    const rounds = run.aa.map(({ case: id, round, first, a, b }) => ({ case: id, round, first, a, b }));
    const [orders] = aaOrders(rounds, aaLevel);
    if (orders === undefined) throw new Error("the A/A pair has no rounds");
    aa = { arms: config.aa, rounds, orders };
  }
  return {
    schema: "typeset-bench/2",
    createdAt: new Date().toISOString(),
    environment: environment(run.env),
    config: { rounds: config.rounds, child, arms: config.arms },
    balanced: run.balanced,
    warnings: run.warnings,
    processes,
    arms: armSummaries(processes),
    ...(aa === undefined ? {} : { aa }),
    ...(run.fixtures === undefined ? {} : { fixtures: run.fixtures }),
  };
}
