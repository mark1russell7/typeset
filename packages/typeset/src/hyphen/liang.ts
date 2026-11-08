/**
 * The matcher of Liang: a word takes the digits of each pattern that it holds, and an odd digit marks a hyphen place. Each
 * language subpath gives its own data to this module, so the data of a language stays out of each other entry.
 */

/** The data of a language. */
export interface PatternSet {
  /** The patterns of Liang, with a space between them. A dot marks the start or the end of a word. */
  readonly patterns: string;
  /** The words with known hyphen places, with a hyphen at each place and a space between the words. */
  readonly exceptions: string;
  /** The least count of characters before a hyphen. */
  readonly left: number;
  /** The least count of characters after a hyphen. */
  readonly right: number;
}

/** The origin of a language set, and the result of the set on its word list. */
export interface HyphenSource {
  /** The language tag of the set. */
  readonly language: string;
  /** The file of the patterns, with the commit of its repository and its SHA-256. */
  readonly file: string;
  readonly commit: string;
  readonly sha256: string;
  /** The name of the license of the patterns. */
  readonly license: string;
  /** The result of the set on its word list. `docs/HYPHENATION.md` tells each field. */
  readonly words: {
    /** The name of the word list. */
    readonly list: string;
    /** This value is `true` when the word list does not come from the project of the patterns. */
    readonly independent: boolean;
    /** The count of words of the test. */
    readonly count: number;
    /** The hyphen places of the list that the set finds, from 0 to 1. */
    readonly found: number;
    /** The hyphen places of the set that the list holds, from 0 to 1. */
    readonly confirmed: number;
  };
}

/** The letters of a word for the patterns. An apostrophe is a letter, because the patterns of French use it. */
const letters = /[\p{L}\p{M}'’]+/gu;

/** This function gives the offsets of the hyphen places of a lowercase word, from the patterns. */
function placesOf(word: string, table: ReadonlyMap<string, string>, longest: number, set: PatternSet): number[] {
  const dotted = `.${word}.`;
  const digits = new Uint8Array(dotted.length + 1);
  for (let start = 0; start < dotted.length; start++) {
    const stop = Math.min(start + longest, dotted.length);
    for (let end = start + 1; end <= stop; end++) {
      const pattern = table.get(dotted.slice(start, end));
      if (pattern === undefined) continue;
      let place = start;
      for (const character of pattern) {
        if (character >= "0" && character <= "9") digits[place] = Math.max(digits[place]!, Number(character));
        else place++;
      }
    }
  }
  const places: number[] = [];
  for (let offset = set.left; offset <= word.length - set.right; offset++) if (digits[offset + 1]! % 2 === 1) places.push(offset);
  return places;
}

/**
 * This function gives the function for the `hyphenate` hook of `paragraphOf`. The function finds each run of letters of a word,
 * and it gives the hyphen places of each run. The table of the patterns comes at the first use, so an import costs no time.
 */
export function hyphenator(set: PatternSet): (word: string) => readonly number[] {
  const table = new Map<string, string>();
  const exceptions = new Map<string, number[]>();
  let longest = 0;
  const load = (): void => {
    for (const pattern of set.patterns.split(" ")) {
      const key = pattern.replace(/\d/gu, "");
      table.set(key, pattern);
      longest = Math.max(longest, key.length);
    }
    for (const entry of set.exceptions.split(" ").filter((text) => text !== "")) {
      const parts = entry.split("-");
      let offset = 0;
      exceptions.set(parts.join(""), parts.slice(0, -1).map((part) => (offset += part.length)));
    }
  };
  return (word) => {
    if (table.size === 0) load();
    const places: number[] = [];
    for (const match of word.matchAll(letters)) {
      const lower = match[0].toLowerCase().replaceAll("’", "'");
      // A lowercase form with another length has no offsets in the word. Such a run stays whole.
      if (lower.length !== match[0].length) continue;
      for (const offset of exceptions.get(lower) ?? placesOf(lower, table, longest, set)) places.push(match.index + offset);
    }
    return places;
  };
}
