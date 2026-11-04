import { describe, expect, it } from "vitest";
import { Bytes, coverage, fontOf, lookup, pairs, substitutionTable } from "../../test/fonts.ts";
import { shapingRisks, type Font, type MeasureOptions, type ShapingRiskCode } from "./index.ts";

const text = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const canvas: MeasureOptions = { script: "latn", shaping: "canvas" };

/** This function makes a font in which only the code points `codePoints` have a glyph. The `cmap` of the fixture has no supplementary code points. */
function fontWith(...codePoints: number[]): Font {
  return { ...fontOf({}), glyph: (codePoint) => (codePoints.includes(codePoint) ? 1 : 0) };
}

const codes = (font: Font, sample: string, options: MeasureOptions = canvas): ShapingRiskCode[] => shapingRisks(font, sample, options).map((risk) => risk.code);

/** This function makes a PairPos or a SinglePos subtable of the value format `format` for the glyph `glyph`. */
const singlePos = (glyph: number, format: number): Bytes => new Bytes().u16(1, 8, format, 50).bytes(coverage(glyph));

/** This function makes a chained rule of format 3: the glyph `input` between `before` and `after` gets the lookup 1. */
function chain(before: number, input: number, after: number): Bytes {
  return new Bytes().u16(3, 1, 20, 1, 26, 1, 32, 1, 0, 1).bytes(coverage(before)).bytes(coverage(input)).bytes(coverage(after));
}

/** This function makes a font whose feature `kern` has the chained rule on the glyphs 1, 2 and 3. Its nested lookup has the value format `format`. */
function contextFont(format: number, input = 2): Font {
  const map: [number, number][] = [[0x41, 1], [0x42, input], [0x43, 3], [0x44, input === 2 ? 4 : 2]];
  return fontOf({ map, gpos: substitutionTable([["kern", 0]], [lookup(8, 0, chain(1, input, 3)), lookup(1, 0, singlePos(input, format))]) });
}

describe("shapingRisks", () => {
  it("gives no risk for ordinary text", () => {
    expect(codes(fontWith(0x41, 0x20), "A A")).toEqual([]);
    expect(shapingRisks(fontWith(0x41), "")).toEqual([]);
  });

  it("gives the offset and the length of a part in UTF-16 units", () => {
    expect(shapingRisks(fontWith(0x41, 0x1f1e6, 0x1f1e7), "AA\u{1F1E6}\u{1F1E7}A")).toEqual([{ code: "flag", index: 2, length: 4 }]);
  });

  describe("missing-glyph", () => {
    it("flags only the code point with no glyph", () => {
      expect(shapingRisks(fontWith(0x41), "AxA")).toEqual([{ code: "missing-glyph", index: 1, length: 1 }]);
    });

    it("does not flag a default ignorable or a control", () => {
      expect(codes(fontWith(0x41), text(0x41, 0xad, 0x200b, 0x41))).toEqual([]);
      expect(codes(fontWith(0x41), "A\tA\n")).toEqual([]);
    });

    it("follows the normalization", () => {
      expect(codes(fontWith(0xc1), text(0x41, 0x301))).toEqual([]);
      expect(codes(fontWith(0x41, 0x301), text(0xc1))).toEqual([]);
      expect(codes(fontWith(0x41), text(0x41, 0x301))).toEqual(["missing-glyph"]);
    });
  });

  describe("unshaped-script", () => {
    it.each([
      ["Bengali", 0x995], ["Gurmukhi", 0xa15], ["Gujarati", 0xa95], ["Oriya", 0xb15], ["Tamil", 0xb95], ["Telugu", 0xc15], ["Kannada", 0xc95], ["Malayalam", 0xd15],
      ["Sinhala", 0xd9a], ["Khmer", 0x1780], ["Myanmar", 0x1000], ["Tibetan", 0xf40], ["Mongolian", 0x1820], ["NKo", 0x7ca], ["Mandaic", 0x840],
    ])("flags %s", (_, codePoint) => {
      expect(codes(fontWith(0x41, codePoint), text(0x41, codePoint))).toEqual(["unshaped-script"]);
    });

    it("does not flag a script with a shaper in the model", () => {
      for (const codePoint of [0x627, 0x5d0, 0x915, 0xe01, 0xac00, 0x4e00]) expect(codes(fontWith(codePoint), text(codePoint)), codePoint.toString(16)).toEqual([]);
    });
  });

  describe("emoji sequences", () => {
    const man = 0x1f468;
    const girl = 0x1f467;
    const flagBlack = 0x1f3f4;
    it("flags a ZWJ sequence once, and a selector or a modifier in it", () => {
      expect(codes(fontWith(man, girl, 0x200d), text(man, 0x200d, girl))).toEqual(["emoji-zwj"]);
      expect(codes(fontWith(0x2764, 0x1f525, 0xfe0f, 0x200d), text(0x2764, 0xfe0f, 0x200d, 0x1f525))).toEqual(["emoji-zwj"]);
      expect(codes(fontWith(man, girl, 0x1f3fb, 0x200d), text(man, 0x1f3fb, 0x200d, girl))).toEqual(["emoji-zwj"]);
    });

    it("does not flag a joiner outside a sequence", () => {
      expect(codes(fontWith(0x915, 0x94d, 0x937), text(0x915, 0x94d, 0x200d, 0x937))).toEqual([]);
      expect(codes(fontWith(0x645, 0x6cc), text(0x645, 0x200c, 0x6cc))).toEqual([]);
      expect(codes(fontWith(man), text(man, 0x200d))).toEqual([]);
    });

    it("does not flag a modifier alone", () => {
      expect(codes(fontWith(man, 0x1f3fb), text(man, 0x1f3fb))).toEqual([]);
    });

    it("flags a variation selector", () => {
      expect(codes(fontWith(0x2764, 0xfe0f), text(0x2764, 0xfe0f))).toEqual(["variation-selector"]);
      expect(codes(fontWith(0x4e00), text(0x4e00, 0xe0100))).toEqual(["variation-selector"]);
    });

    it("flags a keycap once, with or without its selector", () => {
      expect(codes(fontWith(0x31, 0xfe0f, 0x20e3), text(0x31, 0xfe0f, 0x20e3))).toEqual(["keycap"]);
      expect(codes(fontWith(0x23, 0x20e3), text(0x23, 0x20e3))).toEqual(["keycap"]);
    });

    it("flags a pair of regional indicators, and not one alone", () => {
      expect(codes(fontWith(0x1f1fa, 0x1f1f8), text(0x1f1fa, 0x1f1f8))).toEqual(["flag"]);
      expect(codes(fontWith(0x1f1fa), text(0x1f1fa))).toEqual([]);
    });

    it("flags a tag sequence once", () => {
      const tags = [0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f];
      expect(codes(fontWith(flagBlack), text(flagBlack, ...tags))).toEqual(["tag"]);
    });
  });

  describe("positioning", () => {
    const XADVANCE = 4;
    const XPLACEMENT = 1;
    it("flags the word where the rule matches", () => {
      expect(shapingRisks(contextFont(XADVANCE), "ABC", canvas)).toEqual([{ code: "positioning", index: 0, length: 3 }]);
    });

    it("does not flag a word where the context differs", () => {
      for (const sample of ["AB", "BC", "DBC", "ABD", "ADC"]) expect(codes(contextFont(XADVANCE), sample), sample).toEqual([]);
    });

    it("does not flag a rule that changes no advance", () => {
      expect(codes(contextFont(XPLACEMENT), "ABC")).toEqual([]);
    });

    it("does not flag a value on a mark, which HarfBuzz sets to zero", () => {
      const MARK = 4;
      expect(codes(contextFont(XADVANCE, MARK), "ABC")).toEqual([]);
    });

    it("flags a value on a mark in a script whose shaper keeps the advance", () => {
      expect(codes(contextFont(XADVANCE, 4), "ABC", { ...canvas, script: "DFLT" })).toEqual([]);
      expect(contextFont(XADVANCE, 4).contextKerning!("hang")).toHaveLength(1);
      expect(contextFont(XADVANCE, 4).contextKerning!("hang")[0]!([1, 4, 3])).toBe(true);
      expect(contextFont(XADVANCE, 4).contextKerning!("latn")[0]!([1, 4, 3])).toBe(false);
    });

    it("does not flag PairPos, which the model applies", () => {
      expect(codes(fontOf({ gpos: substitutionTable([["kern", 0]], [lookup(2, 0, pairs([[1, 2, -80]]))]), map: [[0x41, 1], [0x42, 2]] }), "AB")).toEqual([]);
    });

    it("follows the words of a canvas and the option of the kerning", () => {
      const font = contextFont(XADVANCE);
      expect(codes(font, "ABC", { ...canvas, kerning: false })).toEqual([]);
      expect(shapingRisks(font, "D ABC", { ...canvas })).toMatchObject([{ code: "missing-glyph", index: 1 }, { code: "positioning", index: 2, length: 3 }]);
    });
  });
});
