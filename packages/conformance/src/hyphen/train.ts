/**
 * The training of a pattern set with `patgen` on one half of a word list, and the score of the set on the other half. A seeded
 * hash of each word gives its half, so each run gives the same halves. `docs/HYPHENATION.md` tells the rule.
 */
import { seedOf } from "@mark1russell7/rigor-generators";
import { bootstrap, type Interval } from "@mark1russell7/rigor-statistics";
import { share } from "./words.ts";

/** One level of `patgen`: the lengths of the new patterns and the weights of the choice. */
export interface TrainLevel {
  /** The least length and the most length of a new pattern. */
  readonly lengths: readonly [number, number];
  /** The weight of a correct place that a pattern finds. */
  readonly good: number;
  /** The weight of a wrong place that a pattern gives. */
  readonly bad: number;
  /** The least score of a new pattern. */
  readonly threshold: number;
}

/** The parameters of a training: the seed of the halves, the limits of the set and the levels of `patgen`. */
export interface TrainParams {
  readonly schema: "typeset-hyphen-train-params/1";
  readonly language: string;
  /** The seed of the hash that puts each word in a half. */
  readonly seed: string;
  /** The least count of characters before a hyphen. */
  readonly left: number;
  /** The least count of characters after a hyphen. */
  readonly right: number;
  /** The levels of `patgen`, from level 1. An odd level adds places, and an even level removes wrong places. */
  readonly levels: readonly TrainLevel[];
}

/** The words of a list in the form of `patgen`, with the count of words that the list gives in two different forms. */
export interface ListedForms {
  /** Each word with a hyphen at each place, for example `ab-sinth`, sorted. */
  readonly forms: readonly string[];
  /** The count of words with two or more different forms. The training and the score do not use these words. */
  readonly conflicts: number;
}

/** This function gives the forms of a list. It removes each word that the list gives in two or more different forms. */
export function listedForms(entries: readonly string[]): ListedForms {
  const byWord = new Map<string, Set<string>>();
  for (const entry of entries) {
    const word = entry.replaceAll("-", "");
    const forms = byWord.get(word) ?? new Set<string>();
    forms.add(entry);
    byWord.set(word, forms);
  }
  const kept = [...byWord.values()].filter((forms) => forms.size === 1).map((forms) => [...forms][0]!);
  return { forms: kept.sort(), conflicts: byWord.size - kept.length };
}

/** This function is true when a word is in the held-out half. The half is a seeded hash of the word, so it does not depend on the order of the list. */
export function isHeldOut(word: string, seed: string): boolean {
  return (seedOf(`${seed}/${word}`) & 1) === 1;
}

/** This function puts each form in the training half or in the held-out half. */
export function splitForms(forms: readonly string[], seed: string): { readonly train: readonly string[]; readonly heldOut: readonly string[] } {
  const train: string[] = [];
  const heldOut: string[] = [];
  for (const form of forms) (isHeldOut(form.replaceAll("-", ""), seed) ? heldOut : train).push(form);
  return { train, heldOut };
}

/** This function gives the translate file of `patgen`: the limits, and one line for each letter of the forms. */
export function translateFile(forms: readonly string[], left: number, right: number): string {
  const letters = [...new Set(forms.join("").replaceAll("-", ""))].sort();
  const limit = (value: number): string => String(value).padStart(2, " ");
  return `${limit(left)}${limit(right)}\n${letters.map((letter) => ` ${letter} ${letter.toUpperCase()} \n`).join("")}`;
}

/** This function gives the answers of `patgen` for one level. The run of a level reads the patterns of the level before it. */
export function levelAnswers(level: TrainLevel, index: number): string {
  return `${index} ${index}\n${level.lengths[0]} ${level.lengths[1]}\n${level.good} ${level.bad} ${level.threshold}\nn\n`;
}

/** This function gives the patterns of an output file of `patgen`, with a space between them. */
export function patgenPatterns(text: string): string {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "").join(" ");
}

/** The counts of one word for two sets: the places of the list within the limits, and the places that each set gives. */
export interface WordCounts {
  readonly listed: number;
  readonly given: readonly [number, number];
  readonly both: readonly [number, number];
}

/** The rates of one set on a list. */
export interface SetRates {
  readonly found: number;
  readonly confirmed: number;
  readonly fHalf: number;
}

/** The comparison of a candidate set with a baseline set on one list. */
export interface Comparison {
  readonly words: number;
  readonly candidate: SetRates;
  readonly baseline: SetRates;
  /** The paired bootstrap interval of `found` of the candidate minus `found` of the baseline, over the words. */
  readonly foundGain: Interval;
  /** The paired bootstrap interval of `confirmed` of the candidate minus `confirmed` of the baseline, over the words. */
  readonly confirmedGain: Interval;
}

/** This function gives the counts of each word for a candidate hook and a baseline hook, within the limits `left` and `right`. */
export function wordCounts(forms: readonly string[], candidate: (word: string) => readonly number[], baseline: (word: string) => readonly number[], left: number, right: number): WordCounts[] {
  return forms.map((form) => {
    const parts = form.split("-");
    const word = parts.join("");
    let offset = 0;
    const allowed = new Set(parts.slice(0, -1).map((part) => (offset += part.length)).filter((place) => place >= left && place <= word.length - right));
    const a = candidate(word);
    const b = baseline(word);
    return { listed: allowed.size, given: [a.length, b.length], both: [a.filter((place) => allowed.has(place)).length, b.filter((place) => allowed.has(place)).length] };
  });
}

/** This function gives the rates of the set `side` (0 is the candidate, 1 is the baseline) over the counts. */
export function ratesOf(counts: readonly WordCounts[], side: 0 | 1): SetRates {
  let listed = 0;
  let given = 0;
  let both = 0;
  for (const count of counts) {
    listed += count.listed;
    given += count.given[side];
    both += count.both[side];
  }
  return { found: share(both, listed), confirmed: share(both, given), fHalf: share(1.25 * both, 0.25 * listed + given) };
}

/** This function gives a rate without the rounding of `share`, so a bootstrap sees each small difference. */
function rate(counts: readonly WordCounts[], side: 0 | 1, of: "found" | "confirmed"): number {
  let whole = 0;
  let part = 0;
  for (const count of counts) {
    whole += of === "found" ? count.listed : count.given[side];
    part += count.both[side];
  }
  return whole === 0 ? 0 : part / whole;
}

/** This function compares a candidate with a baseline on the counts, with a paired bootstrap over the words. */
export function compareSets(counts: readonly WordCounts[], options: { readonly runs: number; readonly seed: string }): Comparison {
  const gain = (of: "found" | "confirmed") => (sample: readonly WordCounts[]): number => rate(sample, 0, of) - rate(sample, 1, of);
  return {
    words: counts.length,
    candidate: ratesOf(counts, 0),
    baseline: ratesOf(counts, 1),
    foundGain: bootstrap(counts, gain("found"), { runs: options.runs, seed: `${options.seed}/found` }),
    confirmedGain: bootstrap(counts, gain("confirmed"), { runs: options.runs, seed: `${options.seed}/confirmed` }),
  };
}

/** This function gives the forms of the `\hyphenation` list of a TeX file. It keeps only the forms of lowercase letters. */
export function texExceptionForms(text: string): { readonly forms: readonly string[]; readonly skipped: number } {
  const plain = text.split(/\r?\n/u).map((line) => line.replace(/%.*$/u, "")).join("\n");
  const start = plain.indexOf("{", plain.indexOf("\\hyphenation"));
  const entries = plain.slice(start + 1, plain.indexOf("}", start)).split(/\s+/u).filter((entry) => entry !== "");
  const forms = entries.filter((entry) => /^[a-z]+(?:-[a-z]+)*$/u.test(entry));
  return { forms, skipped: entries.length - forms.length };
}

/**
 * This function gives the entries of Webster's Unabridged Dictionary of 1913, as Project Gutenberg gives it. Each entry is a line
 * with one headword in capitals, then a line that starts with the word and its marks. The marks `*`, `"` and `` ` `` divide the
 * syllables. The function keeps only the words of lowercase letters whose letters agree with the headword.
 */
export function websterEntries(text: string): readonly string[] {
  const lines = text.split(/\r?\n/u);
  const entries: string[] = [];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const head = lines[index]!;
    if (!/^[A-Z]+$/u.test(head)) continue;
    const marked = lines[index + 1]!.split(/[,;\s(]/u)[0]!.toLowerCase();
    const form = marked.replace(/["*`]+/gu, "-").replace(/^-+|-+$/gu, "");
    if (/^[a-z]+(?:-[a-z]+)*$/u.test(form) && form.replaceAll("-", "") === head.toLowerCase()) entries.push(form);
  }
  return entries;
}

/** This function gives a hook of a list: the places of the form of each word, within the limits. A word out of the list has no place. */
export function formHook(forms: readonly string[], left: number, right: number): (word: string) => readonly number[] {
  const places = new Map<string, number[]>();
  for (const form of forms) {
    const parts = form.split("-");
    const word = parts.join("");
    let offset = 0;
    places.set(word, parts.slice(0, -1).map((part) => (offset += part.length)).filter((place) => place >= left && place <= word.length - right));
  }
  return (word) => places.get(word) ?? [];
}

/** This function keeps the forms of `forms` whose word is in the list `other`. */
export function sharedForms(forms: readonly string[], other: readonly string[]): readonly string[] {
  const words = new Set(other.map((form) => form.replaceAll("-", "")));
  return forms.filter((form) => words.has(form.replaceAll("-", "")));
}
