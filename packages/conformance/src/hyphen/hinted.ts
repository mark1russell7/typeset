/**
 * The part of a word list with a hint. In the Spanish Wiktionary, a module of rules makes the syllables of each entry. An editor
 * changes the result only with a hint, so the entries with a hint are the judgement of a person. This module scores a set on that
 * part, on each group of hints, and on the other entries of the main sample.
 */
import { bootstrap, type Interval } from "@mark1russell7/rigor-statistics";
import { fHalf, parseWords, scoreWords, share, type ListedWord, type WordScore } from "./words.ts";

/** The first parts of a hint with a group of their own: the most frequent first parts of the hints of `es`. */
const prefixGroups = ["des", "a", "en", "de", "re", "in", "sub"] as const;

/** The groups of a hint. A hint that marks a boundary goes to the group of its first part. A hint with other letters is a respelling. */
export const hintGroups: readonly ["des", "a", "en", "de", "re", "in", "sub", "other", "respelling"] = [...prefixGroups, "other", "respelling"];

/** The group of a hint. */
export type HintGroup = (typeof hintGroups)[number];

/** This function gives the letters of a text in lowercase, without the marks of the accents. */
function letters(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * This function gives the group of the hint of a word. The group is `respelling` when the letters of the hint, without its marks,
 * differ from the letters of the word. Else the group is the first part of the hint, or `other`.
 */
export function hintGroup(word: string, hint: string): HintGroup {
  if (letters(hint.replace(/[.\-\s]/gu, "")) !== letters(word)) return "respelling";
  const first = hint.includes("-") ? letters(hint.split("-")[0]!) : "";
  return (prefixGroups as readonly string[]).includes(first) ? (first as HintGroup) : "other";
}

/** The count of the entries and of the lemmas of a group. */
export interface GroupCount {
  readonly entries: number;
  readonly lemmas: number;
}

/** The file of the hints of a language: the counts of the part, its sample and the words of the main sample that are in the part. */
export interface HintFile {
  readonly schema: "typeset-hyphen-hints/1";
  readonly dump: { readonly name: string; readonly url: string; readonly sha256: string };
  /** The entries of the list with a hint, and their lemmas. The lemma of an inflected form is its word in `form_of` of the extract. */
  readonly counts: GroupCount & { readonly groups: Readonly<Record<HintGroup, GroupCount>> };
  /** The seed of the sample. The sample has one form of each lemma that it draws. */
  readonly seed: string;
  /** Each form of the sample with a hyphen at each place, and its group. */
  readonly sample: readonly (readonly [form: string, group: HintGroup])[];
  /** The words of the main sample whose entry has a hint. */
  readonly inMain: readonly string[];
}

/** The vowels of Spanish, with their accents. */
const vowels = new Set("aeiouáéíóúü");

/** The pairs of consonants that start a Spanish syllable. */
const onsets = new Set(["pr", "br", "tr", "dr", "cr", "gr", "fr", "pl", "bl", "cl", "gl", "fl"]);

/**
 * This function gives the syllable place that the spelling rules of the Real Academia Española accept in place of the boundary of a
 * prefix, or `undefined`. A prefix that ends with a consonant before a vowel, or before `l` or `r` of an onset, has a second place one
 * letter earlier: `des-am-pa-ro` or `de-sam-pa-ro`, `sub-ra-yar` or `su-bra-yar`.
 */
export function prefixAlternative(word: string, prefix: string): number | undefined {
  const lower = word.toLowerCase();
  if (!lower.startsWith(prefix) || prefix.length < 2 || vowels.has(prefix.at(-1)!)) return undefined;
  const next = lower[prefix.length];
  if (next === undefined) return undefined;
  return vowels.has(next) || onsets.has(`${prefix.at(-1)!}${next}`) ? prefix.length - 1 : undefined;
}

/**
 * This function changes the boundary place of the prefix of a listed word to its second place when the set gives the second place
 * and not the boundary. So the score counts each of the two places that the rules accept.
 */
export function withAlternative(entry: ListedWord, prefix: string, hyphenate: (word: string) => readonly number[]): ListedWord {
  const second = prefixAlternative(entry.word, prefix);
  if (second === undefined || !entry.places.includes(prefix.length)) return entry;
  const given = hyphenate(entry.word);
  if (given.includes(prefix.length) || !given.includes(second)) return entry;
  return { word: entry.word, places: entry.places.map((place) => (place === prefix.length ? second : place)) };
}

/** The rates of a set on a group of words. */
export interface PartRates {
  readonly words: number;
  readonly found: number;
  readonly confirmed: number;
  readonly fHalf: number;
}

/** The report of the part with a hint and of the part that the module makes alone. */
export interface HintedReport {
  readonly lemmas: number;
  readonly entries: number;
  readonly hinted: PartRates & {
    /** The bootstrap intervals over the words of the sample. The sample has one word for each lemma, so the bootstrap is over lemmas. */
    readonly intervals: { readonly found: Interval; readonly confirmed: Interval };
    readonly groups: Readonly<Record<HintGroup, PartRates>>;
    /** The rates of each prefix group when the second place of the prefix also counts. */
    readonly alternative: Readonly<Record<(typeof prefixGroups)[number], PartRates>>;
  };
  /** The words of the main sample whose entry has no hint. */
  readonly module: PartRates;
}

/** This function gives the rates of a score. */
function ratesOf(score: WordScore): PartRates {
  return { words: score.words, found: share(score.both, score.listed), confirmed: share(score.both, score.given), fHalf: fHalf(score) };
}

/** This function gives a rate of a list of word scores without the rounding of `share`, so a bootstrap sees each small difference. */
function rate(scores: readonly WordScore[], of: "found" | "confirmed"): number {
  let whole = 0;
  let part = 0;
  for (const score of scores) {
    whole += of === "found" ? score.listed : score.given;
    part += score.both;
  }
  return whole === 0 ? 0 : part / whole;
}

/**
 * This function scores a set on the part with a hint, on each group, and on the words of the main sample without a hint. The
 * function `hyphenate` and the limits `left` and `right` are those of the set.
 */
export function hintedReport(hints: HintFile, main: readonly ListedWord[], hyphenate: (word: string) => readonly number[], left: number, right: number, options: { readonly runs: number; readonly seed: string }): HintedReport {
  const sample = hints.sample.map(([form, group]) => ({ word: parseWords(form)[0]!, group }));
  const scores = sample.map(({ word }) => scoreWords([word], hyphenate, left, right));
  const all = scoreWords(sample.map(({ word }) => word), hyphenate, left, right);
  const groups = Object.fromEntries(hintGroups.map((group) => [group, ratesOf(scoreWords(sample.filter((entry) => entry.group === group).map(({ word }) => word), hyphenate, left, right))])) as Record<HintGroup, PartRates>;
  const alternative = Object.fromEntries(prefixGroups.map((prefix) => [prefix, ratesOf(scoreWords(sample.filter((entry) => entry.group === prefix).map(({ word }) => withAlternative(word, prefix, hyphenate)), hyphenate, left, right))])) as Record<(typeof prefixGroups)[number], PartRates>;
  const inMain = new Set(hints.inMain);
  const module = scoreWords(main.filter(({ word }) => !inMain.has(word)), hyphenate, left, right);
  return {
    lemmas: hints.counts.lemmas,
    entries: hints.counts.entries,
    hinted: {
      ...ratesOf(all),
      intervals: {
        found: bootstrap(scores, (resample) => rate(resample, "found"), { runs: options.runs, seed: `${options.seed}/found` }),
        confirmed: bootstrap(scores, (resample) => rate(resample, "confirmed"), { runs: options.runs, seed: `${options.seed}/confirmed` }),
      },
      groups,
      alternative,
    },
    module: ratesOf(module),
  };
}
