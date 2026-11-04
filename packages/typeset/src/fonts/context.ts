/** The GPOS lookups of `kern` and `dist` outside PairPos. The model only detects them. */
import type { Reader } from "./binary.ts";
import { lookupSkip, pairLookupIndices, subtablesOf } from "./kerning.ts";
import { chainRecords, contextRecords, type GlyphFilter } from "./substitution.ts";
import { coverageIndex } from "./tables.ts";

/**
 * This function gives a test for each such lookup that can change an advance. A chained rule of format 3 must match.
 * Another rule needs only its coverage. With `zeroesMarks`, HarfBuzz zeroes a mark after GPOS, so a value on a mark changes no width.
 */
export function readContextKerning(gpos: Reader, script: string, filter: GlyphFilter, zeroesMarks: boolean): ((glyphs: readonly number[]) => boolean)[] {
  const lookups = gpos.part(gpos.u16(8));
  const lookupAt = (index: number): Reader => lookups.part(lookups.u16(2 + index * 2));
  const changes = (type: number, t: Reader, depth: number): boolean => {
    if (type === 7 || type === 8) return depth < 8 && (type === 7 ? contextRecords(t) : chainRecords(t)).some((record) => subtablesOf(lookupAt(record.lookupIndex), 9).some(([nested, table]) => changes(nested, table, depth + 1)));
    // The bits 0x44 are XAdvance and its device table
    return type === 3 || ((type === 1 || type === 2) && ((t.u16(4) | (type === 2 ? t.u16(6) : 0)) & 0x44) !== 0);
  };
  const applies = (index: number, glyphs: readonly number[], at: number, depth: number): boolean => {
    const lookup = lookupAt(index);
    const skip = lookupSkip(lookup, lookup.u16(2), filter);
    return !skip(glyphs[at]!) && subtablesOf(lookup, 9).some(([type, t]) => {
      if ((depth === 0 && type === 2) || !changes(type, t, depth) || (type < 7 && zeroesMarks && filter.glyphClass(glyphs[at]!) === 3)) return false;
      const covers = (offset: number, glyph: number): boolean => coverageIndex(t.part(t.u16(offset)), glyph) >= 0;
      if (type !== 8 || t.u16(0) !== 3) return covers(type === 7 && t.u16(0) === 3 ? 6 : 2, glyphs[at]!);
      const walk = (from: number, step: number, offset: number, count: number, seen: number[] = []): number => {
        let i = from;
        for (let k = 0; k < count; k++) {
          do i += step;
          while (i >= 0 && i < glyphs.length && skip(glyphs[i]!));
          if (i < 0 || i >= glyphs.length || !covers(offset + k * 2, glyphs[i]!)) return -1;
          seen.push(i);
        }
        return i;
      };
      const inputAt = 4 + t.u16(2) * 2;
      const aheadAt = inputAt + 2 + t.u16(inputAt) * 2;
      const positions = [at];
      if (!covers(inputAt + 2, glyphs[at]!) || walk(at, -1, 4, t.u16(2)) < 0) return false;
      const last = walk(at, 1, inputAt + 4, t.u16(inputAt) - 1, positions);
      if (last < 0 || walk(last, 1, aheadAt + 2, t.u16(aheadAt)) < 0) return false;
      return chainRecords(t).some((record) => record.sequenceIndex < positions.length && applies(record.lookupIndex, glyphs, positions[record.sequenceIndex]!, depth + 1));
    });
  };
  return pairLookupIndices(gpos, script)
    .filter((index) => subtablesOf(lookupAt(index), 9).some(([type, t]) => type !== 2 && changes(type, t, 0)))
    .map((index) => (glyphs: readonly number[]) => glyphs.some((_, at) => applies(index, glyphs, at, 0)));
}
