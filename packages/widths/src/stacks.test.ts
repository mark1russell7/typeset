import { scriptIds } from "@typeset/corpus";
import type { Font } from "@mark1russell7/typeset/fonts";
import { describe, expect, it } from "vitest";
import { drawnTexts, fontStacks, markTexts, missingInStack, missingRuns, mixedTexts, runTexts, stackCells, stackFont, stackRecords, type FontStack, type StackRecord } from "./stacks.ts";

/** This function makes a font that has the glyphs of a text. The test needs only the method `glyph`. */
const fontWith = (text: string): Font => ({ glyph: (code: number) => (text.includes(String.fromCodePoint(code)) ? 1 : 0) }) as unknown as Font;

const stack: FontStack = { id: "s", fonts: ["noto-sans", "noto-sans-sc"], scripts: ["latin", "han"] };

const record = (over: Partial<StackRecord>): StackRecord => ({ stack: "s", sample: "a", kind: "mixed", size: 16, codePoints: 1, missing: 0, words: 1, missingWords: 0, canvas: 10, model: 10, error: 0, runError: 0, residual: 0, ...over });

describe("the stacks", () => {
  it("has at least 4 lists of at least 2 fonts", () => {
    expect(fontStacks.length).toBeGreaterThanOrEqual(4);
    for (const value of fontStacks) expect(value.fonts.length).toBeGreaterThanOrEqual(2);
  });

  it("uses only scripts of the corpus", () => {
    for (const value of fontStacks) for (const script of value.scripts) expect(scriptIds).toContain(script);
  });

  it("gives the canvas a CSS list in the order of the stack", () => {
    expect(stackFont(stack, 16)).toBe('400 16px "typeset-noto-sans", "typeset-noto-sans-sc"');
  });
});

describe("mixedTexts", () => {
  const all = [{ glyph: () => 1 } as unknown as Font];

  it("skips each word with a code point that no font of the list has", () => {
    const latinOnly = [{ glyph: (code: number) => (/\p{Script=Han}/u.test(String.fromCodePoint(code)) ? 0 : 1) } as unknown as Font];
    expect(() => mixedTexts(stack, 1, latinOnly)).toThrow(/no word of han/);
    for (const { text } of mixedTexts(stack, 1, all)) expect(missingInStack(all, text)).toBe(0);
  });

  it("gives the same texts for a seed, and different texts for each index", () => {
    const texts = mixedTexts(stack, 1, all);
    expect(mixedTexts(stack, 1, all)).toEqual(texts);
    expect(new Set(texts.map((text) => text.text)).size).toBe(texts.length);
  });

  it("has Latin and Han in each text", () => {
    for (const { text } of mixedTexts(stack, 1, all)) {
      expect(text).toMatch(/\p{Script=Latin}/u);
      expect(text).toMatch(/\p{Script=Han}/u);
    }
  });
});

describe("drawnTexts", () => {
  const latinOnly = [{ glyph: (code: number) => (/\p{Script=Han}/u.test(String.fromCodePoint(code)) ? 0 : 1) } as unknown as Font];

  it("keeps each word as the corpus draws it, with the words of the mixed texts when the fonts cover them", () => {
    const all = [{ glyph: () => 1 } as unknown as Font];
    const drawn = drawnTexts(stack, 1);
    expect(drawn.map((text) => text.text)).toEqual(mixedTexts(stack, 1, all).map((text) => text.text));
    expect(drawn.every((text) => text.kind === "drawn" && text.id.startsWith("s:drawn:"))).toBe(true);
    expect(drawn.every(({ text }) => missingInStack(latinOnly, text) > 0)).toBe(true);
  });
});

describe("missingRuns", () => {
  it("gives each longest run of clusters that no font has, and keeps a mark in its cluster", () => {
    const runs = missingRuns([fontWith("ab ")], "xa xy b z");
    expect(runs).toEqual([{ before: "", run: "x" }, { before: " ", run: "xy" }, { before: " ", run: "z" }]);
    expect(runTexts(runs)).toEqual(["x", " xy", " ", " z"]);
    expect(missingRuns([fontWith("ab")], "ab")).toEqual([]);
    expect(missingRuns([fontWith("a")], "áa")).toEqual([{ before: "", run: "á" }]);
  });
});

describe("markTexts", () => {
  it("takes a mark that only a later font with the base has", () => {
    const texts = markTexts(stack, [fontWith("a"), fontWith("a॑")]);
    expect(texts.map((text) => text.text)).toEqual(["a॑ a"]);
  });

  it("leaves out a mark of the first font, and a later font with no base", () => {
    expect(markTexts(stack, [fontWith("a॑"), fontWith("a॑")])).toEqual([]);
    expect(markTexts(stack, [fontWith("a"), fontWith("॑")])).toEqual([]);
  });
});

describe("the records", () => {
  it("counts a code point only when no font of the list has it", () => {
    expect(missingInStack([fontWith("a"), fontWith("b")], "abc")).toBe(1);
  });

  it("keeps a covered text with a missing code point, and the covered cell counts it as excluded", () => {
    const runCanvas = [new Map([["ab", 12], ["a", 6]])];
    const records = stackRecords(stack, [fontWith("a")], [{ id: "x", kind: "mixed", text: "ab" }], [16], [[12]], () => 12.5, runCanvas);
    expect(records).toEqual([{ stack: "s", sample: "x", kind: "mixed", size: 16, codePoints: 2, missing: 1, words: 1, missingWords: 1, canvas: 12, model: 12.5, error: 0.5, runError: -6, residual: 6.5 }]);
    expect(stackCells(records)).toEqual([{ stack: "s", set: "covered", size: 16, n: 0, excluded: 1, worst64: 0 }]);
  });

  it("keeps each uncovered text, and takes the error of its missing runs, each after its cluster, out of the cell", () => {
    // The model gives "a b" 3 px, " b" 2 px and " " 0.5 px. The canvas gives "a b" 4 px, and " b" 3 px with a system font for "b".
    const model: Record<string, number> = { "a b": 3, " b": 2, " ": 0.5 };
    const advance = (text: string): number => model[text]!;
    const records = stackRecords(stack, [fontWith("a ")], [{ id: "y", kind: "drawn", text: "a b" }], [16], [[4]], advance, [new Map([[" b", 3], [" ", 0.5]])]);
    expect(records[0]).toMatchObject({ missing: 1, words: 2, missingWords: 1, error: -1, runError: -1, residual: 0 });
    expect(stackCells(records)).toEqual([{ stack: "s", set: "uncovered", size: 16, n: 1, excluded: 0, worst64: 0, worstSample: "y", missingTexts: 1, words: 2, missingWords: 1 }]);
  });

  it("refuses a text with a missing run that has no canvas width", () => {
    expect(() => stackRecords(stack, [fontWith("a")], [{ id: "x", kind: "drawn", text: "ab" }], [16], [[12]], () => 12.5)).toThrow(/no canvas width of the missing run "ab"/);
  });

  it("gives the worst error of a cell in 1/64 px, and a cell for each size", () => {
    const cells = stackCells([record({ sample: "a", error: 0.01 }), record({ sample: "b", error: -0.5 }), record({ size: 24, error: 0 })]);
    expect(cells).toEqual([
      { stack: "s", set: "covered", size: 16, n: 2, excluded: 0, worst64: 32, worstSample: "b" },
      { stack: "s", set: "covered", size: 24, n: 1, excluded: 0, worst64: 0, worstSample: "a" },
    ]);
  });
});
