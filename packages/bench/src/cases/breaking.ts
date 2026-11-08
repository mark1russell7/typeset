import { generateSample } from "@typeset/corpus";
import { balanced, greedy, knuthPlass, paragraphOf, type Breaker, type Paragraph } from "@mark1russell7/typeset/breaking";
import { hyphenate } from "@mark1russell7/typeset/hyphen/en-us";
import { lineBreaks } from "@mark1russell7/typeset/segmentation";
import { defineCase, type BenchCase, type CaseModule } from "../case.ts";

/** This function gives the width of a text in this module: 8 units for each code point. */
const widthOf = (text: string): number => 8 * [...text].length;

/** This function gives 1000 short Latin labels of the corpus: the samples 0 to 999 of the class `word`. */
const labels = (): string[] => Array.from({ length: 1000 }, (_, index) => generateSample(1, "latin", "word", index).text);

/** The stretch and the shrink of the glue of a justified paragraph: half and a third of the width of a space. */
const justified = { stretch: 4, shrink: 8 / 3 };

/** This function gives a case that breaks a page of Latin text at a width of 480 units with `breaker`. The options are for the glue. */
function breakCase(breaker: Breaker, glue: { readonly stretch?: number; readonly shrink?: number } = {}): BenchCase {
  return defineCase({
    setup: (): { paragraph: Paragraph } => ({ paragraph: paragraphOf(generateSample(1, "latin", "page", 0).text, { widthOf, ...glue }) }),
    run: (state) => breaker.breaks(state.paragraph, 480).length,
  });
}

/** The cases of the line breakers of `@mark1russell7/typeset/breaking`. Each case breaks the same page, so the cases compare the breakers. */
export const cases: CaseModule = {
  /** The paragraph model of a page of Latin text. */
  "breaking.paragraph": defineCase({
    setup: () => ({ text: generateSample(1, "latin", "page", 0).text }),
    run: (state) => paragraphOf(state.text, { widthOf }).items.length,
  }),
  /** The places of UAX #14 in a page of Latin text and in a page of Han text. */
  "breaking.line-breaks": defineCase({
    setup: () => ({ texts: [generateSample(1, "latin", "page", 0).text, generateSample(1, "han", "page", 0).text] }),
    run: (state) => state.texts.reduce((sum, text) => sum + lineBreaks(text).length, 0),
  }),
  /**
   * The places of UAX #14 in 1000 short labels, mostly one word. A first layout of new labels pays this cost (T12c). The fixed
   * cost of each use of `lineBreaks` is most of it.
   */
  "breaking.label-breaks": defineCase({
    setup: () => ({ labels: labels() }),
    run: (state) => state.labels.reduce((sum, label) => sum + lineBreaks(label).length, 0),
  }),
  /** The reference of `breaking.label-breaks`: a split of the same labels at white space. The ratio of the two cases is the measure of T12c. */
  "breaking.label-split": defineCase({
    setup: () => ({ labels: labels() }),
    run: (state) => state.labels.reduce((sum, label) => sum + label.split(/\s+/u).length, 0),
  }),
  "breaking.greedy": breakCase(greedy),
  "breaking.total-fit": breakCase(knuthPlass),
  "breaking.balanced": breakCase(balanced),
  /** Total fit on glue with stretch and shrink, so this case uses the adjustment ratio. */
  "breaking.justified": breakCase(knuthPlass, justified),
  /** The paragraph model of a page with the hyphen places of the set `en-us`. The table of the set loads in the setup. */
  "breaking.hyphens": defineCase({
    setup: () => {
      hyphenate("table");
      return { text: generateSample(1, "latin", "page", 0).text };
    },
    run: (state) => paragraphOf(state.text, { widthOf, hyphenate }).items.length,
  }),
};
