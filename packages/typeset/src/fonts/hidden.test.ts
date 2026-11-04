import { describe, expect, it } from "vitest";
import { Bytes, coverage, fontOf, lookup, pairs, single, substitutionTable } from "../../test/fonts.ts";
import { glyphAdvances, measureWidth, widthBound, type MeasureOptions } from "./index.ts";

const text = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const A = 0x41;
const V = 0x56;
const ZWJ = 0x200d;

const rows: readonly MeasureOptions[] = [
  { script: "latn", shaping: "canvas", rounding: "pixel" },
  { script: "latn", shaping: "canvas", rounding: "exact", sum: "float32" },
  { script: "latn", shaping: "canvas", rounding: "exact" },
  { script: "latn" },
  { script: "latn", rounding: "pixel" },
];

describe("a default ignorable", () => {
  // Each code point is a default ignorable of HarfBuzz: the ends of the ranges of `hb-unicode.hh`
  const ignorables = [0xad, 0x34f, 0x61c, 0x17b4, 0x17b5, 0x180b, 0x180f, 0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x206f, 0xfe00, 0xfe0f, 0xfeff, 0xfff0, 0xfff8, 0x1d173, 0x1d17a, 0xe0000, 0xe0fff];

  it("takes no advance when the font has no glyph for it", () => {
    const font = fontOf({ gpos: null });
    for (const options of rows) {
      for (const codePoint of ignorables) expect(measureWidth(font, text(A, codePoint, V), 16, options), codePoint.toString(16)).toBe(measureWidth(font, "AV", 16, options));
    }
  });

  it("takes no advance when the font has a glyph for it", () => {
    const font = fontOf({ gpos: null, map: [[A, 1], [V, 2], [ZWJ, 3]] });
    for (const options of rows) expect(measureWidth(font, text(A, ZWJ, V), 16, options)).toBe(measureWidth(font, "AV", 16, options));
    // The result keeps the own glyph of the code point, with the advance 0
    expect(glyphAdvances(font, text(A, ZWJ, V), { script: "latn" })).toEqual({ glyphs: [1, 3, 2], advances: [600, 0, 580] });
  });

  it("gives the kerning of the pair around it, as HarfBuzz does", () => {
    const font = fontOf({ gpos: pairs([[1, 2, -80]]), map: [[A, 1], [V, 2], [ZWJ, 3]] });
    for (const options of rows) {
      expect(measureWidth(font, text(A, 0xfe0f, V), 16, options)).toBe(measureWidth(font, "AV", 16, options));
      expect(measureWidth(font, text(A, ZWJ, V), 16, options)).toBe(measureWidth(font, "AV", 16, options));
    }
    const kern = new Bytes().u16(0, 1).u16(0, 14 + 6, 0x0001, 1, 0, 0, 0).u16(1, 2, (-90) & 0xffff);
    const table = fontOf({ gpos: null, kern, map: [[A, 1], [V, 2]] });
    expect(measureWidth(table, text(A, ZWJ, V), 1000, { script: "latn" })).toBe(measureWidth(table, "AV", 1000, { script: "latn" }));
  });

  it("keeps U+034F with its own glyph of advance 0 in the kerning, and so the widths of the T4 corpus", () => {
    const font = fontOf({ gpos: pairs([[1, 2, -80], [1, 3, -10]]), widths: [500, 600, 580, 0, 300, 250, 560], map: [[A, 1], [V, 2], [0x34f, 3]] });
    expect(glyphAdvances(font, text(A, 0x34f, V), { script: "latn" }).advances).toEqual([590, 0, 580]);
    const wide = fontOf({ gpos: pairs([[1, 2, -80]]), map: [[A, 1], [V, 2], [0x34f, 3]] });
    expect(glyphAdvances(wide, text(A, 0x34f, V), { script: "latn" }).advances).toEqual([520, 0, 580]);
  });

  it("keeps a Hangul filler out of the set, as HarfBuzz does", () => {
    const font = fontOf({ gpos: null });
    for (const filler of [0x115f, 0x1160, 0x3164, 0xffa0, 0x1bca0]) expect(measureWidth(font, text(filler), 1000, { script: "latn" }), filler.toString(16)).toBe(500);
  });

  it("keeps its advance after a substitution", () => {
    const gsub = substitutionTable([["ccmp", 0]], [lookup(1, 0, single(3, 6))]);
    const font = fontOf({ gsub, gpos: null, map: [[A, 1], [V, 2], [ZWJ, 3]] });
    expect(glyphAdvances(font, text(A, ZWJ, V), { script: "latn" })).toEqual({ glyphs: [1, 6, 2], advances: [600, 560, 580] });
  });

  it("gives no glyph its mask in a substitution around it", () => {
    // A ligature of "A" and the joiner: the first glyph of the rule is not the ignorable, so the ligature has its advance
    const rule = new Bytes().u16(1, 8, 1, 14).bytes(coverage(1)).u16(1, 4).u16(6, 2, 3);
    const font = fontOf({ gsub: substitutionTable([["liga", 0]], [lookup(4, 0, rule)]), gpos: null, map: [[A, 1], [V, 2], [ZWJ, 3]] });
    expect(glyphAdvances(font, text(A, ZWJ, V), { script: "latn" })).toEqual({ glyphs: [6, 2], advances: [560, 580] });
  });

  it("takes no advance in the shapers of the joining and of Indic", () => {
    const arabic = fontOf({ gpos: null, map: [[0x628, 1], [0x200c, 3]] });
    expect(glyphAdvances(arabic, text(0x628, 0x200c, 0x628), { script: "arab" }).advances).toEqual([600, 0, 600]);
    const indic = fontOf({ gpos: null, map: [[0x915, 1], [0x94d, 2], [ZWJ, 3]] });
    expect(glyphAdvances(indic, text(0x915, 0x94d, ZWJ, 0x915), { script: "deva" }).advances.reduce((sum, advance) => sum + advance, 0)).toBe(600 + 580 + 600);
  });

  it("does not change a word without a default ignorable, and the limit stays sound", () => {
    const font = fontOf({ gpos: pairs([[1, 2, 70]]), map: [[A, 1], [V, 2], [ZWJ, 3]] });
    const sample = text(A, ZWJ, V, A, ZWJ, V);
    for (const options of rows) expect(measureWidth(font, sample, 16, options)).toBeLessThanOrEqual(widthBound(font, sample, options).width(sample.length, 16));
  });
});
