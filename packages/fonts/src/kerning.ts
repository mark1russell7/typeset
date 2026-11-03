import type { Reader } from "./binary.ts";
import { classOf, coverageIndex } from "./tables.ts";
import type { VariationStore } from "./variations.ts";

/** The change of the advances of two glyphs, in font units. A variable font can give a value that is not a whole number. */
export interface PairValue {
  readonly first: number;
  readonly second: number;
  /** The part of `first` that comes from a VariationIndex table. HarfBuzz scales this part and the rest in different ways. */
  readonly firstDelta?: number;
  /** The part of `second` that comes from a VariationIndex table. */
  readonly secondDelta?: number;
  /** It is true when the subtable has a value for the second glyph. Then the next pair starts after the second glyph. */
  readonly skipSecond: boolean;
}

/** A lookup of pair adjustments, with the flags that tell which glyphs it skips. */
export interface PairLookup {
  readonly flags: number;
  /** This function gives the value for a pair, or `undefined` when no subtable applies. */
  pair(first: number, second: number): PairValue | undefined;
}

/** The lookup flags of OpenType. */
export const IGNORE_BASE = 0x2;
export const IGNORE_LIGATURES = 0x4;
export const IGNORE_MARKS = 0x8;

/** This function gives the size in bytes of a ValueRecord of the format `format`. */
function valueSize(format: number): number {
  let bits = format & 0xff;
  let size = 0;
  while (bits !== 0) {
    size += bits & 1;
    bits >>= 1;
  }
  return size * 2;
}

/**
 * This function gives the XAdvance of a ValueRecord at `offset`, or 0 when the format has none. The offset of a device table
 * is relative to `parent`. A VariationIndex table adds its delta from `store`, not rounded, as HarfBuzz adds it. A device
 * table of hinting deltas adds nothing, because the shaper of the browser does not set a ppem.
 */
function xAdvance(table: Reader, offset: number, format: number, parent: Reader, store: VariationStore | undefined): { value: number; delta: number } {
  const value = (format & 0x4) === 0 ? 0 : table.i16(offset + valueSize(format & 0x3));
  let delta = 0;
  if ((format & 0x40) !== 0 && store !== undefined) {
    const device = table.u16(offset + valueSize(format & 0x3f));
    if (device !== 0 && parent.u16(device + 4) === 0x8000) delta = store.delta(parent.u16(device), parent.u16(device + 2));
  }
  return { value: value + delta, delta };
}

/** This function makes the value of a pair from the XAdvance of its two glyphs. */
function pairValue(first: { value: number; delta: number }, second: { value: number; delta: number }, skipSecond: boolean): PairValue {
  return { first: first.value, second: second.value, firstDelta: first.delta, secondDelta: second.delta, skipSecond };
}

/** This function makes the pair function of one PairPos subtable. */
function pairSubtable(table: Reader, store: VariationStore | undefined): (first: number, second: number) => PairValue | undefined {
  const format = table.u16(0);
  const coverage = table.part(table.u16(2));
  const format1 = table.u16(4);
  const format2 = table.u16(6);
  const size1 = valueSize(format1);
  const size2 = valueSize(format2);
  const skipSecond = format2 !== 0;
  if (format === 1) {
    return (first, second) => {
      const index = coverageIndex(coverage, first);
      if (index < 0) return undefined;
      const set = table.part(table.u16(10 + index * 2));
      const recordSize = 2 + size1 + size2;
      let low = 0;
      let high = set.u16(0) - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const at = 2 + middle * recordSize;
        const glyph = set.u16(at);
        if (second < glyph) high = middle - 1;
        else if (second > glyph) low = middle + 1;
        else return pairValue(xAdvance(set, at + 2, format1, set, store), xAdvance(set, at + 2 + size1, format2, set, store), skipSecond);
      }
      return undefined;
    };
  }
  if (format === 2) {
    const classes1 = table.part(table.u16(8));
    const classes2 = table.part(table.u16(10));
    const count1 = table.u16(12);
    const count2 = table.u16(14);
    return (first, second) => {
      if (coverageIndex(coverage, first) < 0) return undefined;
      const class1 = classOf(classes1, first);
      const class2 = classOf(classes2, second);
      if (class1 >= count1 || class2 >= count2) return undefined;
      const at = 16 + (class1 * count2 + class2) * (size1 + size2);
      return pairValue(xAdvance(table, at, format1, table, store), xAdvance(table, at + size1, format2, table, store), skipSecond);
    };
  }
  throw new Error(`the PairPos format ${format} is unknown`);
}

/** This function gives the tags of the scripts to try, in order, for a script tag, as HarfBuzz tries them. */
export function scriptTags(script: string): string[] {
  const tags = script === "deva" ? ["dev2", "deva"] : [script];
  return [...tags, "DFLT", "dflt", "latn"];
}

/**
 * This function gives the pair lookups of the feature `kern` of GPOS for a script, in the order of the lookup list. The
 * store gives the deltas of a variable font at its instance.
 */
export function readGposKerning(gpos: Reader, script: string, store?: VariationStore): PairLookup[] {
  const scripts = gpos.part(gpos.u16(4));
  const features = gpos.part(gpos.u16(6));
  const lookups = gpos.part(gpos.u16(8));
  const scriptCount = scripts.u16(0);
  let langSys: Reader | undefined;
  for (const wanted of scriptTags(script)) {
    for (let i = 0; i < scriptCount && langSys === undefined; i++) {
      if (scripts.tag(2 + i * 6) !== wanted) continue;
      const table = scripts.part(scripts.u16(2 + i * 6 + 4));
      const fallback = table.u16(0);
      if (fallback !== 0) langSys = table.part(fallback);
    }
    if (langSys !== undefined) break;
  }
  if (langSys === undefined) return [];
  const indices = new Set<number>();
  const featureCount = langSys.u16(4);
  for (let i = 0; i < featureCount; i++) {
    const record = 2 + langSys.u16(6 + i * 2) * 6;
    if (features.tag(record) !== "kern") continue;
    const feature = features.part(features.u16(record + 4));
    for (let k = 0; k < feature.u16(2); k++) indices.add(feature.u16(4 + k * 2));
  }
  return [...indices].sort((a, b) => a - b).flatMap((index) => {
    const lookup = lookups.part(lookups.u16(2 + index * 2));
    const subtables: ((first: number, second: number) => PairValue | undefined)[] = [];
    const type = lookup.u16(0);
    for (let s = 0; s < lookup.u16(4); s++) {
      let subtable = lookup.part(lookup.u16(6 + s * 2));
      let subtype = type;
      if (type === 9) {
        subtype = subtable.u16(2);
        subtable = subtable.part(subtable.u32(4));
      }
      if (subtype === 2) subtables.push(pairSubtable(subtable, store));
    }
    if (subtables.length === 0) return [];
    return [{
      flags: lookup.u16(2),
      pair(first: number, second: number): PairValue | undefined {
        for (const subtable of subtables) {
          const value = subtable(first, second);
          if (value !== undefined) return value;
        }
        return undefined;
      },
    }];
  });
}

/** This function gives the pairs of format 0 of the `kern` table, as one lookup. */
export function readKernTable(kern: Reader): PairLookup[] {
  // Only the version 0 of Microsoft. The version 1 of Apple starts with the 32-bit number 0x00010000
  if (kern.u16(0) !== 0) return [];
  const pairs = new Map<number, number>();
  const count = kern.u16(2);
  let offset = 4;
  for (let t = 0; t < count; t++) {
    const length = kern.u16(offset + 2);
    const coverage = kern.u16(offset + 4);
    // Only the horizontal kerning of format 0, with no minimum values and no cross-stream values
    if ((coverage & 0xff07) === 0x0001) {
      const n = kern.u16(offset + 6);
      for (let i = 0; i < n; i++) {
        const at = offset + 14 + i * 6;
        const key = kern.u16(at) * 0x10000 + kern.u16(at + 2);
        pairs.set(key, (pairs.get(key) ?? 0) + kern.i16(at + 4));
      }
    }
    offset += length;
  }
  if (pairs.size === 0) return [];
  return [{
    flags: 0,
    pair(first: number, second: number): PairValue | undefined {
      const value = pairs.get(first * 0x10000 + second);
      return value === undefined ? undefined : { first: value, second: 0, skipSecond: false };
    },
  }];
}
