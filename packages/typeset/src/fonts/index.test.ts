import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Bytes, advances, pointCounts, tableSet, buildTtf } from "../../test/fonts.ts";
import { generateCorpus } from "@typeset/corpus";
import { removed, resolveText } from "../bidi.ts";
import { Reader } from "./binary.ts";
import { readPointCounts, readTransformedPointCounts } from "./gvar.ts";
import { bidiLevels, canvasSegments, canvasWords, defaultFeatures, engines, glyphAdvances, isCjkIdeographOrSymbol, isEngineName, measureWidth, readFont, readTables, shapingWords, visualOrder, type Font } from "./index.ts";


function base128(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let v = Math.floor(value / 128); v > 0; v = Math.floor(v / 128)) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

/** This function builds a WOFF2 file of the test tables. With `transformHmtx`, it stores `hmtx` in the transform of version 1. */
function buildWoff2(transformHmtx: boolean, variable = false): Uint8Array {
  const known: Record<string, number> = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, GDEF: 26, GPOS: 27, avar: 39, fvar: 47 };
  const directory = new Bytes();
  const stream = new Bytes();
  for (const [tag, body] of tableSet(variable)) {
    if (tag === "hmtx" && transformHmtx) {
      const transformed = new Bytes().u8(0x3).u16(...advances);
      directory.u8(known[tag]! | 0x40).bytes(base128(body.length)).bytes(base128(transformed.length));
      stream.bytes(transformed);
    } else {
      // A tag that is not in the list of WOFF2 has the index 63 and the tag after the flags
      if (known[tag] === undefined) directory.u8(0x3f).tag(tag);
      else directory.u8(known[tag]!);
      directory.bytes(base128(body.length));
      stream.bytes(body);
    }
  }
  const compressed = brotliCompressSync(Uint8Array.from(stream.data));
  const header = new Bytes().tag("wOF2").u32(0x00010000, 0).u16(tableSet(variable).length, 0).u32(0, compressed.length).u16(1, 0).u32(0, 0, 0, 0, 0);
  return Uint8Array.from([...header.data, ...directory.data, ...compressed]);
}

describe("readFont", () => {
  const font = readFont(buildTtf());

  it("reads the header and the epoch", () => {
    expect(font.unitsPerEm).toBe(1000);
    expect(font.numGlyphs).toBe(7);
    expect(font.epoch).toMatch(/^00012000-[0-9a-f]{8}$/);
  });

  it("maps code points to glyphs with cmap format 4", () => {
    expect(font.glyph(0x41)).toBe(1);
    expect(font.glyph(0x301)).toBe(4);
    expect(font.glyph(0x42)).toBe(0);
  });

  it("gives the advance 0 to a mark of GDEF", () => {
    expect(font.advance(1)).toBe(600);
    expect(font.advance(4)).toBe(0);
  });

  it("refuses a file that is not a font", () => {
    expect(() => readFont(new Uint8Array(64))).toThrow(/not a font/);
    expect(() => readFont(buildWoff2(false))).toThrow(/Brotli/);
  });
});

describe("measureWidth", () => {
  const font = readFont(buildTtf());

  it("applies a pair of format 1", () => {
    expect(glyphAdvances(font, "AV", { script: "latn" }).advances).toEqual([520, 580]);
    expect(measureWidth(font, "To", 10, { script: "latn" })).toBeCloseTo((560 - 60 + 520) / 100, 12);
  });

  it("applies a pair of format 2 through an Extension lookup", () => {
    expect(glyphAdvances(font, "VA", { script: "latn" }).advances).toEqual([530, 610]);
  });

  it("skips a mark when the lookup ignores marks", () => {
    expect(glyphAdvances(font, "ÁV", { script: "latn" }).advances).toEqual([520, 0, 580]);
  });

  it("uses DFLT, then latn, when the font has no table for the script", () => {
    expect(glyphAdvances(font, "AV", { script: "cyrl" }).advances).toEqual([520, 580]);
  });

  it("gives the width without kerning for glyphs with no pair", () => {
    expect(measureWidth(font, "A A", 16)).toBeCloseTo(((600 + 250 + 600) * 16) / 1000, 12);
  });
});

describe("WOFF2", () => {
  const ttf = readFont(buildTtf());
  const texts = ["AV", "VA", "To", "ÁV o T"];

  for (const transform of [false, true]) {
    it(`gives the same widths as the TrueType file (hmtx transform ${transform})`, () => {
      const woff2 = readFont(buildWoff2(transform), { decompress: (data) => brotliDecompressSync(data) });
      expect(woff2.epoch).toBe(ttf.epoch);
      for (const text of texts) expect(measureWidth(woff2, text, 13, { script: "latn" })).toBe(measureWidth(ttf, text, 13, { script: "latn" }));
    });
  }

  it("reads the table directory of WOFF2", () => {
    const tables = readTables(buildWoff2(false), (data) => brotliDecompressSync(data));
    expect([...tables.keys()].sort()).toEqual(["GDEF", "GPOS", "cmap", "head", "hhea", "hmtx", "maxp"]);
  });
});

describe("variable fonts", () => {
  const bytes = buildTtf(true);

  it("gives the default instance when no instance is asked for", () => {
    const font = readFont(bytes);
    expect(font.axes).toEqual([{ tag: "wght", min: 100, default: 100, max: 900 }]);
    expect(font.instance).toEqual({ wght: 100 });
    expect(font.coordinates).toEqual([0]);
    expect(measureWidth(font, "AV", 1000)).toBe(600 + 580 - 80);
  });

  it("applies HVAR and the VariationIndex deltas of the kerning at the maximum", () => {
    const font = readFont(bytes, { instance: { wght: 900 } });
    expect(font.coordinates).toEqual([1]);
    expect([font.advance(1), font.advance(2), font.advance(3), font.advance(6)]).toEqual([696, 620, 496, 590]);
    expect(measureWidth(font, "AV", 1000)).toBe(696 + 620 - 80 - 40);
  });

  it("maps the coordinates through avar", () => {
    expect(readFont(bytes, { instance: { wght: 500 } }).coordinates).toEqual([0.25]);
    expect(readFont(bytes, { instance: { wght: 300 } }).coordinates).toEqual([0.125]);
  });

  it("rounds each HVAR delta to whole units, and keeps the kerning delta as it is", () => {
    // At 0.25: A 600 + 24, V 580 + 10, T 560 + 7.5 (rounded to 8), and the kerning -80 - 10
    const font = readFont(bytes, { instance: { wght: 500 } });
    expect([font.advance(1), font.advance(2), font.advance(6)]).toEqual([624, 590, 568]);
    expect(measureWidth(font, "AV", 1000)).toBe(624 + 590 - 90);
    // At 0.125: T 560 + 3.75 (rounded to 4), o 520 - 3, and the kerning -60 - 5
    expect(measureWidth(readFont(bytes, { instance: { wght: 300 } }), "To", 100)).toBeCloseTo((564 + 517 - 65) / 10, 10);
  });

  it("keeps the fraction of each HVAR delta with the option deltas exact, and has another epoch", () => {
    const exact = readFont(bytes, { instance: { wght: 500 }, deltas: "exact" });
    expect(exact.advance(6)).toBe(567.5);
    expect(exact.at({ wght: 300 }).advance(6)).toBe(563.75);
    expect(exact.epoch).not.toBe(readFont(bytes, { instance: { wght: 500 } }).epoch);
  });

  it("leaves out the kerning with the option kerning false", () => {
    const font = readFont(bytes, { instance: { wght: 500 } });
    expect(measureWidth(font, "AV", 1000, { kerning: false })).toBe(624 + 590);
  });

  it("clamps an instance to the range of the axis", () => {
    expect(readFont(bytes, { instance: { wght: 2000 } }).instance).toEqual({ wght: 900 });
  });

  it("gives the same font from at() as from readFont, and another epoch for each instance", () => {
    const base = readFont(bytes);
    const heavy = base.at({ wght: 900 });
    expect(heavy.epoch).toBe(readFont(bytes, { instance: { wght: 900 } }).epoch);
    expect(heavy.epoch).not.toBe(base.epoch);
    expect(measureWidth(heavy, "AVTo", 16)).toBe(measureWidth(readFont(bytes, { instance: { wght: 900 } }), "AVTo", 16));
  });

  it("gives the same widths and epoch from WOFF2", () => {
    const woff2 = readFont(buildWoff2(true, true), { decompress: (data) => brotliDecompressSync(data), instance: { wght: 500 } });
    const ttf = readFont(bytes, { instance: { wght: 500 } });
    expect(woff2.epoch).toBe(ttf.epoch);
    expect(measureWidth(woff2, "AVoT", 13)).toBe(measureWidth(ttf, "AVoT", 13));
  });
});

describe("the phantom points of gvar", () => {
  const both = buildTtf(true, false, "both");
  const only = buildTtf(true, false, "gvar");
  const glyphs = (font: Font) => [1, 2, 3, 6].map((glyph) => font.advance(glyph));

  it("counts the points of simple and composite glyphs", () => {
    const tables = readTables(both);
    const points = readPointCounts(tables.get("glyf")!, tables.get("loca")!, 0, 7);
    expect([...points.counts]).toEqual(pointCounts);
    expect([...points.metrics]).toEqual([-1, -1, 1, -1, -1, -1, -1]);
  });

  it("uses HVAR when the font has it, and gvar with the option advances gvar", () => {
    const hvar = readFont(both, { instance: { wght: 900 } });
    expect(hvar.advanceSource).toBe("HVAR");
    expect(glyphs(hvar)).toEqual([696, 620, 496, 590]);
    const gvar = readFont(both, { instance: { wght: 900 }, advances: "gvar" });
    expect(gvar.advanceSource).toBe("gvar");
    expect(glyphs(gvar)).toEqual([695, 620, 500, 860]);
    expect(gvar.epoch).toMatch(/-gvar$/);
    expect(gvar.at({ wght: 100 }).advanceSource).toBe("hmtx");
  });

  it("uses gvar when the font has no HVAR", () => {
    const font = readFont(only, { instance: { wght: 900 } });
    expect(font.advanceSource).toBe("gvar");
    expect(glyphs(font)).toEqual([695, 620, 500, 860]);
    expect(font.epoch).not.toMatch(/-gvar$/);
  });

  it("gives a composite glyph the advance of its USE_MY_METRICS component with the option metrics component", () => {
    // Glyph 2 is a composite of glyph 1, and its second component has the flag USE_MY_METRICS
    const font = readFont(both, { instance: { wght: 900 }, metrics: "component" });
    expect(glyphs(font)).toEqual([696, 696, 496, 590]);
    expect(font.epoch).toMatch(/-metrics$/);
    expect(glyphs(readFont(only, { instance: { wght: 900 }, metrics: "component" }))).toEqual([695, 695, 500, 860]);
    const base = readFont(both, { metrics: "component" });
    expect(base.advance(2)).toBe(base.advance(1));
    expect(readFont(both, { instance: { wght: 900 } }).epoch).not.toMatch(/-metrics$/);
  });

  it("applies the intermediate region and rounds the advance delta", () => {
    // At 0.25: A +23.75, o -5 - 8. At 0.125: A +11.875, o -2.5 - 4 = -6.5, and a half goes away from 0
    expect(glyphs(readFont(only, { instance: { wght: 500 } }))).toEqual([624, 590, 507, 635]);
    expect(glyphs(readFont(only, { instance: { wght: 500 }, deltas: "exact" }))).toEqual([623.75, 590, 507, 635]);
    const light = readFont(only, { instance: { wght: 300 } });
    expect([light.advance(1), light.advance(3)]).toEqual([612, 513]);
    expect(readFont(only, { instance: { wght: 300 }, deltas: "exact" }).advance(3)).toBe(513.5);
  });

  it("counts the points of the transformed glyf table of WOFF2", () => {
    // The contours: 0, 1, a composite, and 3. The point counts use the three forms of 255UInt16: 253 600, 255 263 and 254 510
    const contours = new Bytes().u16(0, 1, (-1) & 0xffff, 3);
    const points = new Bytes().u8(253, 0x02, 0x58, 255, 10, 254, 4, 5);
    const components = new Bytes().u16(0x21, 1).u16(0, 0).u16(0x280, 1).u8(0, 0).u16(0, 0, 0, 0);
    const glyf = new Bytes().u16(0, 0, 4, 0).u32(contours.length, points.length, 0, 0, components.length, 0, 0).bytes(contours).bytes(points).bytes(components);
    const read = readTransformedPointCounts(new Reader(Uint8Array.from(glyf.data)), 4);
    expect([...read.counts]).toEqual([0, 600, 2, 778]);
    expect([...read.metrics]).toEqual([-1, -1, 1, -1]);
  });
});

describe("the rounding mode pixel", () => {
  const font = readFont(buildTtf());

  it("rounds each advance and each kerning value to whole px", () => {
    // A 9.6 -> 10, V 9.28 -> 9, the kerning -1.28 -> -1
    expect(measureWidth(font, "AV", 16, { script: "latn", rounding: "pixel" })).toBe(18);
    expect(measureWidth(font, "AV", 16, { script: "latn" })).toBeCloseTo(17.6, 10);
  });

  it("rounds the advance to 1/64 px first, as FreeType does", () => {
    // A at 15.825 px is 9.495 px: 1/64 px gives 9.5, and then 10. A plain rounding gives 9
    expect(measureWidth(font, "A", 15.825, { rounding: "pixel" })).toBe(10);
  });
});

describe("the GSUB substitutions", () => {
  const font = readFont(buildTtf(false, true));
  const plain = readFont(buildTtf());
  const latn = { script: "latn" } as const;

  it("makes a ligature, and skips a mark between its components", () => {
    expect(glyphAdvances(font, "oo", latn).glyphs).toEqual([6]);
    expect(measureWidth(font, "oo", 1000, latn)).toBe(560);
    expect(glyphAdvances(font, "óo", latn).glyphs).toEqual([6, 4]);
  });

  it("applies a lookup of a chained context only after its backtrack glyph", () => {
    expect(glyphAdvances(font, "AV", latn).glyphs).toEqual([1, 3]);
    expect(glyphAdvances(font, "VV", latn).glyphs).toEqual([2, 2]);
    // "A o" has no kerning pair, so the width is the sum of the advances
    expect(measureWidth(font, "AV", 1000, latn)).toBe(600 + 520);
  });

  it("applies a multiple substitution through an Extension", () => {
    expect(glyphAdvances(font, " ", latn).glyphs).toEqual([5, 5]);
  });

  it("applies only the features of the list", () => {
    expect(measureWidth(font, "AV", 1000, { ...latn, features: [] })).toBe(600 + 580 - 80);
    expect(measureWidth(font, "oo", 1000, { ...latn, features: ["calt"] })).toBe(1040);
    expect(glyphAdvances(font, "A", { ...latn, features: ["smcp"] }).glyphs).toEqual([6]);
    expect(glyphAdvances(font, "A", latn).glyphs).toEqual([1]);
    expect(defaultFeatures).toContain("liga");
  });

  it("uses the script latn when the script of the text is not in the font", () => {
    expect(glyphAdvances(font, "oo").glyphs).toEqual([6]);
  });

  it("gives a font with no GSUB the same widths, and a different epoch to a font with GSUB", () => {
    expect(measureWidth(plain, "oo", 1000, latn)).toBe(1040);
    expect(font.epoch).not.toBe(plain.epoch);
  });
});

describe("the words of the GSUB pass", () => {
  it("makes each space and each tab a word alone", () => {
    expect(shapingWords("ab  c	d")).toEqual(["ab", " ", " ", "c", "	", "d"]);
    expect(shapingWords(" ")).toEqual([" "]);
    expect(shapingWords("")).toEqual([]);
  });

  it("applies the lookups to each word, so that no context goes across a space", () => {
    const seen: number[][] = [];
    const font = {
      glyph: (codePoint: number) => codePoint,
      advance: () => 500,
      glyphClass: () => 0,
      kerning: () => [],
      substitutions: () => [{ index: 0, type: 6, flags: 0, features: ["calt"], apply: (glyphs: number[]) => void seen.push([...glyphs]) }],
    } as unknown as Font;
    expect(glyphAdvances(font, "ab c").glyphs).toEqual([0x61, 0x62, 0x20, 0x63]);
    expect(seen).toEqual([[0x61, 0x62], [0x20], [0x63]]);
  });
});

describe("the words of a canvas", () => {
  it("ends a word at each space, tab and zero width space", () => {
    expect(canvasWords("ab  c	d​e")).toEqual(["ab", " ", " ", "c", "	", "d", "​", "e"]);
    expect(canvasWords("")).toEqual([]);
  });

  it("makes each kana and each ideograph a word, with its marks and the CJK characters of the script Common", () => {
    expect(canvasWords("かな漢字")).toEqual(["か", "な", "漢", "字"]);
    expect(canvasWords("がボーカ。")).toEqual(["が", "ボー", "カ。"]);
    expect(canvasWords("。か")).toEqual(["。か"]);
  });

  it("ends a word of Latin text or digits at a CJK character, and keeps digits after a CJK character", () => {
    expect(canvasWords("ab12かcd")).toEqual(["ab12", "か", "cd"]);
    expect(canvasWords("か34ナ")).toEqual(["か34", "ナ"]);
  });

  it("knows the CJK characters of the table of Blink", () => {
    expect([0x3042, 0x30ab, 0x4e00, 0x3002, 0x1f600].map(isCjkIdeographOrSymbol)).toEqual([true, true, true, true, true]);
    expect([0x41, 0x2c6, 0xac00, 0x5d0].map(isCjkIdeographOrSymbol)).toEqual([false, false, false, false]);
  });

  it("kerns only inside each word with the canvas shaping", () => {
    const pair = { first: -10, second: 0, skipSecond: false };
    const font = {
      glyph: (codePoint: number) => codePoint,
      advance: () => 500,
      glyphClass: () => 0,
      kerning: () => [{ flags: 0, pair: () => pair }],
      substitutions: () => [],
    } as unknown as Font;
    expect(glyphAdvances(font, "かな12").advances).toEqual([490, 490, 490, 500]);
    expect(glyphAdvances(font, "かな12", { shaping: "canvas" }).advances).toEqual([500, 490, 490, 500]);
  });
});

describe("the bidi order of a canvas", () => {
  it("gives the levels of RTL letters, digits and neutrals in a paragraph of the base level 0", () => {
    expect(bidiLevels("ab 12")).toEqual([0, 0, 0, 0, 0]);
    expect(bidiLevels("אב 12 גד")).toEqual([1, 1, 1, 2, 2, 1, 1, 1]);
    // A digit after L is L, and the space between L and R gets the base level
    expect(bidiLevels("12 אב")).toEqual([0, 0, 0, 1, 1]);
    // A digit after an Arabic letter is an Arabic digit, and a mark and the tatweel go with the letter
    expect(bidiLevels("بـَ 12")).toEqual([1, 1, 1, 1, 2, 2]);
    // A full stop at the end goes to the base level, and so does a space at the end
    expect(bidiLevels("אב. ")).toEqual([1, 1, 0, 0]);
  });

  it("reverses each sequence from the highest level down to the level 1", () => {
    expect(visualOrder(["a", "b", "c"], [0, 0, 0])).toEqual(["a", "b", "c"]);
    expect(visualOrder(["a", "b", "c", "d"], [1, 2, 2, 1])).toEqual(["d", "b", "c", "a"]);
    expect(visualOrder(["x", "a", "b"], [0, 1, 1])).toEqual(["x", "b", "a"]);
  });

  it("gives the words of a canvas in the visual order, split where the level changes", () => {
    expect(canvasSegments("ab cd")).toEqual(canvasWords("ab cd"));
    expect(canvasSegments("אב 12 גד")).toEqual(["גד", " ", "12", " ", "אב"]);
    expect(canvasSegments("12 אב.")).toEqual(["12", " ", "אב", "."]);
  });

  it("applies the explicit characters and the isolates", () => {
    // RLO makes L of the letters R, and the removed characters take the level of the character before them
    expect(bidiLevels("\u202Eab\u202C")).toEqual([0, 1, 1, 0]);
    expect(bidiLevels("\u2067ab\u2069")).toEqual([0, 2, 2, 0]);
    expect(bidiLevels("אב\u2068גד\u2069")).toEqual([1, 1, 0, 1, 1, 0]);
  });

  it("splits the segments at an explicit character, and keeps a removed character with the text before it", () => {
    expect(canvasSegments("A\u202BV")).toEqual(["A\u202B", "V"]);
    expect(canvasSegments("א\u202Aב")).toEqual(["ב", "א\u202A"]);
    expect(canvasSegments("A\u200FV")).toEqual(["A", "\u200F", "V"]);
    expect(canvasSegments("A\u034FV")).toEqual(["A\u034FV"]);
  });

  it("gives the marks of direction their strong classes", () => {
    expect(bidiLevels("a\u200F")).toEqual([0, 1]);
    expect(bidiLevels("\u061C1")).toEqual([1, 2]);
    expect(bidiLevels("א\u200Eב")).toEqual([1, 0, 1]);
  });

  it("applies the rule N0 to paired brackets", () => {
    // Without N0 the closing bracket goes to the base level, because it is between R and L
    expect(bidiLevels("א(ב)a")).toEqual([1, 1, 1, 1, 0]);
  });

  it("keeps a format character with the text, and gives the base level to one at the end", () => {
    expect(bidiLevels("א\u200Dב")).toEqual([1, 1, 1]);
    expect(bidiLevels("א\u200D")).toEqual([1, 0]);
    expect(bidiLevels("א\u200D ")).toEqual([1, 0, 0]);
    expect(bidiLevels("\u200D")).toEqual([0]);
  });

  it("gives the levels of the exact table for each script of the corpus", () => {
    for (const { text } of generateCorpus({ seed: 1, perCell: 1 })) {
      let level = 0;
      const exact = resolveText(text, 0).levels.map((value) => (value === removed ? level : (level = value)));
      expect(bidiLevels(text)).toEqual(exact);
    }
  });
});

describe("the sum float32", () => {
  const font = readFont(buildTtf());

  it("cuts each advance in single precision to 1/65536 px", () => {
    // A at 16 px is 9.6 px. In single precision it is 9.6000004, and 629145.625 / 65536 is cut to 629145 / 65536
    expect(measureWidth(font, "A", 16, { sum: "float32" })).toBe(629145 / 65536);
    expect(measureWidth(font, "A", 16)).toBe(9.6);
  });

  it("scales a kerning value with em_mult of HarfBuzz", () => {
    // The scale is 16 * 65536 and the multiplier is 68719476. The kerning -80 is (-80 * 68719476 + 32768) >> 16 = -83886
    const a = Math.trunc(Math.fround(9.6) * 65536);
    const v = Math.trunc(Math.fround(9.28) * 65536);
    expect(measureWidth(font, "AV", 16, { script: "latn", sum: "float32" })).toBe(Math.fround((a + v - 83886) / 65536));
  });

  it("adds the words in single precision, in the visual order", () => {
    const pair = { first: -10, second: 0, skipSecond: false };
    const mock = { unitsPerEm: 1000, glyph: (codePoint: number) => codePoint, advance: () => 333, glyphClass: () => 0, kerning: () => [{ flags: 0, pair: () => pair }], substitutions: () => [] } as unknown as Font;
    const text = "abc d אבג 12 דה".repeat(40);
    const width = measureWidth(mock, text, 48, { sum: "float32" });
    expect(Math.fround(width)).toBe(width);
    const sum = canvasSegments(text).reduce((total, segment) => Math.fround(total + measureWidth(mock, segment, 48, { sum: "float32" })), 0);
    expect(width).toBe(sum);
    expect(width).not.toBe(measureWidth(mock, text, 48, { shaping: "canvas" }));
  });

  it("keeps the whole px of the rounding pixel", () => {
    expect(measureWidth(font, "AVo", 13, { script: "latn", rounding: "pixel", sum: "float32" })).toBe(measureWidth(font, "AVo", 13, { script: "latn", rounding: "pixel" }));
  });
});

describe("the table of engines", () => {
  const both = buildTtf(true, false, "both");

  it("gives each engine the read options and the rounding of its row", () => {
    const glyphs = (font: Font) => [1, 2, 3, 6].map((glyph) => font.advance(glyph));
    expect(glyphs(readFont(both, { instance: { wght: 900 }, ...engines.freetype }))).toEqual(glyphs(readFont(both, { instance: { wght: 900 } })));
    expect(glyphs(readFont(both, { instance: { wght: 900 }, ...engines.directwrite }))).toEqual([696, 696, 496, 590]);
    expect(readFont(both, { instance: { wght: 900 }, ...engines.coretext }).epoch).toMatch(/-exact$/);
    const font = readFont(both, { instance: { wght: 900 } });
    expect(Number.isInteger(measureWidth(font, "AVo", 13, { rounding: engines.freetype.rounding }))).toBe(true);
    expect(measureWidth(font, "AVo", 13, { rounding: engines.coretext.rounding })).toBe(measureWidth(font, "AVo", 13));
    expect([engines.freetype.sum, engines.coretext.sum, engines.directwrite.sum]).toEqual(["exact", "float32", "float32"]);
    expect(measureWidth(font, "AVo", 13, { ...engines.freetype })).toBe(measureWidth(font, "AVo", 13, { rounding: "pixel" }));
  });

  it("tells the names of the engines", () => {
    expect(isEngineName("coretext")).toBe(true);
    expect(isEngineName("toString")).toBe(false);
  });
});
