import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Reader } from "./binary.ts";
import { readPointCounts, readTransformedPointCounts } from "./gvar.ts";
import { defaultFeatures, engines, glyphAdvances, isEngineName, measureWidth, readFont, readTables, shapingWords, type Font } from "./index.ts";

/** A writer of big-endian bytes for the test fonts. */
class Bytes {
  readonly data: number[] = [];
  u8(...values: number[]): this {
    for (const v of values) this.data.push(v & 0xff);
    return this;
  }
  u16(...values: number[]): this {
    for (const v of values) this.u8(v >> 8, v);
    return this;
  }
  u32(...values: number[]): this {
    for (const v of values) this.u16(Math.floor(v / 0x10000), v & 0xffff);
    return this;
  }
  tag(tag: string): this {
    for (const c of tag) this.u8(c.charCodeAt(0));
    return this;
  }
  bytes(other: Bytes | number[]): this {
    this.data.push(...(Array.isArray(other) ? other : other.data));
    return this;
  }
  get length(): number {
    return this.data.length;
  }
}

// The glyphs: 0 .notdef, 1 "A", 2 "V", 3 "o", 4 a combining mark (U+0301), 5 space, 6 "T"
const advances = [500, 600, 580, 520, 300, 250, 560];
const characters: [number, number][] = [[0x20, 5], [0x41, 1], [0x54, 6], [0x56, 2], [0x6f, 3], [0x301, 4]];

function head(): Bytes {
  return new Bytes().u32(0x00010000, 0x00012000, 0xabcdef01, 0x5f0f3cf5).u16(0, 1000).u32(0, 0, 0, 0).u16(0, 0, 0, 0, 0, 0, 0, 0, 0);
}

function hhea(): Bytes {
  return new Bytes().u32(0x00010000).u16(800, 200, 0, 1000, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, advances.length);
}

function cmap(): Bytes {
  // One format 4 subtable: a segment for each character, with idDelta, and the end segment 0xFFFF
  const segments = [...characters.map(([c, g]) => [c, c, (g - c) & 0xffff] as const), [0xffff, 0xffff, 1] as const];
  const n = segments.length;
  const sub = new Bytes().u16(4, 16 + n * 8, 0, n * 2, 0, 0, 0);
  sub.u16(...segments.map((s) => s[1])).u16(0).u16(...segments.map((s) => s[0])).u16(...segments.map((s) => s[2])).u16(...segments.map(() => 0));
  return new Bytes().u16(0, 1).u16(3, 1).u32(12).bytes(sub);
}

/** This function builds an ItemVariationStore with one region (wght from 0 to 1, peak 1) and one delta for each item. */
function variationStore(deltas: readonly number[]): Bytes {
  const regions = new Bytes().u16(1, 1).u16(0, 16384, 16384);
  const data = new Bytes().u16(deltas.length, 0, 1, 0).u8(...deltas.map((d) => d & 0xff));
  return new Bytes().u16(1).u32(12).u16(1).u32(12 + regions.length).bytes(regions).bytes(data);
}

function gdef(variable: boolean): Bytes {
  // A ClassDef of format 2: the glyph 4 is a mark (class 3)
  const classes = new Bytes().u16(2, 1).u16(4, 4, 3);
  if (!variable) return new Bytes().u32(0x00010000).u16(12, 0, 0, 0).bytes(classes);
  // GDEF 1.3: the ItemVariationStore gives the delta -40 at wght 900 to the kerning of A V and T o
  return new Bytes().u32(0x00010003).u16(18, 0, 0, 0, 0).u32(18 + classes.length).bytes(classes).bytes(variationStore([-40]));
}

function gpos(variable: boolean): Bytes {
  // The script latn, the feature kern, two lookups. Lookup 0: PairPos format 1 (A V -80, T o -60), IgnoreMarks.
  // Lookup 1: an Extension to a PairPos format 2 (class "V" before class "A": -50 on the first glyph, +10 on the second)
  const pair1 = new Bytes();
  const coverage1 = new Bytes().u16(1, 2, 1, 6);
  // In the variable font, each value has a VariationIndex table (outer 0, inner 0) after the PairValueRecord
  const device = new Bytes().u16(0, 0, 0x8000);
  const setA = variable ? new Bytes().u16(1, 2, (-80) & 0xffff, 8).bytes(device) : new Bytes().u16(1, 2, (-80) & 0xffff);
  const setT = variable ? new Bytes().u16(1, 3, (-60) & 0xffff, 8).bytes(device) : new Bytes().u16(1, 3, (-60) & 0xffff);
  const p1Header = 10 + 2 * 2;
  pair1.u16(1, p1Header, variable ? 0x44 : 0x4, 0, 2, p1Header + coverage1.length, p1Header + coverage1.length + setA.length).bytes(coverage1).bytes(setA).bytes(setT);
  const coverage2 = new Bytes().u16(1, 1, 2);
  const class1 = new Bytes().u16(1, 2, 1, 1);
  const class2 = new Bytes().u16(1, 1, 1, 1);
  const records = new Bytes().u16(0, 0, 0, 0).u16(0, 0, (-50) & 0xffff, 10);
  const p2Header = 16;
  const at = p2Header + records.length;
  const pair2 = new Bytes().u16(2, at, 0x4, 0x4, at + coverage2.length, at + coverage2.length + class1.length, 2, 2).bytes(records).bytes(coverage2).bytes(class1).bytes(class2);
  const extension = new Bytes().u16(1, 2).u32(8).bytes(pair2);
  const lookup0 = new Bytes().u16(2, 0x8, 1, 8).bytes(pair1);
  const lookup1 = new Bytes().u16(9, 0, 1, 8).bytes(extension);
  const lookupList = new Bytes().u16(2, 6, 6 + lookup0.length).bytes(lookup0).bytes(lookup1);
  const featureList = new Bytes().u16(1).tag("kern").u16(8).u16(0, 2, 0, 1);
  const scriptList = new Bytes().u16(1).tag("latn").u16(8).u16(4, 0).u16(0, 0xffff, 1, 0);
  const s = 10;
  const f = s + scriptList.length;
  const l = f + featureList.length;
  return new Bytes().u32(0x00010000).u16(s, f, l).bytes(scriptList).bytes(featureList).bytes(lookupList);
}

/** This function builds a Lookup table with one subtable. */
function lookup(type: number, flags: number, subtable: Bytes): Bytes {
  return new Bytes().u16(type, flags, 1, 8).bytes(subtable);
}

function gsub(): Bytes {
  // The features of latn: calt (lookup 1), ccmp (lookup 4), liga (lookup 0) and smcp (lookup 3).
  // Lookup 0: a ligature "o o" to the glyph 6, IgnoreMarks.
  const ligature = new Bytes().u16(1, 8, 1, 14).u16(1, 1, 3).u16(1, 4).u16(6, 2, 3);
  // Lookup 1: a chained context of format 3. After "A", it applies the lookup 2 to "V".
  const chain = new Bytes().u16(3, 1, 18, 1, 24, 0, 1, 0, 2).u16(1, 1, 1).u16(1, 1, 2);
  // Lookup 2: a single substitution of format 1, "V" to "o" (delta +1). No feature uses it directly.
  const single1 = new Bytes().u16(1, 6, 1).u16(1, 1, 2);
  // Lookup 3: a single substitution of format 2, "A" to "T".
  const single2 = new Bytes().u16(2, 8, 1, 6).u16(1, 1, 1);
  // Lookup 4: an Extension to a multiple substitution, a space to two spaces.
  const multiple = new Bytes().u16(1, 2).u32(8).u16(1, 8, 1, 14).u16(1, 1, 5).u16(2, 5, 5);
  const lookups = [lookup(4, 0x8, ligature), lookup(6, 0, chain), lookup(1, 0, single1), lookup(1, 0, single2), lookup(7, 0, multiple)];
  const lookupList = new Bytes().u16(lookups.length);
  let at = 2 + lookups.length * 2;
  for (const l of lookups) {
    lookupList.u16(at);
    at += l.length;
  }
  for (const l of lookups) lookupList.bytes(l);
  const tags: [string, number][] = [["calt", 1], ["ccmp", 4], ["liga", 0], ["smcp", 3]];
  const featureList = new Bytes().u16(tags.length);
  tags.forEach(([tag], i) => featureList.tag(tag).u16(2 + tags.length * 6 + i * 6));
  for (const [, index] of tags) featureList.u16(0, 1, index);
  const scriptList = new Bytes().u16(1).tag("latn").u16(8).u16(4, 0).u16(0, 0xffff, 4, 0, 1, 2, 3);
  const s = 10;
  const f = s + scriptList.length;
  const l = f + featureList.length;
  return new Bytes().u32(0x00010000).u16(s, f, l).bytes(scriptList).bytes(featureList).bytes(lookupList);
}

// The variable font: the axis wght from 100 (the default) to 900. avar maps 0.5 to 0.25. HVAR adds at wght 900:
// A +96, V +40, o -24, T +30
const advanceDeltas = [0, 96, 40, -24, 0, 0, 30];

/** The tables of the advances of the variable font: `HVAR` only, `HVAR` and `gvar`, or `gvar` only. */
type Outlines = "hvar" | "both" | "gvar";

function variationTables(outlines: Outlines): [string, Bytes][] {
  const fvar = new Bytes().u16(1, 0, 16, 2, 1, 20, 0, 8).tag("wght").u32(100 * 65536, 100 * 65536, 900 * 65536).u16(0, 256);
  const avar = new Bytes().u16(1, 0, 0, 1, 4).u16((-16384) & 0xffff, (-16384) & 0xffff, 0, 0, 8192, 4096, 16384, 16384);
  const hvar = new Bytes().u16(1, 0).u32(20, 0, 0, 0).bytes(variationStore(advanceDeltas));
  const tables: [string, Bytes][] = [["avar", avar], ["fvar", fvar]];
  if (outlines !== "gvar") tables.unshift(["HVAR", hvar]);
  if (outlines !== "hvar") tables.push(...outlineTables());
  return tables;
}

/** This function adds a zero byte to a list of bytes when its length is odd. */
function even(bytes: Bytes): Bytes {
  if (bytes.length % 2 !== 0) bytes.u8(0);
  return bytes;
}

// The outlines: A has 3 points in 1 contour, V has 2 components, o has 8 points in 2 contours, T has 2 points.
// The phantom points of gvar give at the peak wght 900: A +95, V +40, o -20, T +300
const pointCounts = [0, 3, 2, 8, 0, 0, 2];

function outlineTables(): [string, Bytes][] {
  const box = [0, 0, 0, 0];
  const simple = (ends: number[]) => new Bytes().u16(ends.length, ...box).u16(...ends).u16(0).u8(...Array.from({ length: ends.at(-1)! + 1 }, () => 0x31));
  // The first component has word arguments and more components. The second has 1-byte arguments and a scale
  const composite = new Bytes().u16((-1) & 0xffff, ...box).u16(0x23, 1, 0, 0).u16(0x20a, 1).u8(0, 0).u16(0x4000);
  const glyphs = [new Bytes(), simple([2]), composite, simple([3, 7]), new Bytes(), new Bytes(), simple([1])].map(even);
  const glyf = new Bytes();
  const loca = new Bytes();
  for (const glyph of glyphs) {
    loca.u16(glyf.length / 2);
    glyf.bytes(glyph);
  }
  loca.u16(glyf.length / 2);
  // A: one tuple of the shared peak, with all 7 points, x deltas of 1 byte and y deltas that are 0
  const a = new Bytes().u16(1, 8).u16(9, 0).u8(0x06, 0, 0, 0, 2, 97, 0, 0, 0x86);
  // V: an embedded peak and the private points 2 and 3
  const v = new Bytes().u16(1, 10).u16(8, 0xa000, 16384).u8(2, 0x01, 2, 1, 0x01, (-4) & 0xff, 36, 0x81);
  // o: the shared points 8 and 9, a tuple of the shared peak, and an intermediate region from 0 to 0.5 with the peak 0.25
  const o = new Bytes().u16(0x8002, 18).u16(4, 0).u16(4, 0xc000, 4096, 0, 8192).u8(2, 0x01, 8, 1).u8(0x01, 0, (-20) & 0xff, 0x81).u8(0x01, 0, (-8) & 0xff, 0x81);
  // T: all 6 points, with x deltas of 2 bytes
  const t = new Bytes().u16(1, 8).u16(14, 0).u8(0x45).u16(0, 0, (-300) & 0xffff, 0, 0, 0).u8(0x85);
  const data = [new Bytes(), a, v, o, new Bytes(), new Bytes(), t].map(even);
  const gvar = new Bytes().u16(1, 0, 1, 1).u32(36).u16(7, 0).u32(38);
  let at = 0;
  for (const glyph of data) {
    gvar.u16(at / 2);
    at += glyph.length;
  }
  gvar.u16(at / 2).u16(16384);
  for (const glyph of data) gvar.bytes(glyph);
  return [["glyf", glyf], ["gvar", gvar], ["loca", loca]];
}

function tableSet(variable = false, substitutions = false, outlines: Outlines = "hvar"): [string, Bytes][] {
  const hmtx = new Bytes();
  for (const a of advances) hmtx.u16(a, 0);
  const tables: [string, Bytes][] = [["GDEF", gdef(variable)], ["GPOS", gpos(variable)], ...(substitutions ? [["GSUB", gsub()] as [string, Bytes]] : []), ["cmap", cmap()], ["head", head()], ["hhea", hhea()], ["hmtx", hmtx], ["maxp", new Bytes().u32(0x00005000).u16(advances.length)]];
  return variable ? [...variationTables(outlines), ...tables] : tables;
}

/** This function builds a TrueType file of the test tables. */
function buildTtf(variable = false, substitutions = false, outlines: Outlines = "hvar"): Uint8Array {
  const tables = tableSet(variable, substitutions, outlines);
  const out = new Bytes().u32(0x00010000).u16(tables.length, 0, 0, 0);
  let offset = 12 + tables.length * 16;
  const bodies: Bytes[] = [];
  for (const [tag, body] of tables) {
    // The directory has the length without the padding, as in a real font file
    out.tag(tag).u32(0, offset, body.length);
    while (body.length % 4 !== 0) body.u8(0);
    offset += body.length;
    bodies.push(body);
  }
  for (const body of bodies) out.bytes(body);
  return Uint8Array.from(out.data);
}

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
  });

  it("tells the names of the engines", () => {
    expect(isEngineName("coretext")).toBe(true);
    expect(isEngineName("toString")).toBe(false);
  });
});
