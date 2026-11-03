/**
 * The test fonts of the font model: small TrueType files that a test builds in memory. Thus the tests need no font file.
 */
/** A writer of big-endian bytes for the test fonts. */
export class Bytes {
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
export const advances = [500, 600, 580, 520, 300, 250, 560];
export const characters: [number, number][] = [[0x20, 5], [0x41, 1], [0x54, 6], [0x56, 2], [0x6f, 3], [0x301, 4]];

export function head(): Bytes {
  return new Bytes().u32(0x00010000, 0x00012000, 0xabcdef01, 0x5f0f3cf5).u16(0, 1000).u32(0, 0, 0, 0).u16(0, 0, 0, 0, 0, 0, 0, 0, 0);
}

export function hhea(): Bytes {
  return new Bytes().u32(0x00010000).u16(800, 200, 0, 1000, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, advances.length);
}

export function cmap(map: readonly (readonly [number, number])[] = characters): Bytes {
  // One format 4 subtable: a segment for each character, with idDelta, and the end segment 0xFFFF
  const segments = [...map.map(([c, g]) => [c, c, (g - c) & 0xffff] as const), [0xffff, 0xffff, 1] as const];
  const n = segments.length;
  const sub = new Bytes().u16(4, 16 + n * 8, 0, n * 2, 0, 0, 0);
  sub.u16(...segments.map((s) => s[1])).u16(0).u16(...segments.map((s) => s[0])).u16(...segments.map((s) => s[2])).u16(...segments.map(() => 0));
  return new Bytes().u16(0, 1).u16(3, 1).u32(12).bytes(sub);
}

/** This function builds an ItemVariationStore with one region (wght from 0 to 1, peak 1) and one delta for each item. */
export function variationStore(deltas: readonly number[]): Bytes {
  const regions = new Bytes().u16(1, 1).u16(0, 16384, 16384);
  const data = new Bytes().u16(deltas.length, 0, 1, 0).u8(...deltas.map((d) => d & 0xff));
  return new Bytes().u16(1).u32(12).u16(1).u32(12 + regions.length).bytes(regions).bytes(data);
}

export function gdef(variable: boolean): Bytes {
  // A ClassDef of format 2: the glyph 4 is a mark (class 3)
  const classes = new Bytes().u16(2, 1).u16(4, 4, 3);
  if (!variable) return new Bytes().u32(0x00010000).u16(12, 0, 0, 0).bytes(classes);
  // GDEF 1.3: the ItemVariationStore gives the delta -40 at wght 900 to the kerning of A V and T o
  return new Bytes().u32(0x00010003).u16(18, 0, 0, 0, 0).u32(18 + classes.length).bytes(classes).bytes(variationStore([-40]));
}

export function gpos(variable: boolean): Bytes {
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
export function lookup(type: number, flags: number, subtable: Bytes): Bytes {
  return new Bytes().u16(type, flags, 1, 8).bytes(subtable);
}

export function gsub(): Bytes {
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
export const advanceDeltas = [0, 96, 40, -24, 0, 0, 30];

/** The tables of the advances of the variable font: `HVAR` only, `HVAR` and `gvar`, or `gvar` only. */
export type Outlines = "hvar" | "both" | "gvar";

export function variationTables(outlines: Outlines): [string, Bytes][] {
  const fvar = new Bytes().u16(1, 0, 16, 2, 1, 20, 0, 8).tag("wght").u32(100 * 65536, 100 * 65536, 900 * 65536).u16(0, 256);
  const avar = new Bytes().u16(1, 0, 0, 1, 4).u16((-16384) & 0xffff, (-16384) & 0xffff, 0, 0, 8192, 4096, 16384, 16384);
  const hvar = new Bytes().u16(1, 0).u32(20, 0, 0, 0).bytes(variationStore(advanceDeltas));
  const tables: [string, Bytes][] = [["avar", avar], ["fvar", fvar]];
  if (outlines !== "gvar") tables.unshift(["HVAR", hvar]);
  if (outlines !== "hvar") tables.push(...outlineTables());
  return tables;
}

/** This function adds a zero byte to a list of bytes when its length is odd. */
export function even(bytes: Bytes): Bytes {
  if (bytes.length % 2 !== 0) bytes.u8(0);
  return bytes;
}

// The outlines: A has 3 points in 1 contour, V has 2 components, o has 8 points in 2 contours, T has 2 points.
// The phantom points of gvar give at the peak wght 900: A +95, V +40, o -20, T +300
export const pointCounts = [0, 3, 2, 8, 0, 0, 2];

export function outlineTables(): [string, Bytes][] {
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

export function tableSet(variable = false, substitutions = false, outlines: Outlines = "hvar", map: readonly (readonly [number, number])[] = characters): [string, Bytes][] {
  const hmtx = new Bytes();
  for (const a of advances) hmtx.u16(a, 0);
  const tables: [string, Bytes][] = [["GDEF", gdef(variable)], ["GPOS", gpos(variable)], ...(substitutions ? [["GSUB", gsub()] as [string, Bytes]] : []), ["cmap", cmap(map)], ["head", head()], ["hhea", hhea()], ["hmtx", hmtx], ["maxp", new Bytes().u32(0x00005000).u16(advances.length)]];
  return variable ? [...variationTables(outlines), ...tables] : tables;
}

/** This function builds a TrueType file of the test tables. */
export function buildTtf(variable = false, substitutions = false, outlines: Outlines = "hvar", map: readonly (readonly [number, number])[] = characters): Uint8Array {
  const tables = tableSet(variable, substitutions, outlines, map);
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
