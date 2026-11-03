import { generateSample } from "@typeset/corpus";
import { balanced, greedy, knuthPlass, paragraphOf, type Breaker, type Paragraph } from "@mark1russell7/typeset/breaking";
import { defineCase, type BenchCase, type CaseModule } from "../case.ts";

/** This function gives the width of a text in this module: 8 units for each code point. */
const widthOf = (text: string): number => 8 * [...text].length;

/** This function gives a case that breaks a page of Latin text at a width of 480 units with `breaker`. */
function breakCase(breaker: Breaker): BenchCase {
  return defineCase({
    setup: (): { paragraph: Paragraph } => ({ paragraph: paragraphOf(generateSample(1, "latin", "page", 0).text, { widthOf }) }),
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
  "breaking.greedy": breakCase(greedy),
  "breaking.total-fit": breakCase(knuthPlass),
  "breaking.balanced": breakCase(balanced),
};
