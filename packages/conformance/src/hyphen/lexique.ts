/** The reader of Lexique 3.83, the reference list of French. `draw.ts` and the gate read the same words. */
import { parseWords, type ListedWord } from "./words.ts";

/** The words of a reference list, with the places of each word and the phonetic forms of each word. */
export interface ReferenceList {
  /** The name of the list, with its version. */
  readonly name: string;
  /** Each word one time, with the places of its syllables. */
  readonly words: readonly ListedWord[];
  /** The syllables of each word, with a hyphen between them. */
  readonly syllables: ReadonlyMap<string, string>;
  /** The phonetic forms of each word, one time each, in the order of the list. */
  readonly phonetic: ReadonlyMap<string, readonly string[]>;
}

/**
 * This function reads the TSV file of Lexique 3.83. It keeps each word of letters only whose column `orthosyll` gives the same
 * letters. A word with more than one row keeps the syllables of its last row and the phonetic forms of all rows.
 */
export function parseLexique(text: string): ReferenceList {
  const syllables = new Map<string, string>();
  const phonetic = new Map<string, string[]>();
  for (const line of text.split("\n").slice(1)) {
    const cells = line.split("\t");
    const [word, syllable, form] = [cells[0] ?? "", cells[27] ?? "", cells[1] ?? ""];
    if (!/^\p{L}+$/u.test(word) || syllable.replaceAll("-", "") !== word) continue;
    syllables.set(word, syllable);
    const forms = phonetic.get(word) ?? [];
    if (!forms.includes(form)) forms.push(form);
    phonetic.set(word, forms);
  }
  return { name: "Lexique 3.83", words: parseWords([...syllables.values()].join(" ")), syllables, phonetic };
}
