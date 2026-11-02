/**
 * The process of one case. The harness starts a fresh process of this file for each case and each round.
 * The process writes one line of JSON (`ChildResult`) to the standard output.
 */
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { BenchCase, CaseModule } from "./case.ts";

/** The result of one process. */
export interface ChildResult {
  readonly case: string;
  /** The count of calls of `run` in each sample. */
  readonly batch: number;
  /** The time of one call of `run`, in nanoseconds, for each sample. */
  readonly samples: readonly number[];
}

/** The options of one process. */
export interface ChildOptions {
  readonly samples: number;
  /** The minimum time of one sample, in milliseconds. The process doubles the batch until a batch takes this time. */
  readonly minSampleMs: number;
  /** The time of the warm-up, in milliseconds. The process does not time the warm-up. */
  readonly warmupMs: number;
}

let sink: unknown;

function timeBatch(benchCase: BenchCase, state: unknown, batch: number): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < batch; i++) sink = benchCase.run(state);
  return Number(process.hrtime.bigint() - start);
}

/** This function times one case in this process. */
export function measure(name: string, benchCase: BenchCase, options: ChildOptions): ChildResult {
  const state = benchCase.setup();
  const warmupEnd = process.hrtime.bigint() + BigInt(Math.round(options.warmupMs * 1e6));
  let runs = 0;
  while (runs < 5 || process.hrtime.bigint() < warmupEnd) {
    sink = benchCase.run(state);
    runs++;
  }
  let batch = 1;
  while (timeBatch(benchCase, state, batch) < options.minSampleMs * 1e6 && batch < 2 ** 30) batch *= 2;
  const samples: number[] = [];
  for (let i = 0; i < options.samples; i++) samples.push(timeBatch(benchCase, state, batch) / batch);
  if (sink === Symbol.for("never")) console.error("sink");
  return { case: name, batch, samples };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      module: { type: "string" },
      case: { type: "string" },
      samples: { type: "string", default: "15" },
      "min-sample-ms": { type: "string", default: "5" },
      "warmup-ms": { type: "string", default: "300" },
    },
  });
  if (values.module === undefined || values.case === undefined) throw new Error("give --module <path> and --case <name>");
  const cases = ((await import(pathToFileURL(values.module).href)) as { cases: CaseModule }).cases;
  const benchCase = cases[values.case] as BenchCase | undefined;
  if (benchCase === undefined) throw new Error(`the module ${values.module} has no case ${values.case}`);
  const result = measure(values.case, benchCase, {
    samples: Number(values.samples),
    minSampleMs: Number(values["min-sample-ms"]),
    warmupMs: Number(values["warmup-ms"]),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (import.meta.main) await main();
