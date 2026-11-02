import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { glyphAdvances, measureWidth, readFont, readTables } from "./index.ts";

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

function gdef(): Bytes {
  // A ClassDef of format 2: the glyph 4 is a mark (class 3)
  return new Bytes().u32(0x00010000).u16(12, 0, 0, 0).u16(2, 1).u16(4, 4, 3);
}

function gpos(): Bytes {
  // The script latn, the feature kern, two lookups. Lookup 0: PairPos format 1 (A V -80, T o -60), IgnoreMarks.
  // Lookup 1: an Extension to a PairPos format 2 (class "V" before class "A": -50 on the first glyph, +10 on the second)
  const pair1 = new Bytes();
  const coverage1 = new Bytes().u16(1, 2, 1, 6);
  const setA = new Bytes().u16(1, 2, (-80) & 0xffff);
  const setT = new Bytes().u16(1, 3, (-60) & 0xffff);
  const p1Header = 10 + 2 * 2;
  pair1.u16(1, p1Header, 0x4, 0, 2, p1Header + coverage1.length, p1Header + coverage1.length + setA.length).bytes(coverage1).bytes(setA).bytes(setT);
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

function tableSet(): [string, Bytes][] {
  const hmtx = new Bytes();
  for (const a of advances) hmtx.u16(a, 0);
  return [["GDEF", gdef()], ["GPOS", gpos()], ["cmap", cmap()], ["head", head()], ["hhea", hhea()], ["hmtx", hmtx], ["maxp", new Bytes().u32(0x00005000).u16(advances.length)]];
}

/** This function builds a TrueType file of the test tables. */
function buildTtf(): Uint8Array {
  const tables = tableSet();
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
function buildWoff2(transformHmtx: boolean): Uint8Array {
  const known: Record<string, number> = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, GDEF: 26, GPOS: 27 };
  const directory = new Bytes();
  const stream = new Bytes();
  for (const [tag, body] of tableSet()) {
    if (tag === "hmtx" && transformHmtx) {
      const transformed = new Bytes().u8(0x3).u16(...advances);
      directory.u8(known[tag]! | 0x40).bytes(base128(body.length)).bytes(base128(transformed.length));
      stream.bytes(transformed);
    } else {
      directory.u8(known[tag]!).bytes(base128(body.length));
      stream.bytes(body);
    }
  }
  const compressed = brotliCompressSync(Uint8Array.from(stream.data));
  const header = new Bytes().tag("wOF2").u32(0x00010000, 0).u16(tableSet().length, 0).u32(0, compressed.length).u16(1, 0).u32(0, 0, 0, 0, 0);
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
