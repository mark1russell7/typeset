import { applyEdits, generateCorpus, generateEdits, generateSample } from "@typeset/corpus";
import { defineCase, type CaseModule } from "../case.ts";

/** The cases of the corpus generator. Later items of the roadmap add their cases in their own modules. */
export const cases: CaseModule = {
  /** The generation of the corpus at seed 1 with one sample per cell: 12 scripts and 4 length classes. */
  "corpus.generate": defineCase({
    setup: () => ({ seed: 1 }),
    run: (state) => generateCorpus({ seed: state.seed, perCell: 1 }).length,
  }),
  /** The generation and the application of 200 edits on a paragraph of Latin text. */
  "corpus.edits": defineCase({
    setup: () => {
      const base = generateSample(1, "latin", "paragraph", 0).text;
      return { base };
    },
    run: (state) => applyEdits(state.base, generateEdits({ seed: 1, script: "latin", base: state.base, count: 200 })).length,
  }),
};
