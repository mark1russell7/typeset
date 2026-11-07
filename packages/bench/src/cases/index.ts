import type { Arm } from "../harness.ts";
import type { CaseModule } from "../case.ts";
import { cases as breaking } from "./breaking.ts";
import { cases as corpus } from "./corpus.ts";
import { cases as measurer, fontFolder } from "./measurer.ts";

/**
 * The case modules of the bench, by file name. `pnpm bench` starts each case of each module. A test fails when a
 * file of this folder is not in this list, so each case gets a run.
 */
export const modules: Readonly<Record<string, CaseModule>> = { "breaking.ts": breaking, "corpus.ts": corpus, "measurer.ts": measurer };

/** The cases of all modules in one record. The harness gets this module. Two modules do not use the same case name. */
export const cases: CaseModule = Object.assign({}, ...Object.values(modules)) as CaseModule;

/** The cases that read the pinned font files of the folder `TYPESET_FONTS`. Without the folder, their setup throws. */
export const fontCases: ReadonlySet<string> = new Set(Object.keys(measurer));

export { fontFolder };

/** The two arms of the A/A pair. They time the same case. */
export const aa: readonly [string, string] = ["corpus.generate", "corpus.generate#aa"];

/** The arms of the bench: one arm for each case, and the second arm of the A/A pair. */
export const arms: readonly Arm[] = [...Object.keys(cases).map((name) => ({ arm: name, case: name })), { arm: aa[1], case: aa[0] }];

/**
 * The count of rounds of a balanced run: 2 times the count of arms. `roundOrder` turns the order by one place each round,
 * and goes backward after each count of arms. So in this count of rounds, each arm is at each position 2 times, one time in each direction.
 */
export const balancedRounds = 2 * arms.length;
