import { generateSample } from "@typeset/corpus";
import { resolveText } from "@mark1russell7/typeset/bidi";
import { canvasSegments } from "@mark1russell7/typeset/fonts/inspect";
import { defineCase, type CaseModule } from "../case.ts";

/** This function gives a page of Arabic text and a page of Hebrew text. */
const pages = (): { texts: string[] } => ({ texts: [generateSample(1, "arabic", "page", 0).text, generateSample(1, "hebrew", "page", 0).text] });

/** The cases of the bidi rules. The two cases use the same pages, so they compare the exact table with the classes of `./fonts`. */
export const cases: CaseModule = {
  /** The levels of the two pages with the exact table, in the paragraph direction `auto`. */
  "bidi.resolve-text": defineCase({
    setup: pages,
    run: (state) => state.texts.reduce((sum, text) => sum + resolveText(text).levels.length, 0),
  }),
  /** The segments of the two pages, which apply the same rules with the classes of `./fonts`. */
  "fonts.canvas-segments": defineCase({
    setup: pages,
    run: (state) => state.texts.reduce((sum, text) => sum + canvasSegments(text).length, 0),
  }),
};
