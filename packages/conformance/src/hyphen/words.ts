import { hyphenator, type PatternSet } from "@mark1russell7/typeset/hyphen";

/** A word of a list, with the offsets of its hyphen places. */
export interface ListedWord {
  readonly word: string;
  readonly places: readonly number[];
}

/** The result of a language set on a word list. */
export interface WordScore {
  readonly words: number;
  /** The hyphen places of the list, also the places outside the left and right limits of the set. */
  readonly places: number;
  /** The hyphen places of the list within the left and right limits of the set. */
  readonly listed: number;
  /** The hyphen places that the set gives. */
  readonly given: number;
  /** The hyphen places in both. */
  readonly both: number;
}

/** This function reads the words of a list. A hyphen marks each place, and white space comes between the words. */
export function parseWords(text: string): ListedWord[] {
  return text.split(/\s+/u).filter((entry) => entry !== "").map((entry) => {
    const parts = entry.split("-");
    let offset = 0;
    return { word: parts.join(""), places: parts.slice(0, -1).map((part) => (offset += part.length)) };
  });
}

/** This function scores a `hyphenate` hook on a list. The limits `left` and `right` are the limits of the set. */
export function scoreWords(words: readonly ListedWord[], hyphenate: (word: string) => readonly number[], left: number, right: number): WordScore {
  let all = 0;
  let listed = 0;
  let given = 0;
  let both = 0;
  for (const { word, places } of words) {
    const allowed = new Set(places.filter((place) => place >= left && place <= word.length - right));
    const offsets = hyphenate(word);
    all += places.length;
    listed += allowed.size;
    given += offsets.length;
    both += offsets.filter((offset) => allowed.has(offset)).length;
  }
  return { words: words.length, places: all, listed, given, both };
}

/** This function gives a share with 4 decimals. */
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 10000) / 10000;
}

/**
 * This function gives the F-score of a score with beta 0.5, with 4 decimals. A wrong hyphen is an error on the page, but a missed place
 * is only a looser line. So this score gives precision (`confirmed`) more weight than recall (`found`).
 */
export function fHalf(score: WordScore): number {
  return share(1.25 * score.both, 0.25 * score.listed + score.given);
}

/** The classes of a missed place. A missed place is a place of the list within the limits that the set does not give. */
export const missClasses = ["shift", "silent", "other"] as const;

/** The class of a missed place. */
export type MissClass = (typeof missClasses)[number];

/**
 * This function gives the class of a missed place. The class is `shift` when the set gives a place one letter before or
 * after it. The class is `silent` when the set gives no place in the word. Else the class is `other`.
 */
export function missClass(place: number, given: readonly number[]): MissClass {
  if (given.some((offset) => Math.abs(offset - place) === 1)) return "shift";
  return given.length === 0 ? "silent" : "other";
}

/** The causes of a missed place, from the digits of the patterns at the place. */
export const missCauses = ["uncovered", "inhibited", "exception"] as const;

/** The cause of a missed place. */
export type MissCause = (typeof missCauses)[number];

/** The count of the missed places of a list in each class, and in each cause of each class. */
export type MissCounts = Readonly<Record<MissClass, number>> & { readonly causes: Readonly<Record<MissClass, Readonly<Record<MissCause, number>>>> };

/**
 * This function gives the function that gives the covered places of a word: the places where a pattern gives a digit. The set
 * changes each even digit `d` to `d - 1`. This change keeps the order of the digits, so the largest digit at a place is odd
 * when a pattern gives a digit there. The result is `undefined` for a word of the exceptions, because the patterns do not apply to it.
 */
export function coveredPlaces(set: PatternSet): (word: string) => readonly number[] | undefined {
  const exceptions = new Set(set.exceptions.split(" ").map((entry) => entry.replaceAll("-", "")));
  const cover = hyphenator({ ...set, patterns: set.patterns.replace(/[2468]/gu, (digit) => String(Number(digit) - 1)), exceptions: "" });
  return (word) => (exceptions.has(word.toLowerCase()) ? undefined : cover(word));
}

/**
 * This function gives the cause of a missed place from the covered places of its word. The cause is `exception` when the word is
 * an exception of the set. The cause is `inhibited` when a pattern gives an even digit at the place. Else the cause is `uncovered`.
 */
export function missCause(place: number, covered: readonly number[] | undefined): MissCause {
  if (covered === undefined) return "exception";
  return covered.includes(place) ? "inhibited" : "uncovered";
}

/**
 * This function counts the missed places of a list in each class and in each cause. The sum is `listed` minus `both` of
 * `scoreWords`. The function `covered` is the function of `coveredPlaces`.
 */
export function countMisses(words: readonly ListedWord[], hyphenate: (word: string) => readonly number[], covered: (word: string) => readonly number[] | undefined, left: number, right: number): MissCounts {
  const counts: Record<MissClass, number> = { shift: 0, silent: 0, other: 0 };
  const causes = Object.fromEntries(missClasses.map((name) => [name, { uncovered: 0, inhibited: 0, exception: 0 }])) as Record<MissClass, Record<MissCause, number>>;
  for (const { word, places } of words) {
    const offsets = hyphenate(word);
    const known = covered(word);
    for (const place of new Set(places.filter((place) => place >= left && place <= word.length - right))) {
      if (offsets.includes(place)) continue;
      const name = missClass(place, offsets);
      counts[name] += 1;
      causes[name][missCause(place, known)] += 1;
    }
  }
  return { ...counts, causes };
}
