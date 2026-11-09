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
 * in a verb form: each phonetic form of the word in Lexique must end without the vowel `@` (the vowel of `moment`).
 */
export function muteEPlace(word: ListedWord, phonetic: readonly string[]): number | undefined {
  const place = word.places.at(-1);
  if (place === undefined) return undefined;
  const ending = muteSyllable.exec(word.word.slice(place).toLowerCase())?.[1];
  if (ending === undefined) return undefined;
  if (ending === "ent" && (phonetic.length === 0 || phonetic.some((form) => form.endsWith("@")))) return undefined;
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
  /** The count of the hyphens of the set at or after the place of the class in a word of the class. Each one is a defect. */
  readonly defects: number;
  /** The count of the missed places that the class explains. */
  readonly explained: number;
  /** The missed places that the class does not explain, in each class and in each cause. */
  readonly rest: MissCounts & { readonly misses: number };
}

/** This function scores a set on a list, with the places of a class left out. The function `place` gives the place of the class in a word. */
export function classReport(words: readonly ListedWord[], hyphenate: (word: string) => readonly number[], covered: (word: string) => readonly number[] | undefined, left: number, right: number, place: (word: ListedWord) => number | undefined): ClassReport {
  const full = scoreWords(words, hyphenate, left, right);
  let defects = 0;
  const rest = words.map((word) => {
    const at = place(word);
    if (at === undefined || at < left || at > word.word.length - right) return word;
    defects += hyphenate(word.word).filter((offset) => offset >= at).length;
    return { word: word.word, places: word.places.filter((offset) => offset !== at) };
  });
  const kept = scoreWords(rest, hyphenate, left, right);
  const misses = kept.listed - kept.both;
  return {
    found: share(full.both, full.listed),
    leftOut: full.listed - kept.listed,
    foundRest: share(kept.both, kept.listed),
    target: restTarget,
    defects,
    explained: full.listed - full.both - misses,
    rest: { misses, ...countMisses(rest, hyphenate, covered, left, right) },
  };
}

/** A reference class of a language: its name, the file of its forms in `data/hyphen`, and the function of its place. */
export interface ReferenceClass {
  readonly name: string;
  readonly forms: string;
  readonly place: (word: ListedWord, phonetic: readonly string[]) => number | undefined;
}

/** The reference classes of each language. `docs/HYPHENATION.md` tells the rule and the source of each class. */
export const referenceClasses: Readonly<Record<string, readonly ReferenceClass[]>> = {
  fr: [{ name: "mute-e", forms: "fr-forms.txt", place: muteEPlace }],
};
