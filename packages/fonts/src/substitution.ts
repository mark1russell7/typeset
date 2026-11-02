import type { Reader } from "./binary.ts";
import { IGNORE_BASE, IGNORE_LIGATURES, IGNORE_MARKS, scriptTags } from "./kerning.ts";
import { classOf, coverageIndex } from "./tables.ts";

/**
 * The GSUB features that the default model applies: the features that HarfBuzz and Chromium apply to horizontal text
 * when the page does not change them.
 */
export const defaultFeatures: readonly string[] = ["ccmp", "locl", "rlig", "liga", "clig", "calt", "rclt"];

/** The lookup flag that selects a mark filtering set of GDEF. */
const USE_MARK_FILTERING_SET = 0x10;
/** The largest depth of nested lookups, as in HarfBuzz. */
const MAX_NESTING = 64;

/** The data of GDEF that tells which glyphs a lookup skips. */
export interface GlyphFilter {
  /** This function gives the GDEF class of a glyph: 1 base, 2 ligature, 3 mark, 4 component, 0 none. */
  glyphClass(glyph: number): number;
  /** This function gives the mark attachment class of a glyph, or 0. */
  markAttachClass(glyph: number): number;
  /** This function tells if a glyph is in the mark filtering set `set`. */
  inMarkSet(set: number, glyph: number): boolean;
}

/** This function reads the glyph classes, the mark attachment classes and the mark filtering sets of GDEF. */
export function readGlyphFilter(gdef: Reader | undefined, glyphClass: (glyph: number) => number): GlyphFilter {
  const attachOffset = gdef === undefined ? 0 : gdef.u16(10);
  const attach = attachOffset === 0 ? undefined : gdef!.part(attachOffset);
  // GDEF 1.2 adds the MarkGlyphSetsDef table
  const setsOffset = gdef === undefined || gdef.u16(2) < 2 ? 0 : gdef.u16(12);
  const sets = setsOffset === 0 ? undefined : gdef!.part(setsOffset);
  return {
    glyphClass,
    markAttachClass: (glyph) => (attach === undefined ? 0 : classOf(attach, glyph)),
    inMarkSet(set, glyph) {
      if (sets === undefined || set >= sets.u16(2)) return false;
      return coverageIndex(sets.part(sets.u32(4 + set * 4)), glyph) >= 0;
    },
  };
}

/** A lookup of GSUB for one script and one set of features. */
export interface SubstitutionLookup {
  /** The index of the lookup in the lookup list of GSUB. */
  readonly index: number;
  /** This function applies the lookup to all the glyphs of a text. It changes the array. */
  apply(glyphs: number[]): void;
}

/** One lookup of the lookup list, with the subtables of an extension lookup resolved. */
interface Lookup {
  readonly type: number;
  readonly flags: number;
  readonly subtables: readonly Reader[];
  readonly skip: (glyph: number) => boolean;
}

/** One SubstLookupRecord of a context rule: the input position and the lookup to apply there. */
interface SequenceRecord {
  readonly sequenceIndex: number;
  readonly lookupIndex: number;
}

function records(table: Reader, at: number, count: number): SequenceRecord[] {
  return Array.from({ length: count }, (_, k) => ({ sequenceIndex: table.u16(at + k * 4), lookupIndex: table.u16(at + k * 4 + 2) }));
}

/** The lookups of one GSUB table. It reads each lookup at its first use. */
class Gsub {
  private readonly lookups: Reader;
  private readonly filter: GlyphFilter;
  private readonly cache = new Map<number, Lookup>();

  constructor(table: Reader, filter: GlyphFilter) {
    this.lookups = table.part(table.u16(8));
    this.filter = filter;
  }

  lookup(index: number): Lookup | undefined {
    if (index >= this.lookups.u16(0)) return undefined;
    let found = this.cache.get(index);
    if (found === undefined) {
      const table = this.lookups.part(this.lookups.u16(2 + index * 2));
      const type = table.u16(0);
      const flags = table.u16(2);
      const count = table.u16(4);
      const markSet = (flags & USE_MARK_FILTERING_SET) !== 0 ? table.u16(6 + count * 2) : -1;
      const subtables: Reader[] = [];
      let subtype = type;
      for (let s = 0; s < count; s++) {
        const subtable = table.part(table.u16(6 + s * 2));
        if (type === 7) {
          subtype = subtable.u16(2);
          subtables.push(subtable.part(subtable.u32(4)));
        } else subtables.push(subtable);
      }
      const { glyphClass, markAttachClass, inMarkSet } = this.filter;
      const skip = (glyph: number): boolean => {
        const kind = glyphClass(glyph);
        if ((flags & IGNORE_BASE) !== 0 && kind === 1) return true;
        if ((flags & IGNORE_LIGATURES) !== 0 && kind === 2) return true;
        if (kind !== 3) return false;
        if ((flags & IGNORE_MARKS) !== 0) return true;
        if (markSet >= 0) return !inMarkSet(markSet, glyph);
        const attach = flags >> 8;
        return attach !== 0 && markAttachClass(glyph) !== attach;
      };
      found = { type: subtype, flags, subtables, skip };
      this.cache.set(index, found);
    }
    return found;
  }

  /** This function applies a lookup to all the glyphs, as the main loop of a shaper does. */
  applyAll(index: number, glyphs: number[]): void {
    const lookup = this.lookup(index);
    if (lookup === undefined) return;
    if (lookup.type === 8) {
      for (let i = glyphs.length - 1; i >= 0; i--) if (!lookup.skip(glyphs[i]!)) this.reverse(lookup, glyphs, i);
      return;
    }
    let i = 0;
    while (i < glyphs.length) {
      if (lookup.skip(glyphs[i]!)) {
        i++;
        continue;
      }
      const before = glyphs.length;
      const next = this.applyAt(lookup, glyphs, i, 0);
      // A deletion (a Sequence with no glyph) gives the same position, and the text is shorter
      i = next < 0 ? i + 1 : next > i || glyphs.length < before ? next : i + 1;
    }
  }

  /** This function applies the first subtable of a lookup that matches at `i`. It gives the next position, or -1. */
  private applyAt(lookup: Lookup, glyphs: number[], i: number, depth: number): number {
    for (const subtable of lookup.subtables) {
      const next = this.subtable(lookup, subtable, glyphs, i, depth);
      if (next >= 0) return next;
    }
    return -1;
  }

  private nextOf(lookup: Lookup, glyphs: readonly number[], from: number): number {
    for (let j = from; j < glyphs.length; j++) if (!lookup.skip(glyphs[j]!)) return j;
    return -1;
  }

  private previousOf(lookup: Lookup, glyphs: readonly number[], from: number): number {
    for (let j = from; j >= 0; j--) if (!lookup.skip(glyphs[j]!)) return j;
    return -1;
  }

  /**
   * This function matches `count` glyphs after the position `i` with a test for each. It gives the positions of the
   * matched glyphs, the first glyph at `i` included, or `undefined`.
   */
  private matchInput(lookup: Lookup, glyphs: readonly number[], i: number, count: number, test: (k: number, glyph: number) => boolean): number[] | undefined {
    const positions = [i];
    let at = i;
    for (let k = 0; k < count; k++) {
      at = this.nextOf(lookup, glyphs, at + 1);
      if (at < 0 || !test(k, glyphs[at]!)) return undefined;
      positions.push(at);
    }
    return positions;
  }

  private matchBacktrack(lookup: Lookup, glyphs: readonly number[], i: number, count: number, test: (k: number, glyph: number) => boolean): boolean {
    let at = i;
    for (let k = 0; k < count; k++) {
      at = this.previousOf(lookup, glyphs, at - 1);
      if (at < 0 || !test(k, glyphs[at]!)) return false;
    }
    return true;
  }

  private matchLookahead(lookup: Lookup, glyphs: readonly number[], last: number, count: number, test: (k: number, glyph: number) => boolean): boolean {
    let at = last;
    for (let k = 0; k < count; k++) {
      at = this.nextOf(lookup, glyphs, at + 1);
      if (at < 0 || !test(k, glyphs[at]!)) return false;
    }
    return true;
  }

  /** This function applies the lookups of the records of a context rule at the matched positions. It gives the next position. */
  private applyRecords(glyphs: number[], positions: number[], list: readonly SequenceRecord[], depth: number): number {
    if (depth < MAX_NESTING) {
      for (const record of list) {
        const at = positions[record.sequenceIndex];
        const nested = this.lookup(record.lookupIndex);
        if (at === undefined || at >= glyphs.length || nested === undefined || nested.skip(glyphs[at]!)) continue;
        const before = glyphs.length;
        if (nested.type === 8) this.reverse(nested, glyphs, at);
        else this.applyAt(nested, glyphs, at, depth + 1);
        const delta = glyphs.length - before;
        if (delta > 0) {
          for (let k = record.sequenceIndex + 1; k < positions.length; k++) positions[k] = positions[k]! + delta;
          positions.splice(record.sequenceIndex + 1, 0, ...Array.from({ length: delta }, (_, k) => at + 1 + k));
        } else if (delta < 0) {
          // A ligature took the next input glyphs: remove their positions and move the others
          positions.splice(record.sequenceIndex + 1, Math.min(-delta, positions.length - record.sequenceIndex - 1));
          for (let k = record.sequenceIndex + 1; k < positions.length; k++) positions[k] = positions[k]! + delta;
        }
      }
    }
    return Math.min(glyphs.length, positions[positions.length - 1]! + 1);
  }

  private reverse(lookup: Lookup, glyphs: number[], i: number): boolean {
    for (const t of lookup.subtables) {
      const index = coverageIndex(t.part(t.u16(2)), glyphs[i]!);
      if (index < 0) continue;
      const backCount = t.u16(4);
      const aheadAt = 6 + backCount * 2;
      const aheadCount = t.u16(aheadAt);
      const substituteAt = aheadAt + 2 + aheadCount * 2;
      if (!this.matchBacktrack(lookup, glyphs, i, backCount, (k, g) => coverageIndex(t.part(t.u16(6 + k * 2)), g) >= 0)) continue;
      if (!this.matchLookahead(lookup, glyphs, i, aheadCount, (k, g) => coverageIndex(t.part(t.u16(aheadAt + 2 + k * 2)), g) >= 0)) continue;
      glyphs[i] = t.u16(substituteAt + 2 + index * 2);
      return true;
    }
    return false;
  }

  /** This function applies one subtable at `i`. It gives the next position, or -1 when the subtable does not match. */
  private subtable(lookup: Lookup, t: Reader, glyphs: number[], i: number, depth: number): number {
    const glyph = glyphs[i]!;
    const format = t.u16(0);
    switch (lookup.type) {
      case 1: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        glyphs[i] = format === 1 ? (glyph + t.i16(4)) & 0xffff : t.u16(6 + index * 2);
        return i + 1;
      }
      case 2: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        const sequence = t.part(t.u16(6 + index * 2));
        const replacement = Array.from({ length: sequence.u16(0) }, (_, k) => sequence.u16(2 + k * 2));
        glyphs.splice(i, 1, ...replacement);
        return i + replacement.length;
      }
      case 3: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        const set = t.part(t.u16(6 + index * 2));
        if (set.u16(0) > 0) glyphs[i] = set.u16(2);
        return i + 1;
      }
      case 4: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        const set = t.part(t.u16(6 + index * 2));
        for (let l = 0; l < set.u16(0); l++) {
          const ligature = set.part(set.u16(2 + l * 2));
          const components = ligature.u16(2);
          const positions = this.matchInput(lookup, glyphs, i, components - 1, (k, g) => g === ligature.u16(4 + k * 2));
          if (positions === undefined) continue;
          glyphs[i] = ligature.u16(0);
          for (let k = positions.length - 1; k >= 1; k--) glyphs.splice(positions[k]!, 1);
          return i + 1;
        }
        return -1;
      }
      case 5:
        return this.context(lookup, t, glyphs, i, depth);
      case 6:
        return this.chainContext(lookup, t, glyphs, i, depth);
      case 8:
        return this.reverse(lookup, glyphs, i) ? i + 1 : -1;
      default:
        return -1;
    }
  }

  private context(lookup: Lookup, t: Reader, glyphs: number[], i: number, depth: number): number {
    const glyph = glyphs[i]!;
    const format = t.u16(0);
    if (format === 3) {
      const count = t.u16(2);
      const recordCount = t.u16(4);
      if (count === 0 || coverageIndex(t.part(t.u16(6)), glyph) < 0) return -1;
      const positions = this.matchInput(lookup, glyphs, i, count - 1, (k, g) => coverageIndex(t.part(t.u16(8 + k * 2)), g) >= 0);
      if (positions === undefined) return -1;
      return this.applyRecords(glyphs, positions, records(t, 6 + count * 2, recordCount), depth);
    }
    const index = coverageIndex(t.part(t.u16(2)), glyph);
    if (index < 0) return -1;
    const classes = format === 2 ? t.part(t.u16(4)) : undefined;
    const setIndex = classes === undefined ? index : classOf(classes, glyph);
    const setCount = t.u16(classes === undefined ? 4 : 6);
    if (setIndex >= setCount) return -1;
    const setOffset = t.u16((classes === undefined ? 6 : 8) + setIndex * 2);
    if (setOffset === 0) return -1;
    const set = t.part(setOffset);
    const value = (g: number) => (classes === undefined ? g : classOf(classes, g));
    for (let r = 0; r < set.u16(0); r++) {
      const rule = set.part(set.u16(2 + r * 2));
      const count = rule.u16(0);
      const recordCount = rule.u16(2);
      const positions = this.matchInput(lookup, glyphs, i, count - 1, (k, g) => value(g) === rule.u16(4 + k * 2));
      if (positions === undefined) continue;
      return this.applyRecords(glyphs, positions, records(rule, 4 + (count - 1) * 2, recordCount), depth);
    }
    return -1;
  }

  private chainContext(lookup: Lookup, t: Reader, glyphs: number[], i: number, depth: number): number {
    const glyph = glyphs[i]!;
    const format = t.u16(0);
    if (format === 3) {
      const backCount = t.u16(2);
      const inputAt = 4 + backCount * 2;
      const inputCount = t.u16(inputAt);
      const aheadAt = inputAt + 2 + inputCount * 2;
      const aheadCount = t.u16(aheadAt);
      const recordsAt = aheadAt + 2 + aheadCount * 2;
      const covers = (offset: number, g: number) => coverageIndex(t.part(t.u16(offset)), g) >= 0;
      if (inputCount === 0 || !covers(inputAt + 2, glyph)) return -1;
      if (!this.matchBacktrack(lookup, glyphs, i, backCount, (k, g) => covers(4 + k * 2, g))) return -1;
      const positions = this.matchInput(lookup, glyphs, i, inputCount - 1, (k, g) => covers(inputAt + 4 + k * 2, g));
      if (positions === undefined) return -1;
      if (!this.matchLookahead(lookup, glyphs, positions[positions.length - 1]!, aheadCount, (k, g) => covers(aheadAt + 2 + k * 2, g))) return -1;
      return this.applyRecords(glyphs, positions, records(t, recordsAt + 2, t.u16(recordsAt)), depth);
    }
    const index = coverageIndex(t.part(t.u16(2)), glyph);
    if (index < 0) return -1;
    const byClass = format === 2;
    const backClasses = byClass ? t.part(t.u16(4)) : undefined;
    const inputClasses = byClass ? t.part(t.u16(6)) : undefined;
    const aheadClasses = byClass ? t.part(t.u16(8)) : undefined;
    const setIndex = inputClasses === undefined ? index : classOf(inputClasses, glyph);
    const setCount = t.u16(byClass ? 10 : 4);
    if (setIndex >= setCount) return -1;
    const setOffset = t.u16((byClass ? 12 : 6) + setIndex * 2);
    if (setOffset === 0) return -1;
    const set = t.part(setOffset);
    const valueIn = (classes: Reader | undefined, g: number) => (classes === undefined ? g : classOf(classes, g));
    for (let r = 0; r < set.u16(0); r++) {
      const rule = set.part(set.u16(2 + r * 2));
      const backCount = rule.u16(0);
      const inputAt = 2 + backCount * 2;
      const inputCount = rule.u16(inputAt);
      const aheadAt = inputAt + 2 + Math.max(0, inputCount - 1) * 2;
      const aheadCount = rule.u16(aheadAt);
      const recordsAt = aheadAt + 2 + aheadCount * 2;
      if (!this.matchBacktrack(lookup, glyphs, i, backCount, (k, g) => valueIn(backClasses, g) === rule.u16(2 + k * 2))) continue;
      const positions = this.matchInput(lookup, glyphs, i, inputCount - 1, (k, g) => valueIn(inputClasses, g) === rule.u16(inputAt + 2 + k * 2));
      if (positions === undefined) continue;
      if (!this.matchLookahead(lookup, glyphs, positions[positions.length - 1]!, aheadCount, (k, g) => valueIn(aheadClasses, g) === rule.u16(aheadAt + 2 + k * 2))) continue;
      return this.applyRecords(glyphs, positions, records(rule, recordsAt + 2, rule.u16(recordsAt)), depth);
    }
    return -1;
  }
}

/**
 * This function gives the lookups of the features `features` of GSUB for a script, in the order of the lookup list, as
 * HarfBuzz applies them. The required feature of the language system is included.
 */
export function readSubstitutions(gsub: Reader, script: string, features: readonly string[], filter: GlyphFilter): SubstitutionLookup[] {
  const scripts = gsub.part(gsub.u16(4));
  const featureList = gsub.part(gsub.u16(6));
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
  if (langSys === undefined || features.length === 0) return [];
  const wanted = new Set(features);
  const indices = new Set<number>();
  const add = (featureIndex: number, required: boolean) => {
    const record = 2 + featureIndex * 6;
    if (featureIndex >= featureList.u16(0) || (!required && !wanted.has(featureList.tag(record)))) return;
    const feature = featureList.part(featureList.u16(record + 4));
    for (let k = 0; k < feature.u16(2); k++) indices.add(feature.u16(4 + k * 2));
  };
  const required = langSys.u16(2);
  if (required !== 0xffff) add(required, true);
  for (let i = 0; i < langSys.u16(4); i++) add(langSys.u16(6 + i * 2), false);
  const table = new Gsub(gsub, filter);
  return [...indices].sort((a, b) => a - b).map((index) => ({ index, apply: (glyphs: number[]) => table.applyAll(index, glyphs) }));
}
