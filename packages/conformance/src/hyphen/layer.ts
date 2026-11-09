/**
 * The exception layer of a language. The layer gives each word of the full reference list where the pinned set breaks a reference
 * rule. Each entry keeps the hyphens of the pinned set, without the defects. The module of the language holds the entries as
 * exceptions. The gate makes the layer again at each run, so an update of the pinned set drops each entry that it corrects.
 */
import { hyphenator, type PatternSet } from "@mark1russell7/typeset/hyphen";
import { rulesOf, type LanguageRules } from "./classes.ts";
import type { ReferenceList } from "./lexique.ts";

/** One word of a layer, with the evidence of the reference list. */
export interface LayerEntry {
  readonly word: string;
  /** The word with a hyphen at each place that the module gives. */
  readonly hyphens: string;
  /** The names of the rules that the pinned set breaks in the word. */
  readonly rules: readonly string[];
  /** The syllables of the word in the reference list. */
  readonly syllables: string;
  /** The phonetic forms of the word in the reference list. */
  readonly phonetic: readonly string[];
}

/** The exception layer of a language. */
export interface Layer {
  readonly schema: "typeset-hyphen-layer/1";
  readonly language: string;
  readonly list: string;
  readonly entries: readonly LayerEntry[];
}

/** This function gives a word with a hyphen at each offset. */
export function marked(word: string, offsets: readonly number[]): string {
  let text = "";
  let start = 0;
  for (const offset of offsets) {
    text += `${word.slice(start, offset)}-`;
    start = offset;
  }
  return text + word.slice(start);
}

/** This function makes the layer of a language from its pinned set and its full reference list. Only a lowercase word can be an exception. */
export function makeLayer(language: string, pinned: PatternSet, list: ReferenceList, rules: LanguageRules): Layer {
  const hyphenate = hyphenator(pinned);
  const entries: LayerEntry[] = [];
  for (const word of list.words) {
    if (word.word !== word.word.toLowerCase()) continue;
    const phonetic = list.phonetic.get(word.word) ?? [];
    const given = hyphenate(word.word);
    const broken = rulesOf(rules).map((rule) => ({ name: rule.name, defects: rule.defects(word, phonetic, given) })).filter((rule) => rule.defects.length > 0);
    if (broken.length === 0) continue;
    const defects = new Set(broken.flatMap((rule) => rule.defects));
    entries.push({ word: word.word, hyphens: marked(word.word, given.filter((offset) => !defects.has(offset))), rules: broken.map((rule) => rule.name), syllables: list.syllables.get(word.word) ?? "", phonetic });
  }
  entries.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return { schema: "typeset-hyphen-layer/1", language, list: list.name, entries };
}

/** This function gives the set with the entries of a layer as exceptions, after the exceptions of the pinned set. */
export function withLayer(set: PatternSet, layer: Layer | undefined): PatternSet {
  if (layer === undefined || layer.entries.length === 0) return set;
  return { ...set, exceptions: [set.exceptions, ...layer.entries.map((entry) => entry.hyphens)].filter((text) => text !== "").join(" ") };
}
