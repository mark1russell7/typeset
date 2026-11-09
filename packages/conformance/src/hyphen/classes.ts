/**
 * The reference classes of the word lists. A reference class is a set of places where the list and the rule of the patterns
 * differ by a known rule of typography. The class comes from the word and the reference list only, not from the patterns.
 */
import { countMisses, scoreWords, share, type ListedWord, type MissCounts } from "./words.ts";

/** The share of the places of the list that the set must find after the class, from the plan of T14c. */
export const restTarget = 0.95;

/** The consonant letters of French. The letter `y` is a vowel letter of French, so it is not in this set. */
const consonants = "bcçdfghjklmnpqrstvwxz";

/** The last syllable of a mute `e`. Its onset is consonants, or consonants and the `u` of `gu` or `qu`. Its end is `e`, `es` or `ent`. */
const muteSyllable = new RegExp(`^(?:[${consonants}]*[gq]u|[${consonants}]+)(e|es|ent)$`, "u");

/** The phonetic forms of the reference list, for each word of a sample. `parseForms` reads them. */
export type Forms = ReadonlyMap<string, readonly string[]>;

/** This function reads a file of forms: each line has a word, then the phonetic forms of the word in the list. */
export function parseForms(text: string): Forms {
  const forms = new Map<string, readonly string[]>();
  for (const line of text.split(/\r?\n/u)) {
    const [word, ...phonetic] = line.split(" ").filter((cell) => cell !== "");
    if (word !== undefined) forms.set(word, phonetic);
  }
  return forms;
}

/**
 * This function gives the place of the class `mute-e` in a French word, or `undefined`. The place is the last place of the list
 * in the word when the last syllable is a mute `e` after its onset. The endings `e` and `es` are mute. The ending `ent` is mute only
 * in a verb form. A phonetic form of the word in Lexique that ends with the vowel `@` (`moment`) or with `nt` (`establishment`) keeps the word out.
 */
export function muteEPlace(word: ListedWord, phonetic: readonly string[]): number | undefined {
  const place = word.places.at(-1);
  if (place === undefined) return undefined;
  const ending = muteSyllable.exec(word.word.slice(place).toLowerCase())?.[1];
  if (ending === undefined) return undefined;
  if (ending === "ent" && (phonetic.length === 0 || phonetic.some((form) => form.endsWith("@") || form.endsWith("nt")))) return undefined;
  return place;
}

/** The result of a set on a list with a reference class. `docs/HYPHENATION.md` tells each field. */
export interface ClassReport {
  /** The share of the places of the full list that the set finds. */
  readonly found: number;
  /** The count of the places of the class within the limits: the places that the report leaves out. */
  readonly leftOut: number;
  /** The share of the other places of the list that the set finds. */
  readonly foundRest: number;
  readonly target: number;
  /** The count of the missed places that the class explains. */
  readonly explained: number;
  /** The missed places that the class does not explain, in each class and in each cause. */
  readonly rest: MissCounts & { readonly misses: number };
}

/** This function gives the hyphens of `given` at or after the place of the class `mute-e`. Each one breaks the rule of the class. */
export function muteEDefects(word: ListedWord, phonetic: readonly string[], given: readonly number[]): readonly number[] {
  const place = muteEPlace(word, phonetic);
  return place === undefined ? [] : given.filter((offset) => offset >= place);
}

/**
 * This function gives the hyphens of `given` between a `g` and an `n` when a phonetic form of the word has the sound `N`. That
 * sound is the digraph `gn` of `gagner`. In `stagner` and `diagnostic`, the letters `g` and `n` are two sounds, so the rule does not apply.
 */
function gnSplits(word: ListedWord, phonetic: readonly string[], given: readonly number[]): readonly number[] {
  if (!phonetic.some((form) => form.includes("N"))) return [];
  const lower = word.word.toLowerCase();
  return given.filter((offset) => lower[offset - 1] === "g" && lower[offset] === "n");
}

/** This function gives the splits of the digraph `gn` at a place that the list does not have. Each one is a defect. */
export function gnDigraphSplits(word: ListedWord, phonetic: readonly string[], given: readonly number[]): readonly number[] {
  return gnSplits(word, phonetic, given).filter((offset) => !word.places.includes(offset));
}

/**
 * This function gives the splits of the digraph `gn` at a place that the list has. There, two columns of the list disagree: the
 * syllables have the place, and the phonetic form has the sound `N`. Each one is a conflict inside the list, not a defect.
 */
export function gnDigraphConflicts(word: ListedWord, phonetic: readonly string[], given: readonly number[]): readonly number[] {
  return gnSplits(word, phonetic, given).filter((offset) => word.places.includes(offset));
}

/** A rule of a reference list: a set must not give a hyphen that breaks it. */
export interface ReferenceRule {
  readonly name: string;
  /** This function gives the hyphens of `given` that break the rule in the word. Each one is a defect. */
  readonly defects: (word: ListedWord, phonetic: readonly string[], given: readonly number[]) => readonly number[];
  /** This function gives the hyphens of `given` where the columns of the list disagree on the rule. The layer keeps them. */
  readonly conflicts?: (word: ListedWord, phonetic: readonly string[], given: readonly number[]) => readonly number[];
  /** The most conflicts on the full list. The limit is a ratchet: a rise needs a reason in its pull request. */
  readonly conflictLimit?: number;
}

/** A reference class: a rule with a place in each word of the class, which the report leaves out. */
export interface ReferenceClass extends ReferenceRule {
  readonly place: (word: ListedWord, phonetic: readonly string[]) => number | undefined;
}

/**
 * This function scores a set on a list, with the places of a class left out. The function `phoneticOf` gives the phonetic forms
 * of a word.
 */
export function classReport(words: readonly ListedWord[], hyphenate: (word: string) => readonly number[], covered: (word: string) => readonly number[] | undefined, left: number, right: number, reference: ReferenceClass, phoneticOf: (word: string) => readonly string[]): ClassReport {
  const full = scoreWords(words, hyphenate, left, right);
  const rest = words.map((word) => {
    const at = reference.place(word, phoneticOf(word.word));
    if (at === undefined || at < left || at > word.word.length - right) return word;
    return { word: word.word, places: word.places.filter((offset) => offset !== at) };
  });
  const kept = scoreWords(rest, hyphenate, left, right);
  const misses = kept.listed - kept.both;
  return {
    found: share(full.both, full.listed),
    leftOut: full.listed - kept.listed,
    foundRest: share(kept.both, kept.listed),
    target: restTarget,
    explained: full.listed - full.both - misses,
    rest: { misses, ...countMisses(rest, hyphenate, covered, left, right) },
  };
}

/** The count of the defects of a rule, with the layer and with the pinned set alone. It also lists the words with a conflict. */
export interface RuleCount {
  readonly defects: number;
  readonly pinnedDefects: number;
  readonly conflicts: readonly string[];
}

/**
 * This function counts the defects of each rule on a list. The hook `hyphenate` is the set with its layer, and the hook `pinned`
 * is the pinned set alone.
 */
export function countDefects(words: readonly ListedWord[], rules: readonly ReferenceRule[], hyphenate: (word: string) => readonly number[], pinned: (word: string) => readonly number[], phoneticOf: (word: string) => readonly string[]): Record<string, RuleCount> {
  const counts = Object.fromEntries(rules.map((rule) => [rule.name, { defects: 0, pinnedDefects: 0, conflicts: [] as string[] }]));
  for (const word of words) {
    const phonetic = phoneticOf(word.word);
    const given = hyphenate(word.word);
    const before = pinned(word.word);
    for (const rule of rules) {
      counts[rule.name]!.defects += rule.defects(word, phonetic, given).length;
      counts[rule.name]!.pinnedDefects += rule.defects(word, phonetic, before).length;
      if ((rule.conflicts?.(word, phonetic, given) ?? []).length > 0) counts[rule.name]!.conflicts.push(word.word);
    }
  }
  return counts;
}

/** The pinned file of a reference list. */
export interface ReferenceFile {
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
}

/** The reference rules of a language. */
export interface LanguageRules {
  /** The file in `data/hyphen` with the phonetic forms of the words of the sample that `reads` keeps. */
  readonly forms: string;
  /** This function tells if a rule can read the phonetic forms of the word. */
  readonly reads: (word: string) => boolean;
  /** The full reference list, which the gate downloads at each run. */
  readonly list: ReferenceFile;
  readonly classes: readonly ReferenceClass[];
  /** The rules with no class: each one is a guard, with 0 defects as its target. */
  readonly guards: readonly ReferenceRule[];
}

/** The reference rules of each language. `docs/HYPHENATION.md` tells the rule and the source of each rule. */
export const referenceRules: Readonly<Record<string, LanguageRules>> = {
  fr: {
    forms: "fr-forms.txt",
    reads: (word) => word.endsWith("ent") || word.includes("gn"),
    list: { name: "Lexique383.tsv", url: "https://www.lexique.org/databases/Lexique383/Lexique383.tsv", sha256: "637ba37a767a66679c48371d673ece50cbf541b49a4e40e598963d4f3fbce52b" },
    classes: [{ name: "mute-e", place: muteEPlace, defects: muteEDefects }],
    // The first count of conflicts on the full list is 15, at T14d.
    guards: [{ name: "gn-digraph", defects: gnDigraphSplits, conflicts: gnDigraphConflicts, conflictLimit: 15 }],
  },
};

/** This function gives each rule of a language: its classes, then its guards. */
export const rulesOf = (rules: LanguageRules): readonly ReferenceRule[] => [...rules.classes, ...rules.guards];
