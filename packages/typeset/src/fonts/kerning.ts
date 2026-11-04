import type { Reader } from "./binary.ts";
import type { GlyphFilter } from "./substitution.ts";
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
  /**
   * This function tells if the lookup skips a glyph, when the lookup uses a mark filtering set. Then the lookup skips each
   * mark that is not in the set. Without the function, the flags alone tell which glyphs the lookup skips.
   */
  readonly skip?: (glyph: number) => boolean;
  /** This function gives the value for a pair, or `undefined` when no subtable applies. */
  pair(first: number, second: number): PairValue | undefined;
  /**
   * This function gives the largest positive value of each glyph of a pair, over the pairs with two glyphs of `glyphs`.
   * A value is at least 0. It uses the values of the instance, so it includes each variation delta.
   */
  largest(glyphs: ReadonlySet<number>): LargestKerning;
}

/** The largest positive kerning of the first glyph and of the second glyph of a pair, in font units. */
export interface LargestKerning {
  readonly first: number;
  readonly second: number;
}

/** One PairPos subtable. */
type PairSubtable = Pick<PairLookup, "pair" | "largest">;

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

/** This function makes the functions of one PairPos subtable. */
function pairSubtable(table: Reader, store: VariationStore | undefined): PairSubtable {
  const format = table.u16(0);
  const coverage = table.part(table.u16(2));
  const format1 = table.u16(4);
  const format2 = table.u16(6);
  const size1 = valueSize(format1);
  const size2 = valueSize(format2);
  const skipSecond = format2 !== 0;
  if (format === 1) {
    const recordSize = 2 + size1 + size2;
    const pair = (first: number, second: number): PairValue | undefined => {
      const index = coverageIndex(coverage, first);
      if (index < 0) return undefined;
      const set = table.part(table.u16(10 + index * 2));
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
    const largest = (glyphs: ReadonlySet<number>): LargestKerning => {
      let first = 0;
      let second = 0;
      for (const glyph of glyphs) {
        const index = coverageIndex(coverage, glyph);
        if (index < 0) continue;
        const set = table.part(table.u16(10 + index * 2));
        for (let record = 0; record < set.u16(0); record++) {
          const at = 2 + record * recordSize;
          if (!glyphs.has(set.u16(at))) continue;
          first = Math.max(first, xAdvance(set, at + 2, format1, set, store).value);
          second = Math.max(second, xAdvance(set, at + 2 + size1, format2, set, store).value);
        }
      }
      return { first, second };
    };
    return { pair, largest };
  }
  if (format === 2) {
    const classes1 = table.part(table.u16(8));
    const classes2 = table.part(table.u16(10));
    const count1 = table.u16(12);
    const count2 = table.u16(14);
    const pair = (first: number, second: number): PairValue | undefined => {
      if (coverageIndex(coverage, first) < 0) return undefined;
      const class1 = classOf(classes1, first);
      const class2 = classOf(classes2, second);
      if (class1 >= count1 || class2 >= count2) return undefined;
      const at = 16 + (class1 * count2 + class2) * (size1 + size2);
      return pairValue(xAdvance(table, at, format1, table, store), xAdvance(table, at + size1, format2, table, store), skipSecond);
    };
    const largest = (glyphs: ReadonlySet<number>): LargestKerning => {
      const firsts = new Set<number>();
      const seconds = new Set<number>();
      for (const glyph of glyphs) {
        if (coverageIndex(coverage, glyph) >= 0) firsts.add(classOf(classes1, glyph));
        seconds.add(classOf(classes2, glyph));
      }
      let first = 0;
      let second = 0;
      for (const class1 of firsts) {
        for (const class2 of seconds) {
          if (class1 >= count1 || class2 >= count2) continue;
          const at = 16 + (class1 * count2 + class2) * (size1 + size2);
          first = Math.max(first, xAdvance(table, at, format1, table, store).value);
          second = Math.max(second, xAdvance(table, at + size1, format2, table, store).value);
        }
      }
      return { first, second };
    };
    return { pair, largest };
  }
  throw new Error(`the PairPos format ${format} is unknown`);
}

/** This function gives the tags of the scripts to try, in order, for a script tag, as HarfBuzz tries them. */
export function scriptTags(script: string): string[] {
  const tags = script === "deva" ? ["dev2", "deva"] : [script];
  return [...tags, "DFLT", "dflt", "latn"];
}

/** The GPOS features with pair lookups that HarfBuzz applies to horizontal text. */
const pairFeatures = new Set(["kern", "dist"]);

/** The lookup flag that selects a mark filtering set of GDEF. */
const USE_MARK_FILTERING_SET = 0x10;

/** This function gives the function that tells which glyphs a lookup skips. Its table of flags is `lookup`. */
export function lookupSkip(lookup: Reader, flags: number, filter: GlyphFilter): (glyph: number) => boolean {
  const markSet = (flags & USE_MARK_FILTERING_SET) !== 0 ? lookup.u16(6 + lookup.u16(4) * 2) : -1;
  return (glyph) => {
    const kind = filter.glyphClass(glyph);
    if ((flags & IGNORE_BASE) !== 0 && kind === 1) return true;
    if ((flags & IGNORE_LIGATURES) !== 0 && kind === 2) return true;
    if (kind !== 3) return false;
    return (flags & IGNORE_MARKS) !== 0 || (markSet >= 0 && !filter.inMarkSet(markSet, glyph));
  };
}

/** This function gives the indices of the lookups of the features `kern` and `dist` of GPOS for a script, in the order of the lookup list. */
export function pairLookupIndices(gpos: Reader, script: string): number[] {
  const scripts = gpos.part(gpos.u16(4));
  const features = gpos.part(gpos.u16(6));
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
    if (!pairFeatures.has(features.tag(record))) continue;
    const feature = features.part(features.u16(record + 4));
    for (let k = 0; k < feature.u16(2); k++) indices.add(feature.u16(4 + k * 2));
  }
  return [...indices].sort((a, b) => a - b);
}

/**
 * This function gives the pair lookups of the features `kern` and `dist` of GPOS for a script, in the order of the lookup
 * list. The store gives the deltas of a variable font at its instance. The filter gives the mark filtering sets of GDEF.
 */
export function readGposKerning(gpos: Reader, script: string, store?: VariationStore, filter?: GlyphFilter): PairLookup[] {
  const lookups = gpos.part(gpos.u16(8));
  return pairLookupIndices(gpos, script).flatMap((index) => {
    const lookup = lookups.part(lookups.u16(2 + index * 2));
    const subtables: PairSubtable[] = [];
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
    const flags = lookup.u16(2);
    const skip = (flags & USE_MARK_FILTERING_SET) !== 0 && filter !== undefined ? lookupSkip(lookup, flags, filter) : undefined;
    return [{
      flags,
      ...(skip === undefined ? {} : { skip }),
      pair(first: number, second: number): PairValue | undefined {
        for (const subtable of subtables) {
          const value = subtable.pair(first, second);
          if (value !== undefined) return value;
        }
        return undefined;
      },
      // A pair gets the value of one subtable, so the largest value of a lookup is the largest value of its subtables
      largest(glyphs: ReadonlySet<number>): LargestKerning {
        const values = subtables.map((subtable) => subtable.largest(glyphs));
        return { first: Math.max(...values.map((value) => value.first)), second: Math.max(...values.map((value) => value.second)) };
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
    largest(glyphs: ReadonlySet<number>): LargestKerning {
      let first = 0;
      for (const [key, value] of pairs) if (glyphs.has(Math.floor(key / 0x10000)) && glyphs.has(key % 0x10000)) first = Math.max(first, value);
      return { first, second: 0 };
    },
  }];
}
