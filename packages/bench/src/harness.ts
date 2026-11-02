import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import type { ChildOptions, ChildResult } from "./child.ts";
import { median, medianWithInterval, relativeSpread, type RatioEstimate } from "./stats.ts";

/** An arm of the bench: a name and the case that it starts. Two arms with the same case make an A/A pair. */
export interface Arm {
  readonly arm: string;
  readonly case: string;
}

/** The input of `runBench`. */
export interface BenchConfig {
  /** The path of the module of the cases. */
  readonly module: string;
  readonly arms: readonly Arm[];
  /** The count of rounds. Each round starts one fresh process for each arm. */
  readonly rounds: number;
  /** The names of the two arms of the A/A pair. */
  readonly aa?: readonly [string, string];
  readonly child: ChildOptions;
  /** This function gets each process record when the process ends. */
  readonly onProcess?: (record: ProcessRecord) => void;
}

/** The record of one process. */
export interface ProcessRecord extends ChildResult {
  readonly round: number;
  /** The position of the process in its round, from 0. */
  readonly position: number;
  readonly arm: string;
  /** The median time of one call, in nanoseconds. */
  readonly medianNs: number;
}

/** The summary of one arm over all its processes. */
export interface ArmSummary {
  readonly processes: number;
  /** The median of the process medians, in nanoseconds. */
  readonly medianNs: number;
  /** (maximum - minimum) / median of the process medians. */
  readonly processSpread: number;
}

/** The machine and the run that made a record. A claim needs it to compare two records. */
export interface BenchEnvironment {
  readonly cpu: string;
  readonly cores: number;
  readonly memoryMb: number;
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  readonly mode: "ci" | "local";
  readonly runner?: string;
  readonly commit?: string;
  readonly runId?: string;
}

/** The record of a bench run: the schema `typeset-bench/1`. */
export interface BenchRecord {
  readonly schema: "typeset-bench/1";
  readonly createdAt: string;
  readonly environment: BenchEnvironment;
  readonly config: { readonly rounds: number; readonly child: ChildOptions; readonly arms: readonly Arm[] };
  readonly processes: readonly ProcessRecord[];
  readonly arms: Readonly<Record<string, ArmSummary>>;
  /** The A/A pair: the median over the rounds of first / second, with its 90 % bootstrap interval. */
  readonly aa?: RatioEstimate & { readonly arms: readonly [string, string]; readonly perRound: readonly number[] };
}

/**
 * This function gives the order of the arms in a round. The order turns by one place each round.
 * In each second turn, it goes backward. Thus each arm is at each position the same number of times.
 */
export function roundOrder<T>(items: readonly T[], round: number): T[] {
  const n = items.length;
  const shift = round % n;
  const turned = [...items.slice(shift), ...items.slice(0, shift)];
  return Math.floor(round / n) % 2 === 1 ? turned.reverse() : turned;
}

/** This function reads the machine and the run from the process and the environment of GitHub Actions. */
export function environment(): BenchEnvironment {
  const env = process.env;
  const ci = env["CI"] === "true" || env["GITHUB_ACTIONS"] === "true";
  return {
    cpu: cpus()[0]?.model.trim() ?? "unknown",
    cores: cpus().length,
    memoryMb: Math.round(totalmem() / 2 ** 20),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    mode: ci ? "ci" : "local",
    ...(env["RUNNER_NAME"] === undefined ? {} : { runner: env["RUNNER_NAME"] }),
    ...(env["GITHUB_SHA"] === undefined ? {} : { commit: env["GITHUB_SHA"] }),
    ...(env["GITHUB_RUN_ID"] === undefined ? {} : { runId: env["GITHUB_RUN_ID"] }),
  };
}

const childPath = fileURLToPath(new URL("./child.ts", import.meta.url));

function runChild(config: BenchConfig, arm: Arm): ChildResult {
  const out = execFileSync(
    process.execPath,
    [
      childPath,
      "--module",
      config.module,
      "--case",
      arm.case,
      "--samples",
      String(config.child.samples),
      "--min-sample-ms",
      String(config.child.minSampleMs),
      "--warmup-ms",
      String(config.child.warmupMs),
    ],
    { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "inherit"] },
  );
  const line = out.trim().split("\n").pop() ?? "";
  const result = JSON.parse(line) as ChildResult;
  if (result.case !== arm.case || result.samples.length !== config.child.samples) {
    throw new Error(`the process of ${arm.arm} gave ${result.samples.length} samples of ${result.case}, not ${config.child.samples} of ${arm.case}`);
  }
  return result;
}

/**
 * This function starts the bench: in each round, one fresh process for each arm, in the order of `roundOrder`.
 * It throws when a process fails or a record is not complete. Thus a bench does not pass on missing data.
 */
export function runBench(config: BenchConfig): BenchRecord {
  if (config.arms.length === 0 || config.rounds < 1) throw new Error("the bench needs at least one arm and one round");
  const names = new Set(config.arms.map((a) => a.arm));
  if (names.size !== config.arms.length) throw new Error("two arms have the same name");
  if (config.aa !== undefined && !config.aa.every((a) => names.has(a))) throw new Error(`the A/A arms ${config.aa.join(", ")} are not arms of the bench`);
  const processes: ProcessRecord[] = [];
  for (let round = 0; round < config.rounds; round++) {
    roundOrder(config.arms, round).forEach((arm, position) => {
      const result = runChild(config, arm);
      const record: ProcessRecord = { ...result, round, position, arm: arm.arm, medianNs: median(result.samples) };
      processes.push(record);
      config.onProcess?.(record);
    });
  }
  if (processes.length !== config.rounds * config.arms.length) throw new Error(`the bench has ${processes.length} processes, not ${config.rounds * config.arms.length}`);
  const arms: Record<string, ArmSummary> = {};
  for (const arm of config.arms) {
    const medians = processes.filter((p) => p.arm === arm.arm).map((p) => p.medianNs);
    arms[arm.arm] = { processes: medians.length, medianNs: median(medians), processSpread: relativeSpread(medians) };
  }
  let aa: BenchRecord["aa"];
  if (config.aa !== undefined) {
    const [first, second] = config.aa;
    const perRound = Array.from({ length: config.rounds }, (_, round) => {
      const a = processes.find((p) => p.round === round && p.arm === first)!;
      const b = processes.find((p) => p.round === round && p.arm === second)!;
      return a.medianNs / b.medianNs;
    });
    aa = { arms: config.aa, perRound, ...medianWithInterval(perRound) };
  }
  return {
    schema: "typeset-bench/1",
    createdAt: new Date().toISOString(),
    environment: environment(),
    config: { rounds: config.rounds, child: config.child, arms: config.arms },
    processes,
    arms,
    ...(aa === undefined ? {} : { aa }),
  };
}
