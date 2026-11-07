import { scriptIds } from "@typeset/corpus";
import type { Font } from "@mark1russell7/typeset/fonts";
import { describe, expect, it } from "vitest";
import { fontStacks, markTexts, missingInStack, mixedTexts, stackCells, stackFont, stackRecords, type FontStack, type StackRecord } from "./stacks.ts";

/** This function makes a font that has the glyphs of a text. The test needs only the method `glyph`. */
const fontWith = (text: string): Font => ({ glyph: (code: number) => (text.includes(String.fromCodePoint(code)) ? 1 : 0) }) as unknown as Font;

const stack: FontStack = { id: "s", fonts: ["noto-sans", "noto-sans-sc"], scripts: ["latin", "han"] };

const record = (over: Partial<StackRecord>): StackRecord => ({ stack: "s", sample: "a", kind: "mixed", size: 16, codePoints: 1, missing: 0, canvas: 10, model: 10, error: 0, ...over });

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

  it("keeps a text with a missing code point, and the cell counts it as excluded", () => {
    const records = stackRecords(stack, [fontWith("a")], [{ id: "x", kind: "mixed", text: "ab" }], [16], [[12]], () => 12.5);
    expect(records).toEqual([{ stack: "s", sample: "x", kind: "mixed", size: 16, codePoints: 2, missing: 1, canvas: 12, model: 12.5, error: 0.5 }]);
    expect(stackCells(records)).toEqual([{ stack: "s", size: 16, n: 0, excluded: 1, worst64: 0 }]);
  });

  it("gives the worst error of a cell in 1/64 px, and a cell for each size", () => {
    const cells = stackCells([record({ sample: "a", error: 0.01 }), record({ sample: "b", error: -0.5 }), record({ size: 24, error: 0 })]);
    expect(cells).toEqual([
      { stack: "s", size: 16, n: 2, excluded: 0, worst64: 32, worstSample: "b" },
      { stack: "s", size: 24, n: 1, excluded: 0, worst64: 0, worstSample: "a" },
    ]);
  });
});
