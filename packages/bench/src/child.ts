/**
 * The process of one case. The harness starts a fresh process of this file for each arm and each round.
 * The process writes one line of JSON (`ChildResult`) to the standard output. `freshArms` of rigor-bench reads it.
 */
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { timeArm } from "@mark1russell7/rigor-bench";
import type { BenchCase, CaseModule } from "./case.ts";

/** The result of one process. `freshArms` reads `ms` and `warm`, and keeps the other fields in `fields.extra`. */
export interface ChildResult {
  readonly case: string;
  /** The median time of one call of `run` over the samples, in milliseconds. */
  readonly ms: number;
  /** The count of calls of `run` in each sample. */
  readonly batch: number;
  /** The time of one call of `run`, in milliseconds, for each sample. */
  readonly samples: readonly number[];
  /** The median of the last half of the samples over the median of the first half. Only 2 samples or more give it. */
  readonly warm?: number;
}

/** The options of one process. */
export interface ChildOptions {
  readonly samples: number;
  /** The least time of one sample, in milliseconds. The process doubles the batch until a batch takes this time. */
  readonly minSampleMs: number;
  /** The time of the warm-up, in milliseconds. The process does not time the warm-up. */
  readonly warmupMs: number;
}

/**
 * This function times one case in this process with `timeArm` of rigor-bench. It counts each sample after the
 * calibration, as the old timer of this bench did.
 */
export function measure(name: string, benchCase: BenchCase, options: ChildOptions): ChildResult {
  const state = benchCase.setup();
  const time = timeArm(() => benchCase.run(state), { samples: options.samples, targetMs: options.minSampleMs, warmMs: options.warmupMs, warmSamples: 0 });
  return { case: name, ms: time.ms, batch: time.calls, samples: time.samples, ...(time.warm === undefined ? {} : { warm: time.warm }) };
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
  const benchCase = Object.hasOwn(cases, values.case) ? cases[values.case] : undefined;
  if (benchCase === undefined) throw new Error(`the module ${values.module} has no case ${values.case}`);
  const result = measure(values.case, benchCase, {
    samples: Number(values.samples),
    minSampleMs: Number(values["min-sample-ms"]),
    warmupMs: Number(values["warmup-ms"]),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

if (import.meta.main) await main();
