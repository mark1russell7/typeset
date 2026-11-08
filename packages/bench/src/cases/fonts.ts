import { indicSyllables } from "@mark1russell7/typeset/fonts/inspect";
import { defineCase, type BenchCase, type CaseModule } from "../case.ts";

/** This function gives a case that divides a Devanagari word of `count` code points into syllables. The word has no break. */
function syllablesCase(count: number): BenchCase {
  return defineCase({
    // Ka and the vowel sign i, again and again: each pair is a syllable, and no code point has the category X
    setup: (): { word: string } => ({ word: "कि".repeat(count / 2) }),
    run: (state) => indicSyllables(state.word).length,
  });
}

/**
 * The cases of the font model. The two cases of the Indic syllables compare a word with 4 times the code points. A
 * linear search takes 4 times the time, and a quadratic search 16 times.
 */
export const cases: CaseModule = {
  "fonts.indic-500": syllablesCase(500),
  "fonts.indic-2000": syllablesCase(2000),
};
