import { generateSample } from "@typeset/corpus";
import { wordBreaks, wordBreaksOf } from "@mark1russell7/typeset/segmentation";
import { defineCase, type CaseModule } from "../case.ts";

/** This function gives the 1465 words of the 1000 short Latin labels of the corpus: the samples 0 to 999 of the class `word`. */
const words = (): string[] =>
  Array.from({ length: 1000 }, (_, index) => generateSample(1, "latin", "word", index).text)
    .flatMap((label) => label.split(/\s+/u))
    .filter((word) => word.length > 0);

/** The cases of the word boundaries of `@mark1russell7/typeset/segmentation`. The two cases take the same words, so their ratio is the measure of T12d. */
export const cases: CaseModule = {
  /** The word boundaries of each word with one use of `wordBreaks` for each word. */
  "segmentation.word-each": defineCase({
    setup: () => ({ words: words() }),
    run: (state) => state.words.reduce((sum, word) => sum + wordBreaks(word).length, 0),
  }),
  /** The word boundaries of the same words with one use of `wordBreaksOf` for all of them. */
  "segmentation.word-batch": defineCase({
    setup: () => ({ words: words() }),
    run: (state) => wordBreaksOf(state.words).reduce((sum, breaks) => sum + breaks.length, 0),
  }),
};
