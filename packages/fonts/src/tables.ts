import type { Reader } from "./binary.ts";

/** The fields of `head`, `hhea` and `maxp` that the width uses. */
export interface Header {
  readonly unitsPerEm: number;
  /** The revision of the font, as the raw 16.16 number. */
  readonly revision: number;
  readonly checksumAdjustment: number;
  readonly numberOfHMetrics: number;
  readonly numGlyphs: number;
}

/** This function reads the header fields from `head`, `hhea` and `maxp`. */
export function readHeader(head: Reader, hhea: Reader, maxp: Reader): Header {
  if (head.u32(12) !== 0x5f0f3cf5) throw new Error("the head table has a bad magic number");
  return { revision: head.u32(4), checksumAdjustment: head.u32(8), unitsPerEm: head.u16(18), numberOfHMetrics: hhea.u16(34), numGlyphs: maxp.u16(4) };
}

/** This function gives the advance of each glyph in font units, from `hmtx`. */
export function readAdvances(hmtx: Reader, header: Header): Uint16Array {
  const advances = new Uint16Array(header.numGlyphs);
  let last = 0;
  for (let glyph = 0; glyph < header.numGlyphs; glyph++) {
    if (glyph < header.numberOfHMetrics) last = hmtx.u16(glyph * 4);
    advances[glyph] = last;
  }
  return advances;
}

/** This function gives the map from code points to glyphs of `cmap`. It uses a format 12 subtable if there is one, else a format 4 subtable. */
export function readCharacterMap(cmap: Reader): Map<number, number> {
  const count = cmap.u16(2);
  let best: { rank: number; offset: number } | undefined;
  for (let i = 0; i < count; i++) {
    const record = 4 + i * 8;
    const platform = cmap.u16(record);
    const encoding = cmap.u16(record + 2);
    const offset = cmap.u32(record + 4);
    const format = cmap.u16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const rank = format === 12 ? 2 : format === 4 ? 1 : 0;
    if (rank > 0 && (best === undefined || rank > best.rank)) best = { rank, offset };
  }
  if (best === undefined) throw new Error("the cmap table has no Unicode subtable of format 4 or 12");
  const table = cmap.part(best.offset);
  const map = new Map<number, number>();
  if (best.rank === 2) {
    const groups = table.u32(12);
    for (let g = 0; g < groups; g++) {
      const at = 16 + g * 12;
      const start = table.u32(at);
      const end = table.u32(at + 4);
      const glyph = table.u32(at + 8);
      for (let c = start; c <= end; c++) map.set(c, glyph + c - start);
    }
    return map;
  }
  const segments = table.u16(6) / 2;
  const ends = 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const start = table.u16(starts + s * 2);
    const end = table.u16(ends + s * 2);
    const delta = table.u16(deltas + s * 2);
    const range = table.u16(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph: number;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        glyph = table.u16(ranges + s * 2 + range + (c - start) * 2);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) map.set(c, glyph);
    }
  }
  return map;
}

/** This function gives the class of a glyph in a ClassDef table. A glyph that the table does not list has the class 0. */
export function classOf(table: Reader, glyph: number): number {
  const format = table.u16(0);
  if (format === 1) {
    const start = table.u16(2);
    const count = table.u16(4);
    return glyph >= start && glyph < start + count ? table.u16(6 + (glyph - start) * 2) : 0;
  }
  if (format === 2) {
    let low = 0;
    let high = table.u16(2) - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const at = 4 + middle * 6;
      if (glyph < table.u16(at)) high = middle - 1;
      else if (glyph > table.u16(at + 2)) low = middle + 1;
      else return table.u16(at + 4);
    }
    return 0;
  }
  throw new Error(`the ClassDef format ${format} is unknown`);
}

/** This function gives the index of a glyph in a Coverage table, or -1 when the table does not cover the glyph. */
export function coverageIndex(table: Reader, glyph: number): number {
  const format = table.u16(0);
  let low = 0;
  let high = table.u16(2) - 1;
  if (format === 1) {
    while (low <= high) {
      const middle = (low + high) >> 1;
      const value = table.u16(4 + middle * 2);
      if (glyph < value) high = middle - 1;
      else if (glyph > value) low = middle + 1;
      else return middle;
    }
    return -1;
  }
  if (format === 2) {
    while (low <= high) {
      const middle = (low + high) >> 1;
      const at = 4 + middle * 6;
      if (glyph < table.u16(at)) high = middle - 1;
      else if (glyph > table.u16(at + 2)) low = middle + 1;
      else return table.u16(at + 4) + glyph - table.u16(at);
    }
    return -1;
  }
  throw new Error(`the Coverage format ${format} is unknown`);
}

/** The GDEF glyph classes: 1 base, 2 ligature, 3 mark, 4 component. */
export function readGlyphClasses(gdef: Reader | undefined): ((glyph: number) => number) {
  if (gdef === undefined) return () => 0;
  const offset = gdef.u16(4);
  if (offset === 0) return () => 0;
  const table = gdef.part(offset);
  return (glyph) => classOf(table, glyph);
}
