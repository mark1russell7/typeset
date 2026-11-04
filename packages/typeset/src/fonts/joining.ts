/**
 * The joining of the Arabic shaper. This module follows `hb-ot-shaper-arabic.cc` of HarfBuzz. It has the joining types of
 * the characters and the state machine that gives the form of each letter. It also has the order of the GSUB features.
 * The table of the joining types comes from `ArabicShaping.txt` of the Unicode Character Database, version 18.0.0.
 * It covers the Arabic, Syriac, NKo and Mandaic blocks, with their supplements and extensions.
 */

/** The joining form of a letter, as the tag of the GSUB feature that makes it. */
export type JoiningForm = "isol" | "fina" | "fin2" | "fin3" | "medi" | "med2" | "init";

/** The forms in the order of the features of the shaper. The index of a form gives its bit in a feature mask. */
export const joiningFeatures: readonly JoiningForm[] = ["isol", "fina", "fin2", "fin3", "medi", "med2", "init"];

/** The OpenType script tags that use the joining of the Arabic shaper in this model. */
export const joiningScripts: readonly string[] = ["arab", "syrc"];

// The columns of the state machine of HarfBuzz: the joining types U, L, R and D (C is D), and the Syriac joining groups.
// The type L is the column 1. No character of these blocks has the type L.
const U = 0;
const R = 2;
const D = 3;
const ALAPH = 4;
const DALATH_RISH = 5;
/** The joining type T: a transparent character, for example a mark. The state machine does not see it. */
const T = 6;

/**
 * The joining types of `ArabicShaping.txt`. Each triple has the first code point, the last code point and the type.
 * The type `C` (join causing) is `D` here, as in HarfBuzz. A code point that is not in the table has the type `U`.
 * When its general category is `Mn`, `Me` or `Cf`, it has the type `T`.
 */
const joiningTable: readonly number[] = [
  0x600, 0x605, U, 0x608, 0x608, U, 0x60b, 0x60b, U, 0x620, 0x620, D, 0x621, 0x621, U, 0x622, 0x625, R, 0x626, 0x626, D,
  0x627, 0x627, R, 0x628, 0x628, D, 0x629, 0x629, R, 0x62a, 0x62e, D, 0x62f, 0x632, R, 0x633, 0x63f, D, 0x640, 0x640, D,
  0x641, 0x647, D, 0x648, 0x648, R, 0x649, 0x64a, D, 0x66e, 0x66f, D, 0x671, 0x673, R, 0x674, 0x674, U, 0x675, 0x677, R,
  0x678, 0x687, D, 0x688, 0x699, R, 0x69a, 0x6bf, D, 0x6c0, 0x6c0, R, 0x6c1, 0x6c2, D, 0x6c3, 0x6cb, R, 0x6cc, 0x6cc, D,
  0x6cd, 0x6cd, R, 0x6ce, 0x6ce, D, 0x6cf, 0x6cf, R, 0x6d0, 0x6d1, D, 0x6d2, 0x6d3, R, 0x6d5, 0x6d5, R, 0x6dd, 0x6dd, U,
  0x6ee, 0x6ef, R, 0x6fa, 0x6fc, D, 0x6ff, 0x6ff, D, 0x70f, 0x70f, T, 0x710, 0x710, ALAPH, 0x712, 0x714, D,
  0x715, 0x716, DALATH_RISH, 0x717, 0x719, R, 0x71a, 0x71d, D, 0x71e, 0x71e, R, 0x71f, 0x727, D, 0x728, 0x728, R,
  0x729, 0x729, D, 0x72a, 0x72a, DALATH_RISH, 0x72b, 0x72b, D, 0x72c, 0x72c, R, 0x72d, 0x72e, D, 0x72f, 0x72f, DALATH_RISH,
  0x74d, 0x74d, R, 0x74e, 0x758, D, 0x759, 0x75b, R, 0x75c, 0x76a, D, 0x76b, 0x76c, R, 0x76d, 0x770, D, 0x771, 0x771, R,
  0x772, 0x772, D, 0x773, 0x774, R, 0x775, 0x777, D, 0x778, 0x779, R, 0x77a, 0x77f, D, 0x7ca, 0x7ea, D, 0x7fa, 0x7fa, D,
  0x840, 0x840, R, 0x841, 0x845, D, 0x846, 0x847, R, 0x848, 0x848, D, 0x849, 0x849, R, 0x84a, 0x853, D, 0x854, 0x854, R,
  0x855, 0x855, D, 0x856, 0x858, R, 0x860, 0x860, D, 0x861, 0x861, U, 0x862, 0x865, D, 0x866, 0x866, U, 0x867, 0x867, R,
  0x868, 0x868, D, 0x869, 0x86a, R, 0x870, 0x882, R, 0x883, 0x885, D, 0x886, 0x886, D, 0x887, 0x888, U, 0x889, 0x88d, D,
  0x88e, 0x88e, R, 0x88f, 0x88f, D, 0x890, 0x891, U, 0x8a0, 0x8a9, D, 0x8aa, 0x8ac, R, 0x8ad, 0x8ad, U, 0x8ae, 0x8ae, R,
  0x8af, 0x8b0, D, 0x8b1, 0x8b2, R, 0x8b3, 0x8b8, D, 0x8b9, 0x8b9, R, 0x8ba, 0x8c8, D, 0x8e2, 0x8e2, U, 0x180e, 0x180e, U, 0x200c, 0x200c, U,
  0x200d, 0x200d, D,
];

const transparent = /[\p{Mn}\p{Me}\p{Cf}]/u;

/** This function gives the joining type of a code point: a column of the state machine, or `T`. */
function joiningType(codePoint: number): number {
  let low = 0;
  let high = joiningTable.length / 3 - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (codePoint < joiningTable[middle * 3]!) high = middle - 1;
    else if (codePoint > joiningTable[middle * 3 + 1]!) low = middle + 1;
    else return joiningTable[middle * 3 + 2]!;
  }
  return transparent.test(String.fromCodePoint(codePoint)) ? T : U;
}

// The actions of the state machine: the index of a form in `joiningFeatures`, or NONE
const ISOL = 0;
const FINA = 1;
const FIN2 = 2;
const FIN3 = 3;
const MEDI = 4;
const MED2 = 5;
const INIT = 6;
const NONE = 7;

/**
 * The state machine of `arabic_state_table` of HarfBuzz. Each row is a state, with one entry for each column. An entry
 * has the action for the previous letter, the action for the current letter and the next state.
 */
const states: readonly (readonly (readonly [number, number, number])[])[] = [
  // State 0: the previous letter was U, and it does not join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 6]],
  // State 1: the previous letter was R, or ISOL ALAPH, and it does not join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, FIN2, 5], [NONE, ISOL, 6]],
  // State 2: the previous letter was D or L in the form ISOL, and it can join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [INIT, FINA, 1], [INIT, FINA, 3], [INIT, FINA, 4], [INIT, FINA, 6]],
  // State 3: the previous letter was D in the form FINA, and it can join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [MEDI, FINA, 1], [MEDI, FINA, 3], [MEDI, FINA, 4], [MEDI, FINA, 6]],
  // State 4: the previous letter was FINA ALAPH, and it does not join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [MED2, ISOL, 1], [MED2, ISOL, 2], [MED2, FIN2, 5], [MED2, ISOL, 6]],
  // State 5: the previous letter was FIN2 or FIN3 ALAPH, and it does not join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [ISOL, ISOL, 1], [ISOL, ISOL, 2], [ISOL, FIN2, 5], [ISOL, ISOL, 6]],
  // State 6: the previous letter was DALATH or RISH, and it does not join
  [[NONE, NONE, 0], [NONE, ISOL, 2], [NONE, ISOL, 1], [NONE, ISOL, 2], [NONE, FIN3, 5], [NONE, ISOL, 6]],
];

/**
 * This function gives the joining form of each code point of a text, in logical order. A transparent character, for
 * example a mark, and a character that does not join get `undefined`. The text before and after the code points is not
 * known, so the function sees it as a character of the type U.
 */
export function joiningForms(codePoints: readonly number[]): (JoiningForm | undefined)[] {
  const actions: number[] = codePoints.map(() => NONE);
  let previous = -1;
  let state = 0;
  codePoints.forEach((codePoint, i) => {
    const type = joiningType(codePoint);
    if (type === T) return;
    const [previousAction, currentAction, next] = states[state]![type]!;
    if (previousAction !== NONE && previous >= 0) actions[previous] = previousAction;
    actions[i] = currentAction;
    previous = i;
    state = next;
  });
  return actions.map((action) => joiningFeatures[action]);
}

/**
 * One stage of the GSUB features of the Arabic shaper. The lookups of one stage go in the order of the lookup list.
 * A stage with a `form` applies only to the glyphs of that joining form.
 */
export interface JoiningStage {
  readonly features: readonly string[];
  readonly form?: JoiningForm;
}

/**
 * This function gives the stages of the Arabic shaper of HarfBuzz for a list of features. The stages are `ccmp` and
 * `locl`, then each joining form alone, then `rlig`, then `calt`, then the other features. When the font has `rclt`,
 * `calt` and the other features are one stage, as in HarfBuzz. The list `features` gives the features apart from the
 * joining forms, so a feature that is not in the list is not in a stage.
 */
export function joiningStages(features: readonly string[], hasRclt: boolean): JoiningStage[] {
  const take = (tags: readonly string[]) => features.filter((tag) => tags.includes(tag));
  const first = ["ccmp", "locl"];
  const rest = features.filter((tag) => !first.includes(tag) && tag !== "rlig" && (hasRclt || tag !== "calt"));
  const stages: JoiningStage[] = [{ features: take(first) }, ...joiningFeatures.map((form) => ({ features: [form], form })), { features: take(["rlig"]) }];
  if (!hasRclt) stages.push({ features: take(["calt"]) });
  stages.push({ features: rest });
  return stages.filter((stage) => stage.features.length > 0);
}
