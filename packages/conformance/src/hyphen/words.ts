/** A word of a list, with the offsets of its hyphen places. */
export interface ListedWord {
  readonly word: string;
  readonly places: readonly number[];
}

/** The result of a language set on a word list. */
export interface WordScore {
  readonly words: number;
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
  let listed = 0;
  let given = 0;
  let both = 0;
  for (const { word, places } of words) {
    const allowed = new Set(places.filter((place) => place >= left && place <= word.length - right));
    const offsets = hyphenate(word);
    listed += allowed.size;
    given += offsets.length;
    both += offsets.filter((offset) => allowed.has(offset)).length;
  }
  return { words: words.length, listed, given, both };
}

/** This function gives a share with 4 decimals. */
export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 10000) / 10000;
}
