/**
 * The GPOS lookups of `kern` and `dist` outside PairPos. The model does not apply them. This module only tells when one
 * of them changes an advance of a word.
 */
import type { Reader } from "./binary.ts";
import { lookupSkip, pairLookupIndices } from "./kerning.ts";
import { chainRecords, contextRecords, type GlyphFilter } from "./substitution.ts";
import { coverageIndex } from "./tables.ts";

/** This function tells if a lookup changes an advance of the glyphs of a word. */
export type ContextTest = (glyphs: readonly number[]) => boolean;

/** The bits of XAdvance and of its device table in a value format. */
const ADVANCE_BITS = 0x44;
const MAX_NESTING = 8;

/** This function gives the subtables of a lookup with their types, after each extension. */
function subtablesOf(lookup: Reader): (readonly [number, Reader])[] {
  return Array.from({ length: lookup.u16(4) }, (_, s) => {
    const subtable = lookup.part(lookup.u16(6 + s * 2));
    return lookup.u16(0) === 9 ? [subtable.u16(2), subtable.part(subtable.u32(4))] : [lookup.u16(0), subtable];
  });
}

/**
 * This function gives a test for each lookup of `kern` and `dist` that the model does not apply and that can change an
 * advance. A chained rule of format 3 must match. A rule of another format counts when its coverage has the glyph.
 * When `zeroesMarks` is `true`, HarfBuzz sets each mark to zero after GPOS. Thus a value on a mark changes no width.
 */
export function readContextKerning(gpos: Reader, script: string, filter: GlyphFilter, zeroesMarks: boolean): ContextTest[] {
  const lookups = gpos.part(gpos.u16(8));
  const lookupAt = (index: number): Reader => lookups.part(lookups.u16(2 + index * 2));
  const changes = (type: number, t: Reader, depth: number): boolean => {
    if (type === 1) return (t.u16(4) & ADVANCE_BITS) !== 0;
    if (type === 2) return ((t.u16(4) | t.u16(6)) & ADVANCE_BITS) !== 0;
    if (type === 3) return true;
    if ((type !== 7 && type !== 8) || depth >= MAX_NESTING) return false;
    return (type === 7 ? contextRecords(t) : chainRecords(t)).some((record) => subtablesOf(lookupAt(record.lookupIndex)).some(([nested, table]) => changes(nested, table, depth + 1)));
  };
  /** This function matches a chained rule of format 3 at `at`. It gives the position of each input glyph, or `undefined`. */
  const matched = (t: Reader, skip: (glyph: number) => boolean, glyphs: readonly number[], at: number): number[] | undefined => {
    const covers = (offset: number, glyph: number): boolean => coverageIndex(t.part(t.u16(offset)), glyph) >= 0;
    const next = (from: number, step: number): number => {
      let j = from + step;
      while (j >= 0 && j < glyphs.length && skip(glyphs[j]!)) j += step;
      return j >= 0 && j < glyphs.length ? j : -1;
    };
    const backCount = t.u16(2);
    const inputAt = 4 + backCount * 2;
    const inputCount = t.u16(inputAt);
    const aheadAt = inputAt + 2 + inputCount * 2;
    let i = at;
    for (let k = 0; k < backCount; k++) {
      i = next(i, -1);
      if (i < 0 || !covers(4 + k * 2, glyphs[i]!)) return undefined;
    }
    const positions: number[] = [];
    i = at;
    for (let k = 0; k < inputCount; k++) {
      if (i < 0 || !covers(inputAt + 2 + k * 2, glyphs[i]!)) return undefined;
      positions.push(i);
      if (k < inputCount - 1) i = next(i, 1);
    }
    for (let k = 0; k < t.u16(aheadAt); k++) {
      i = next(i, 1);
      if (i < 0 || !covers(aheadAt + 2 + k * 2, glyphs[i]!)) return undefined;
    }
    return positions;
  };
  const applies = (index: number, glyphs: readonly number[], at: number, depth: number): boolean => {
    const lookup = lookupAt(index);
    const skip = lookupSkip(lookup, lookup.u16(2), filter);
    if (skip(glyphs[at]!)) return false;
    return subtablesOf(lookup).some(([type, t]) => {
      if ((depth === 0 && type === 2) || !changes(type, t, depth)) return false;
      if (type < 7 && zeroesMarks && filter.glyphClass(glyphs[at]!) === 3) return false;
      const format = t.u16(0);
      if (type === 8 && format === 3) {
        const positions = matched(t, skip, glyphs, at);
        return positions !== undefined && chainRecords(t).some((record) => {
          const position = positions[record.sequenceIndex];
          return position !== undefined && applies(record.lookupIndex, glyphs, position, depth + 1);
        });
      }
      return coverageIndex(t.part(t.u16(type === 7 && format === 3 ? 6 : 2)), glyphs[at]!) >= 0;
    });
  };
  return pairLookupIndices(gpos, script)
    .filter((index) => subtablesOf(lookupAt(index)).some(([type, t]) => type !== 2 && changes(type, t, 0)))
    .map((index) => (glyphs) => glyphs.some((_, at) => applies(index, glyphs, at, 0)));
}
