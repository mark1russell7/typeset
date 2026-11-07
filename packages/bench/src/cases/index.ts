import type { Arm } from "../harness.ts";
import type { CaseModule } from "../case.ts";
import { cases as breaking } from "./breaking.ts";
import { cases as corpus } from "./corpus.ts";

/**
 * The case modules of the bench, by file name. `pnpm bench` starts each case of each module. A test fails when a
 * file of this folder is not in this list, so each case gets a run.
 */
export const modules: Readonly<Record<string, CaseModule>> = { "breaking.ts": breaking, "corpus.ts": corpus };

/** The cases of all modules in one record. The harness gets this module. Two modules do not use the same case name. */
export const cases: CaseModule = Object.assign({}, ...Object.values(modules)) as CaseModule;

/** The two arms of the A/A pair. They time the same case. */
export const aa: readonly [string, string] = ["corpus.generate", "corpus.generate#aa"];

/** The arms of the bench: one arm for each case, and the second arm of the A/A pair. */
export const arms: readonly Arm[] = [...Object.keys(cases).map((name) => ({ arm: name, case: name })), { arm: aa[1], case: aa[0] }];
