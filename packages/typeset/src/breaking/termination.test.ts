// The termination gate of the breakers (roadmap item T15b). It counts the item reads of each breaker on three families of
// input that have few places to stretch: text with no glue, text where each break is a penalty, and boxes wider than a line.
// The seeded generators of `@mark1russell7/rigor-generators` give the characters, through the corpus of each script.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateSample, scriptIds, type ScriptId } from "@typeset/corpus";
import { breakers, type Breaker, type Item, type Paragraph } from "../breaking.ts";

/** The width of each character, in units. */
const unit = 8;

/**
 * The bound of the reads, for each item and each square of the line length. The worst ratio over the 12 scripts was 0.12 for
 * greedy, 0.58 for total fit and 4.1 for balanced, which runs total fit at a number of widths.
 */
const factor = 8;

const families = ["no-glue", "all-penalty", "wide-boxes"] as const;
type Family = (typeof families)[number];

/** One input of the gate. */
interface StepCase {
  readonly family: Family;
  readonly script: ScriptId;
  readonly seed: number;
  readonly index: number;
  /** When true, the paragraph starts with a glue that stretches and shrinks, so total fit uses the cost of a justified edge. */
  readonly justified: boolean;
  /** The width of a line, in characters. */
  readonly chars: number;
}

/**
 * This function gives the paragraph of a case:
 * - `no-glue`: a box for each character, with a free break between two boxes, as in a text of Han.
 * - `all-penalty`: a box for each character, with a break that adds a hyphen between two boxes.
 * - `wide-boxes`: a box for each word, with glue between the words, so most boxes are wider than a line.
 */
function stepParagraph(c: StepCase): Paragraph {
  const text = generateSample(c.seed, c.script, "paragraph", c.index).text;
  const items: Item[] = c.justified ? [{ type: "box", text: "a", width: unit }, { type: "glue", text: " ", width: unit, stretch: unit / 2, shrink: unit / 3 }] : [];
  if (c.family === "wide-boxes") {
    for (const word of text.split(/\s+/u).filter((w) => w !== "")) {
      if (items.length > 0) items.push({ type: "glue", text: " ", width: unit });
      items.push({ type: "box", text: word, width: unit * [...word].length });
    }
    return { items };
  }
  const free: Item = { type: "penalty", text: "", width: 0, cost: 0, flagged: false };
  const hyphen: Item = { type: "penalty", text: "-", width: unit, cost: 50, flagged: true };
  [...text.replace(/\s+/gu, "")].forEach((character, i) => {
    if (i > 0 || c.justified) items.push(c.family === "no-glue" ? free : hyphen);
    items.push({ type: "box", text: character, width: unit });
  });
  return { items };
}

/** This function gives the bound of the reads: linear in the item count, for a line of `chars` characters. */
function stepBound(items: number, chars: number): number {
  // A line holds `chars` boxes and the breaks between them. The search of a line reads up to the next break after it.
  const line = 2 * chars + 3;
  return factor * items * line * line;
}

/** The error of a breaker that reads more items than its bound. */
class StepLimit extends Error {}

/** This function counts the item reads of a breaker. It throws `StepLimit` at the read after `limit`, so a long search stops at once. */
function countReads(breaker: Breaker, paragraph: Paragraph, width: number, limit: number): number {
  let reads = 0;
  const items = new Proxy(paragraph.items as Item[], {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/u.test(key) && ++reads > limit) throw new StepLimit(`${breaker.name} read more than ${limit} items`);
      return Reflect.get(target, key, receiver);
    },
  });
  breaker.breaks({ items }, width);
  return reads;
}

const stepCase: fc.Arbitrary<StepCase> = fc.record({
  family: fc.constantFrom(...families),
  script: fc.constantFrom(...scriptIds),
  seed: fc.integer({ min: 1, max: 1_000_000 }),
  index: fc.integer({ min: 0, max: 9 }),
  justified: fc.boolean(),
  chars: fc.integer({ min: 1, max: 12 }),
});

describe("the termination of the breakers", () => {
  for (const [name, breaker] of Object.entries(breakers)) {
    it(`${name} reads a number of items that is linear in the item count, on text with no glue, all penalties or wide boxes`, { timeout: 60_000 }, () => {
      fc.assert(
        fc.property(stepCase, (c) => {
          // A wide box is wider than a line only when the line holds 1 to 4 characters
          const chars = c.family === "wide-boxes" ? 1 + (c.chars % 4) : c.chars;
          const paragraph = stepParagraph(c);
          const limit = stepBound(paragraph.items.length, chars);
          expect(countReads(breaker, paragraph, unit * chars, limit)).toBeLessThanOrEqual(limit);
        }),
        { seed: 15, numRuns: 80 },
      );
    });
  }

  it("covers each family in each script", () => {
    for (const family of families) {
      for (const script of scriptIds) {
        const paragraph = stepParagraph({ family, script, seed: 1, index: 0, justified: false, chars: 1 });
        expect(paragraph.items.length, `${family}/${script}`).toBeGreaterThanOrEqual(family === "wide-boxes" ? 1 : 200);
      }
    }
  });
});
