import { generateSample, type ScriptId } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { balanced, breakers, greedy, knuthPlass, linesOf, paragraphOf, raggedness, spread, totalFit, type Breaker, type Paragraph } from "./breaking.ts";
import { lineBreaks } from "./segmentation.ts";

/** The width of a text in this test: one unit for each code point. */
const count = (text: string): number => [...text].length;
const textsOf = (paragraph: Paragraph, breaker: Breaker, width: number): string[] => linesOf(paragraph, breaker.breaks(paragraph, width)).map((line) => line.text);

describe("paragraphOf", () => {
  it("makes a box for each word and one glue for each run of white space", () => {
    const { items } = paragraphOf("  ab \t cd\n", { widthOf: count });
    expect(items).toEqual([
      { type: "box", text: "ab", width: 2 },
      { type: "glue", text: " ", width: 1 },
      { type: "box", text: "cd", width: 2 },
    ]);
  });

  it("gives the same items with no break hook and with an empty break hook", () => {
    const options = { widthOf: count, hyphenate: () => [2] };
    expect(paragraphOf("abcd ef", { ...options, breaks: () => [] }).items).toEqual(paragraphOf("abcd ef", options).items);
  });

  it("puts a free penalty at each offset of the break hook, and this hook wins over a hyphen", () => {
    const { items } = paragraphOf("abcd", { widthOf: count, hyphenate: () => [1, 2], breaks: () => [2, 4, 0] });
    expect(items.map((item) => (item.type === "penalty" ? item.flagged : item.text))).toEqual(["a", true, "b", false, "cd"]);
    expect(items[3]).toEqual({ type: "penalty", text: "", width: 0, cost: 0, flagged: false });
  });

  it("breaks a Han text between ideographs through the hook of lineBreaks", () => {
    const breaks = (word: string): readonly number[] => lineBreaks(word).map((place) => place.offset);
    const paragraph = paragraphOf("日本語の文章", { widthOf: count, breaks });
    expect(textsOf(paragraph, greedy, 3)).toEqual(["日本語", "の文章"]);
    expect(textsOf(paragraphOf("日本語の文章", { widthOf: count }), greedy, 3)).toEqual(["日本語の文章"]);
  });

  it("puts a flagged penalty at each offset of the hyphenation hook", () => {
    const { items } = paragraphOf("abcd", { widthOf: count, hyphenate: () => [2, 0, 9, 2] });
    expect(items.map((item) => item.type)).toEqual(["box", "penalty", "box"]);
    expect(items[1]).toEqual({ type: "penalty", text: "-", width: 1, cost: 50, flagged: true });
  });

  it("gives one empty line for an empty text", () => {
    expect(linesOf(paragraphOf("", { widthOf: count }), [])).toEqual([{ text: "", width: 0, start: 0, end: 0 }]);
  });
});

describe("the greedy breaker", () => {
  it("fills each line while the words fit", () => {
    expect(textsOf(paragraphOf("aaa bb cc dddd e", { widthOf: count }), greedy, 6)).toEqual(["aaa bb", "cc", "dddd e"]);
  });

  it("keeps a word that is wider than a line on its own line", () => {
    expect(textsOf(paragraphOf("a bbbbbbbb c", { widthOf: count }), greedy, 4)).toEqual(["a", "bbbbbbbb", "c"]);
  });

  it("breaks at a hyphen when the rest of the word does not fit", () => {
    const paragraph = paragraphOf("aa bbbbcc", { widthOf: count, hyphenate: (word) => (word === "bbbbcc" ? [4] : []) });
    expect(textsOf(paragraph, greedy, 8)).toEqual(["aa bbbb-", "cc"]);
  });

  it("ends a line at a forced break", () => {
    const paragraph: Paragraph = {
      items: [
        { type: "box", text: "a", width: 1 },
        { type: "penalty", text: "", width: 0, cost: -Infinity, flagged: false },
        { type: "box", text: "b", width: 1 },
      ],
    };
    expect(textsOf(paragraph, greedy, 10)).toEqual(["a", "b"]);
    expect(textsOf(paragraph, knuthPlass, 10)).toEqual(["a", "b"]);
  });
});

describe("the total fit breaker", () => {
  it("moves a word to the next line when that makes the lines more equal", () => {
    const paragraph = paragraphOf("aaaa bb cc dddddd", { widthOf: count });
    expect(textsOf(paragraph, greedy, 7)).toEqual(["aaaa bb", "cc", "dddddd"]);
    expect(textsOf(paragraph, knuthPlass, 7)).toEqual(["aaaa", "bb cc", "dddddd"]);
    const greedyLines = linesOf(paragraph, greedy.breaks(paragraph, 7));
    const fitLines = linesOf(paragraph, knuthPlass.breaks(paragraph, 7));
    expect(raggedness(fitLines, 7)).toBeLessThan(raggedness(greedyLines, 7));
  });

  it("gives fewer lines with a larger line penalty", () => {
    const sample = generateSample(1, "latin", "paragraph", 0).text;
    const paragraph = paragraphOf(sample, { widthOf: count });
    const few = totalFit({ linePenalty: 1000 }).breaks(paragraph, 30).length;
    const many = totalFit({ linePenalty: 0 }).breaks(paragraph, 30).length;
    expect(few).toBeLessThanOrEqual(many);
  });
});

describe("the balanced breaker", () => {
  it("keeps the line count of greedy with more equal lines", () => {
    const paragraph = paragraphOf("aaaa bbbb cccc dd", { widthOf: count });
    expect(textsOf(paragraph, greedy, 14)).toEqual(["aaaa bbbb cccc", "dd"]);
    expect(textsOf(paragraph, balanced, 14)).toEqual(["aaaa bbbb", "cccc dd"]);
  });
});

describe("the breakers on the corpus", () => {
  const scripts: readonly ScriptId[] = ["latin", "greek", "cyrillic", "han", "kana"];
  const cases = scripts.flatMap((script) => [0, 1, 2].map((index) => generateSample(7, script, "paragraph", index).text));

  it("keeps each word and its order, and each line in the width unless it holds one box", () => {
    for (const text of cases) {
      const paragraph = paragraphOf(text, { widthOf: count });
      const words = text.split(/\s+/u).filter((word) => word !== "");
      for (const breaker of Object.values(breakers)) {
        for (const width of [12, 40]) {
          const lines = linesOf(paragraph, breaker.breaks(paragraph, width));
          expect(lines.flatMap((line) => line.text.split(" ")).filter((word) => word !== "")).toEqual(words);
          for (const line of lines) if (line.width > width) expect(line.text).not.toContain(" ");
        }
      }
    }
  });

  it("gives total fit at least the greedy line count, and balanced the same count with no larger spread", () => {
    for (const text of cases) {
      const paragraph = paragraphOf(text, { widthOf: count });
      const greedyLines = linesOf(paragraph, greedy.breaks(paragraph, 40));
      expect(knuthPlass.breaks(paragraph, 40).length + 1).toBeGreaterThanOrEqual(greedyLines.length);
      const balancedLines = linesOf(paragraph, balanced.breaks(paragraph, 40));
      expect(balancedLines.length).toBe(greedyLines.length);
      expect(Math.max(...balancedLines.map((line) => line.width))).toBeLessThanOrEqual(Math.max(...greedyLines.map((line) => line.width)));
      expect(spread(balancedLines)).toBeGreaterThanOrEqual(0);
    }
  });
});
