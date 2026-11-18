import { balancedRounds as balancedCount, mergeCaseModules } from "@mark1russell7/rigor-bench";
import type { CaseArm } from "@mark1russell7/rigor-bench/fresh";
import type { CaseModule } from "../case.ts";
import { cases as bidi } from "./bidi.ts";
import { cases as breaking } from "./breaking.ts";
import { cases as corpus } from "./corpus.ts";
import { cases as fonts } from "./fonts.ts";
import { cases as measurer, fontFixtures, fontFolder } from "./measurer.ts";
import { cases as segmentation } from "./segmentation.ts";

/**
 * The case modules of the bench, by file name. `pnpm bench` starts each case of each module. A test fails when a
 * file of this folder is not in this list, so each case gets a run.
 */
export const modules: Readonly<Record<string, CaseModule>> = { "bidi.ts": bidi, "breaking.ts": breaking, "corpus.ts": corpus, "fonts.ts": fonts, "measurer.ts": measurer, "segmentation.ts": segmentation };

const merged = mergeCaseModules(modules);

/** The cases of all modules in one record. The harness gets this module. `mergeCaseModules` refuses a case name in two modules. */
export const cases: CaseModule = merged.cases;

/** The file name of the module of each case. */
export const moduleOf: Readonly<Record<string, string>> = merged.moduleOf;

/** The cases that read the pinned font files of the folder `TYPESET_FONTS`. Without the folder, their setup throws. */
export const fontCases: ReadonlySet<string> = new Set(Object.keys(measurer));

export { fontFixtures, fontFolder };

/** The two arms of the A/A pair. They time the same case. */
export const aa: readonly [string, string] = ["corpus.generate", "corpus.generate#aa"];

/** The arms of the bench: one arm for each case, and the second arm of the A/A pair. */
export const arms: readonly CaseArm[] = [...Object.keys(cases).map((name) => ({ id: name, case: name })), { id: aa[1], case: aa[0] }];

/**
 * The count of rounds of a balanced run: 2 times the count of arms. In this count of rounds, `armOrder` of rigor-bench
 * puts each arm at each position 2 times, one time in each direction.
 */
export const balancedRounds: number = balancedCount(arms.length);

/**
 * The arms of a run: each arm of `arms` with an id in `ids`, in the order of `arms`. An empty list gives all arms.
 * The function throws on an unknown id, on an id two times and on a list without the 2 arms of the A/A pair.
 */
export function pickArms(ids: readonly string[]): readonly CaseArm[] {
  if (ids.length === 0) return arms;
  const known = new Set(arms.map((arm) => arm.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`the bench has no arm ${unknown.join(", ")}`);
  const picked = new Set(ids);
  if (picked.size !== ids.length) throw new Error("the list of arms has an arm two times");
  const missing = aa.filter((id) => !picked.has(id));
  if (missing.length > 0) throw new Error(`the list of arms needs the 2 arms of the A/A pair, and ${missing.join(", ")} is not in it`);
  return arms.filter((arm) => picked.has(arm.id));
}
