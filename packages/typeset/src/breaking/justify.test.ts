import { generateSample, type ScriptId } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import before from "../../test/breaks-before.json" with { type: "json" };
import { beforePerScript, beforeScripts, fingerprints } from "../../test/breaks-before.ts";
import { adjustmentRatio, adjustmentRatios, breakers, greedy, isBreak, knuthPlass, lineStart, linesOf, paragraphOf, worstRatio, type Breaker, type Item, type Paragraph } from "../breaking.ts";
import { codePointPx, justifyReport, justifyWidths } from "./report.ts";

/** The width of a text in this test: one unit for each code point. */
const count = (text: string): number => [...text].length;
const textsOf = (paragraph: Paragraph, breaker: Breaker, width: number): string[] => linesOf(paragraph, breaker.breaks(paragraph, width)).map((line) => line.text);
const box = (text: string): Item => ({ type: "box", text, width: count(text) });

describe("stretch and shrink of glue", () => {
  // This file takes up to 8.4 s on a CI runner. One corpus test went over the default limit of 5 s on main at 79b7734
  it("puts the options on each glue, and no field without the options", () => {
    const { items } = paragraphOf("ab cd", { widthOf: count, stretch: 0.5, shrink: 0.25 });
    expect(items[1]).toEqual({ type: "glue", text: " ", width: 1, stretch: 0.5, shrink: 0.25 });
    expect(Object.keys(paragraphOf("ab cd", { widthOf: count }).items[1]!)).toEqual(["type", "text", "width"]);
    expect(Object.keys(paragraphOf("ab cd", { widthOf: count, stretch: 0, shrink: 0 }).items[1]!)).toEqual(["type", "text", "width"]);
  });

  it("gives the same breaks as the code before them, from each breaker, on 300 corpus paragraphs", { timeout: 60_000 }, () => {
    expect(beforeScripts.length * beforePerScript).toBeGreaterThanOrEqual(200);
    expect(Object.keys(before)).toHaveLength(108);
    expect(fingerprints(breakers)).toEqual(before);
    expect(fingerprints(breakers, { stretch: 0, shrink: 0 })).toEqual(before);
  });

  it("changes the breaks of total fit when the glue has stretch, so the fingerprints see the change", { timeout: 60_000 }, () => {
    const space = codePointPx(" ");
    const changed = fingerprints({ "total-fit": knuthPlass }, { stretch: space / 2, shrink: space / 3 });
    const same = Object.entries(changed).filter(([key, value]) => (before as Record<string, string>)[key] === value);
    expect(same.filter(([key]) => key.startsWith("latin/")).length).toBeLessThan(Object.keys(changed).filter((key) => key.startsWith("latin/")).length);
  });
});

describe("the adjustment ratio", () => {
  const { items } = paragraphOf("aa bb cc", { widthOf: count, stretch: 2, shrink: 0.5 });

  it("divides the free width by the stretch, or by the shrink of a line that is too wide", () => {
    expect(adjustmentRatio(items, 0, items.length, 8)).toBe(0);
    expect(adjustmentRatio(items, 0, items.length, 10)).toBe(0.5);
    expect(adjustmentRatio(items, 0, items.length, 7)).toBe(-1);
    expect(adjustmentRatio(items, 0, items.length, 6)).toBe(-2);
  });

  it("is infinite for a line that needs stretch or shrink and has none", () => {
    expect(adjustmentRatio(items, 0, 1, 4)).toBe(Infinity);
    expect(adjustmentRatio(items, 0, 1, 1)).toBe(-Infinity);
    expect(adjustmentRatio(items, 0, 1, 2)).toBe(0);
  });

  it("counts the text of a penalty at the end of a line", () => {
    const hyphen: Item = { type: "penalty", text: "-", width: 1, cost: 50, flagged: true };
    const glue: Item = { type: "glue", text: " ", width: 1, stretch: 1, shrink: 1 };
    expect(adjustmentRatio([box("a"), glue, box("b"), hyphen, box("c")], 0, 3, 4)).toBe(0);
  });
});

describe("the measures of the justified edge", () => {
  const paragraph = paragraphOf("aaa bbb cc d", { widthOf: count, stretch: 1, shrink: 0.5 });

  it("gives a ratio for each line, and the last line does not stretch", () => {
    const lines = linesOf(paragraph, [3]);
    expect(lines.map((line) => line.text)).toEqual(["aaa bbb", "cc d"]);
    expect(adjustmentRatios(paragraph, lines, 9)).toEqual([2, 0]);
    expect(adjustmentRatios(paragraph, lines, 3.75)).toEqual([-6.5, -0.5]);
    expect(adjustmentRatios(paragraph, [], 9)).toEqual([]);
  });

  it("takes the largest absolute ratio", () => {
    expect(worstRatio(paragraph, linesOf(paragraph, [3]), 9)).toBe(2);
    expect(worstRatio(paragraph, linesOf(paragraph, [3]), 7)).toBe(0);
    expect(worstRatio(paragraph, linesOf(paragraph, [3]), 6.75)).toBe(0.5);
    expect(worstRatio(paragraph, [], 9)).toBe(0);
  });
});

describe("total fit with the adjustment ratio", () => {
  it("chooses a line with shrink when its glue has the shrink for it", () => {
    const paragraph = paragraphOf("aaaaa bbbbb c", { widthOf: count, shrink: 1 });
    expect(textsOf(paragraph, knuthPlass, 10)).toEqual(["aaaaa bbbbb", "c"]);
  });

  it("does not choose a line that needs more shrink than its glue has", () => {
    const paragraph = paragraphOf("aaaaa bbbbb c", { widthOf: count, shrink: 0.5 });
    expect(textsOf(paragraph, knuthPlass, 10)).toEqual(["aaaaa", "bbbbb c"]);
  });

  it("does not choose a line that is too wide when a line with a high cost is possible", () => {
    // The line to the hyphen is too wide, and it has no break inside it. The cost of the other way is more than the largest badness.
    const glue: Item = { type: "glue", text: " ", width: 1, stretch: 3 };
    const hyphen: Item = { type: "penalty", text: "--", width: 2, cost: 0, flagged: false };
    const dear: Item = { type: "penalty", text: "", width: 0, cost: 1e9, flagged: false };
    const paragraph: Paragraph = { items: [box("a"), glue, box("aaaaaaaaa"), hyphen, box("b"), dear, box("ccccc")] };
    expect(adjustmentRatio(paragraph.items, 2, 3, 10)).toBe(-Infinity);
    expect(textsOf(paragraph, knuthPlass, 10)).toEqual(["a", "aaaaaaaaab", "ccccc"]);
  });

  it("stops at a line that is too wide also without the text of its penalty, so a long text with no glue ends", () => {
    // A page of Han text has a break place after each character and no glue. The search before T15 read each later
    // break of each line, so this paragraph did not end in 90 s.
    const free: Item = { type: "penalty", text: "", width: 0, cost: 0, flagged: false };
    const glue: Item = { type: "glue", text: " ", width: 1, stretch: 1, shrink: 0.5 };
    const items: Item[] = [box("a"), glue];
    for (let i = 0; i < 20_000; i++) items.push(box("x"), free);
    items.push(box("x"));
    const lines = textsOf({ items }, knuthPlass, 10);
    expect(lines).toHaveLength(2001);
    expect(lines.every((line) => count(line) <= 10)).toBe(true);
    expect(lines.join("")).toBe(`a ${"x".repeat(20_001)}`);
  });

  it("keeps a word that is wider than a line, because no set of breaks is feasible", () => {
    const paragraph = paragraphOf("a bbbbbbbb c", { widthOf: count, stretch: 1, shrink: 0.5 });
    expect(textsOf(paragraph, knuthPlass, 4)).toEqual(["a", "bbbbbbbb", "c"]);
  });

  it("does not stretch the last line", () => {
    const paragraph = paragraphOf("aaaa bbbb c", { widthOf: count, stretch: 1, shrink: 0.5 });
    expect(textsOf(paragraph, knuthPlass, 9)).toEqual(["aaaa bbbb", "c"]);
  });

  it("gives a short last line no cost, so a full line above it stays full", () => {
    const paragraph = paragraphOf("aaa bbb ccc ddd e", { widthOf: count, stretch: 0.5, shrink: 0.25 });
    expect(textsOf(paragraph, knuthPlass, 11)).toEqual(["aaa bbb ccc", "ddd e"]);
  });

  it("does not choose a line below -1 in a corpus paragraph that has a feasible set of breaks", { timeout: 60_000 }, () => {
    const scripts: readonly ScriptId[] = ["latin", "greek", "cyrillic"];
    let feasible = 0;
    let infeasible = 0;
    let tight = 0;
    for (const script of scripts) {
      for (let index = 0; index < 20; index++) {
        const { text } = generateSample(21, script, "paragraph", index);
        const hyphenate = (word: string): readonly number[] => (word.length > 5 ? [word.length - 3] : []);
        const paragraph = paragraphOf(text, { widthOf: count, hyphenate, stretch: 0.5, shrink: 1 / 3 });
        for (const width of [8, 11, 14, 24]) {
          const chosen = adjustmentRatios(paragraph, linesOf(paragraph, knuthPlass.breaks(paragraph, width)), width);
          if (hasFeasibleSet(paragraph, width)) {
            feasible++;
            expect(Math.min(...chosen)).toBeGreaterThanOrEqual(-1);
            if (Math.min(...chosen) < -0.5) tight++;
          } else {
            infeasible++;
            expect(Math.min(...chosen)).toBeLessThan(-1);
          }
        }
      }
    }
    expect(feasible).toBeGreaterThan(50);
    expect(infeasible).toBeGreaterThan(50);
    expect(tight).toBeGreaterThan(20);
  });
});

/** This function tells if a set of breaks has no line over its shrink. It does not use the code of the breaker. */
function hasFeasibleSet(paragraph: Paragraph, width: number): boolean {
  const { items } = paragraph;
  const nodes = [-1, ...items.keys().filter((index) => isBreak(items, index)), items.length];
  const reached = new Set([-1]);
  for (const [position, node] of nodes.entries()) {
    if (!reached.has(node)) continue;
    const start = node < 0 ? 0 : lineStart(items, node);
    for (const end of nodes.slice(position + 1)) if (adjustmentRatio(items, start, end, width) >= -1) reached.add(end);
  }
  return reached.has(items.length);
}

describe("the justified edge on the corpus", () => {
  const result = justifyReport();

  it("gives total fit a lower mean worst ratio than greedy on at least 200 paragraphs", () => {
    expect(result.paragraphs).toBeGreaterThanOrEqual(200);
    expect(result.cases).toBe(result.paragraphs * justifyWidths.length);
    expect(Number.isFinite(result.greedy)).toBe(true);
    expect(result.totalFit).toBeLessThan(result.greedy);
  });

  it("gains from the ratio, so the ragged cost of total fit is not sufficient for this result", () => {
    expect(result.totalFit).toBeLessThan(result.raggedTotalFit);
    expect(result.totalFitWithin).toBeGreaterThan(result.greedyWithin);
  });

  it("keeps each word and its order", () => {
    const { text } = generateSample(14, "latin", "paragraph", 0);
    const paragraph = paragraphOf(text, { widthOf: codePointPx, stretch: 5, shrink: 3 });
    for (const breaker of [greedy, knuthPlass]) expect(textsOf(paragraph, breaker, 300).join(" ")).toBe(text.split(/\s+/u).filter((word) => word !== "").join(" "));
  });
});
