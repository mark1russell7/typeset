import type { Reader } from "./binary.ts";
import { IGNORE_BASE, IGNORE_LIGATURES, IGNORE_MARKS, scriptTags } from "./kerning.ts";
import { classOf, coverageGlyphs, coverageIndex } from "./tables.ts";

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

/** The glyph property of HarfBuzz for a glyph that a substitution changed. */
export const SUBSTITUTED = 0x10;
/** The glyph property of HarfBuzz for a glyph that a ligature substitution made. */
export const LIGATED = 0x20;
/** The glyph property of HarfBuzz for a glyph that a multiple substitution made, with more than one glyph. */
export const MULTIPLIED = 0x40;

/**
 * The data that a syllabic shaper keeps with each glyph, as the `hb_glyph_info_t` of HarfBuzz keeps it. A substitution
 * gives each new glyph a copy of the data of the glyph that it replaces. A ligature keeps the data of its first glyph.
 */
export interface GlyphInfo {
  /** The feature mask. A lookup starts only at a glyph with a bit of the mask of the lookup. */
  mask: number;
  /** The syllable byte of HarfBuzz: the serial number in the high 4 bits, and the syllable type in the low 4 bits. */
  syllable: number;
  /** The glyph properties `SUBSTITUTED`, `LIGATED` and `MULTIPLIED`. */
  props: number;
  /** The category of the shaper. */
  category: number;
  /** The position of the shaper. */
  position: number;
  /** The code point of the character of the glyph, after the normalization. */
  readonly codePoint: number;
}

/** One substitution that a lookup can do, with no context. */
export interface SubstitutionRule {
  /** The glyph that the rule replaces. The first glyph of a ligature is this glyph. */
  readonly from: number;
  /** The glyphs that replace it. A multiple substitution can give no glyph. */
  readonly to: readonly number[];
  /** The other glyphs of a ligature, in order. Another rule has no such glyphs. */
  readonly components?: readonly number[];
}

/** A lookup of GSUB for one script and one set of features. */
export interface SubstitutionLookup {
  /** The index of the lookup in the lookup list of GSUB. */
  readonly index: number;
  /** The lookup type, from 1 to 8. The type of an Extension lookup is the type of its subtables. */
  readonly type: number;
  /** The lookup flags. */
  readonly flags: number;
  /** The tags of the features that use the lookup. */
  readonly features: readonly string[];
  /**
   * This function applies the lookup to all the glyphs of a text. It changes the array. The array `masks`, when it is
   * given, has one mask for each glyph. Then the lookup starts only at a glyph whose mask has a bit of `mask`, as the
   * feature masks of HarfBuzz do. The function keeps `masks` in step with the glyphs.
   */
  apply(glyphs: number[], masks?: number[], mask?: number): void;
  /**
   * This function applies the lookup with the data `infos` of the glyphs, as HarfBuzz applies a lookup of a syllabic shaper.
   * The lookup starts at a glyph with a bit of `mask`, and each input glyph after it also needs a bit of `mask`. When
   * `perSyllable` is true, all the matched glyphs have the syllable of the first glyph. The function keeps `infos` in step.
   */
  applyInfos(glyphs: number[], infos: GlyphInfo[], mask: number, perSyllable: boolean): void;
  /**
   * This function tells if the lookup changes the glyph sequence `glyphs` when the sequence is all the text, as
   * `hb_ot_layout_lookup_would_substitute` with zero context tells it. A context rule with backtrack or lookahead does not apply.
   */
  wouldApply(glyphs: readonly number[]): boolean;
  /**
   * This function gives the rules of the lookup, and the rules of each lookup that it nests in a context rule. Each lookup
   * has one list, and the list of this lookup is the first. The lists do not tell a context, so each nested rule counts.
   * An alternate substitution gives one rule for each alternate.
   */
  rules(): readonly (readonly SubstitutionRule[])[];
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

/** This function gives each rule table of the rule sets at `at` of a context subtable of format 1 or 2. An offset 0 is an empty set. */
function ruleTables(t: Reader, at: number): Reader[] {
  const tables: Reader[] = [];
  for (let s = 0; s < t.u16(at); s++) {
    const offset = t.u16(at + 2 + s * 2);
    if (offset === 0) continue;
    const set = t.part(offset);
    for (let r = 0; r < set.u16(0); r++) tables.push(set.part(set.u16(2 + r * 2)));
  }
  return tables;
}

/** This function gives the records of each rule of a context subtable (lookup type 5). */
export function contextRecords(t: Reader): SequenceRecord[] {
  const format = t.u16(0);
  if (format === 3) return records(t, 6 + t.u16(2) * 2, t.u16(4));
  return ruleTables(t, format === 2 ? 6 : 4).flatMap((rule) => records(rule, 4 + (rule.u16(0) - 1) * 2, rule.u16(2)));
}

/** This function gives the records of each rule of a chained context subtable (lookup type 6). */
export function chainRecords(t: Reader): SequenceRecord[] {
  const format = t.u16(0);
  if (format === 3) {
    const inputAt = 4 + t.u16(2) * 2;
    const aheadAt = inputAt + 2 + t.u16(inputAt) * 2;
    const recordsAt = aheadAt + 2 + t.u16(aheadAt) * 2;
    return records(t, recordsAt + 2, t.u16(recordsAt));
  }
  return ruleTables(t, format === 2 ? 10 : 4).flatMap((rule) => {
    const inputAt = 2 + rule.u16(0) * 2;
    const aheadAt = inputAt + 2 + Math.max(0, rule.u16(inputAt) - 1) * 2;
    const recordsAt = aheadAt + 2 + rule.u16(aheadAt) * 2;
    return records(rule, recordsAt + 2, rule.u16(recordsAt));
  });
}

/** This function adds the rules of one subtable of a lookup type to `rules`, and each nested lookup to `nested`. */
function readRules(type: number, t: Reader, rules: SubstitutionRule[], nested: number[]): void {
  if (type === 5 || type === 6) {
    for (const record of type === 5 ? contextRecords(t) : chainRecords(t)) nested.push(record.lookupIndex);
    return;
  }
  if (type < 1 || type > 8 || type === 7) return;
  const format = t.u16(0);
  for (const [from, index] of coverageGlyphs(t.part(t.u16(2)))) {
    if (type === 1) rules.push({ from, to: [format === 1 ? (from + t.i16(4)) & 0xffff : t.u16(6 + index * 2)] });
    else if (type === 2) {
      const sequence = t.part(t.u16(6 + index * 2));
      rules.push({ from, to: Array.from({ length: sequence.u16(0) }, (_, k) => sequence.u16(2 + k * 2)) });
    } else if (type === 3) {
      const set = t.part(t.u16(6 + index * 2));
      for (let k = 0; k < set.u16(0); k++) rules.push({ from, to: [set.u16(2 + k * 2)] });
    } else if (type === 4) {
      const set = t.part(t.u16(6 + index * 2));
      for (let l = 0; l < set.u16(0); l++) {
        const ligature = set.part(set.u16(2 + l * 2));
        rules.push({ from, to: [ligature.u16(0)], components: Array.from({ length: ligature.u16(2) - 1 }, (_, k) => ligature.u16(4 + k * 2)) });
      }
    } else {
      const aheadAt = 6 + t.u16(4) * 2;
      rules.push({ from, to: [t.u16(aheadAt + 2 + t.u16(aheadAt) * 2 + 2 + index * 2)] });
    }
  }
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

  /**
   * The masks of the glyphs of the current call of `applyAll`, or `undefined`. A substitution that adds or removes glyphs
   * changes this array in the same way.
   */
  private masks: number[] | undefined;

  /** The data of the glyphs of the current call of `applyRun`, or `undefined`. */
  private infos: GlyphInfo[] | undefined;
  /** The mask of the current call of `applyRun`. Each input glyph needs a bit of it. */
  private lookupMask = -1;
  /** It is true when the matched glyphs of the current call of `applyRun` need the syllable of the first glyph. */
  private perSyllable = false;

  /**
   * This function replaces `count` glyphs at `at` with `replacement`. Each new glyph gets the mask and the data of the
   * glyph at `at`.
   */
  private splice(glyphs: number[], at: number, count: number, replacement: readonly number[]): void {
    glyphs.splice(at, count, ...replacement);
    const masks = this.masks;
    if (masks !== undefined) masks.splice(at, count, ...replacement.map(() => masks[at] ?? 0));
    const infos = this.infos;
    if (infos !== undefined) {
      const source = infos[at]!;
      infos.splice(at, count, ...replacement.map(() => ({ ...source })));
    }
  }

  /** This function adds the glyph properties `set` to the glyph at `i`, and then removes the properties `clear`. */
  private setProps(i: number, set: number, clear = 0): void {
    const info = this.infos?.[i];
    if (info !== undefined) info.props = (info.props | set) & ~clear;
  }

  /**
   * This function tells if the glyph at `j` can match for the glyph at `first`. An input glyph needs a bit of the mask of
   * the lookup. With the per-syllable matching, each glyph needs the syllable of `first`.
   */
  private admits(j: number, first: number, input: boolean): boolean {
    const infos = this.infos;
    if (infos === undefined) return true;
    if (input && (infos[j]!.mask & this.lookupMask) === 0) return false;
    const syllable = infos[first]?.syllable ?? 0;
    return !this.perSyllable || syllable === 0 || infos[j]!.syllable === syllable;
  }

  /** This function applies a lookup to all the glyphs with their data `infos`, as `applyInfos` of `SubstitutionLookup` tells. */
  applyRun(index: number, glyphs: number[], infos: GlyphInfo[], mask: number, perSyllable: boolean): void {
    const lookup = this.lookup(index);
    if (lookup === undefined) return;
    this.infos = infos;
    this.lookupMask = mask;
    this.perSyllable = perSyllable;
    try {
      this.applyMasked(lookup, glyphs, (i) => (infos[i]!.mask & mask) !== 0);
    } finally {
      this.infos = undefined;
      this.lookupMask = -1;
      this.perSyllable = false;
    }
  }

  /**
   * This function applies a lookup to all the glyphs, as the main loop of a shaper does. With `masks`, the lookup starts
   * only at a glyph whose mask has a bit of `mask`.
   */
  applyAll(index: number, glyphs: number[], masks?: number[], mask = -1): void {
    const lookup = this.lookup(index);
    if (lookup === undefined) return;
    this.masks = masks;
    try {
      this.applyMasked(lookup, glyphs, (i) => masks === undefined || ((masks[i] ?? 0) & mask) !== 0);
    } finally {
      this.masks = undefined;
    }
  }

  private applyMasked(lookup: Lookup, glyphs: number[], selected: (i: number) => boolean): void {
    if (lookup.type === 8) {
      for (let i = glyphs.length - 1; i >= 0; i--) if (selected(i) && !lookup.skip(glyphs[i]!)) this.reverse(lookup, glyphs, i);
      return;
    }
    let i = 0;
    while (i < glyphs.length) {
      if (!selected(i) || lookup.skip(glyphs[i]!)) {
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
      if (at < 0 || !this.admits(at, i, true) || !test(k, glyphs[at]!)) return undefined;
      positions.push(at);
    }
    return positions;
  }

  private matchBacktrack(lookup: Lookup, glyphs: readonly number[], i: number, count: number, test: (k: number, glyph: number) => boolean): boolean {
    let at = i;
    for (let k = 0; k < count; k++) {
      at = this.previousOf(lookup, glyphs, at - 1);
      if (at < 0 || !this.admits(at, i, false) || !test(k, glyphs[at]!)) return false;
    }
    return true;
  }

  private matchLookahead(lookup: Lookup, glyphs: readonly number[], first: number, last: number, count: number, test: (k: number, glyph: number) => boolean): boolean {
    let at = last;
    for (let k = 0; k < count; k++) {
      at = this.nextOf(lookup, glyphs, at + 1);
      if (at < 0 || !this.admits(at, first, false) || !test(k, glyphs[at]!)) return false;
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
      if (!this.matchLookahead(lookup, glyphs, i, i, aheadCount, (k, g) => coverageIndex(t.part(t.u16(aheadAt + 2 + k * 2)), g) >= 0)) continue;
      glyphs[i] = t.u16(substituteAt + 2 + index * 2);
      this.setProps(i, SUBSTITUTED);
      return true;
    }
    return false;
  }

  /** This function tells if a lookup changes the sequence `glyphs` with no context, as `wouldApply` of `SubstitutionLookup` tells. */
  wouldApply(index: number, glyphs: readonly number[]): boolean {
    const lookup = this.lookup(index);
    if (lookup === undefined || glyphs.length === 0) return false;
    const [first] = glyphs as [number];
    return lookup.subtables.some((t) => {
      const format = t.u16(0);
      if (lookup.type === 1 || lookup.type === 2 || lookup.type === 3 || lookup.type === 8) return glyphs.length === 1 && coverageIndex(t.part(t.u16(2)), first) >= 0;
      if (lookup.type === 4) {
        const index = coverageIndex(t.part(t.u16(2)), first);
        if (index < 0) return false;
        const set = t.part(t.u16(6 + index * 2));
        return Array.from({ length: set.u16(0) }, (_, l) => set.part(set.u16(2 + l * 2))).some((ligature) => ligature.u16(2) === glyphs.length && glyphs.every((g, k) => k === 0 || ligature.u16(4 + (k - 1) * 2) === g));
      }
      if (lookup.type !== 5 && lookup.type !== 6) return false;
      const chain = lookup.type === 6;
      if (format === 3) {
        const backCount = chain ? t.u16(2) : 0;
        const inputAt = chain ? 4 + backCount * 2 : 2;
        const count = t.u16(inputAt);
        const coverageAt = chain ? inputAt + 2 : 6;
        if (chain && (backCount !== 0 || t.u16(inputAt + 2 + count * 2) !== 0)) return false;
        return count === glyphs.length && glyphs.every((g, k) => coverageIndex(t.part(t.u16(coverageAt + k * 2)), g) >= 0);
      }
      const index = coverageIndex(t.part(t.u16(2)), first);
      if (index < 0) return false;
      const classes = format === 2 ? t.part(t.u16(chain ? 6 : 4)) : undefined;
      const value = (g: number) => (classes === undefined ? g : classOf(classes, g));
      const setIndex = classes === undefined ? index : value(first);
      const setCountAt = chain ? (format === 2 ? 10 : 4) : format === 2 ? 6 : 4;
      if (setIndex >= t.u16(setCountAt) || t.u16(setCountAt + 2 + setIndex * 2) === 0) return false;
      const set = t.part(t.u16(setCountAt + 2 + setIndex * 2));
      for (let r = 0; r < set.u16(0); r++) {
        const rule = set.part(set.u16(2 + r * 2));
        const backCount = chain ? rule.u16(0) : 0;
        const inputAt = chain ? 2 + backCount * 2 : 0;
        const count = rule.u16(inputAt);
        const inputStart = chain ? inputAt + 2 : 4;
        if (chain && (backCount !== 0 || rule.u16(inputStart + Math.max(0, count - 1) * 2) !== 0)) continue;
        if (count === glyphs.length && glyphs.every((g, k) => k === 0 || value(g) === rule.u16(inputStart + (k - 1) * 2))) return true;
      }
      return false;
    });
  }

  /** This function gives the rules of a lookup and of each lookup that it nests, as `rules` of `SubstitutionLookup` tells. */
  rulesOf(index: number): SubstitutionRule[][] {
    const lists: SubstitutionRule[][] = [];
    const seen = new Set<number>();
    const visit = (at: number): void => {
      const lookup = this.lookup(at);
      if (seen.has(at) || lookup === undefined) return;
      seen.add(at);
      const rules: SubstitutionRule[] = [];
      const nested: number[] = [];
      for (const subtable of lookup.subtables) readRules(lookup.type, subtable, rules, nested);
      lists.push(rules);
      nested.forEach(visit);
    };
    visit(index);
    return lists;
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
        this.setProps(i, SUBSTITUTED);
        return i + 1;
      }
      case 2: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        const sequence = t.part(t.u16(6 + index * 2));
        const replacement = Array.from({ length: sequence.u16(0) }, (_, k) => sequence.u16(2 + k * 2));
        this.splice(glyphs, i, 1, replacement);
        for (let k = 0; k < replacement.length; k++) this.setProps(i + k, replacement.length > 1 ? SUBSTITUTED | MULTIPLIED : SUBSTITUTED);
        return i + replacement.length;
      }
      case 3: {
        const index = coverageIndex(t.part(t.u16(2)), glyph);
        if (index < 0) return -1;
        const set = t.part(t.u16(6 + index * 2));
        if (set.u16(0) > 0) glyphs[i] = set.u16(2);
        this.setProps(i, SUBSTITUTED);
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
          // A ligature is not a multiplied glyph, even when one of its glyphs was
          this.setProps(i, SUBSTITUTED | LIGATED, MULTIPLIED);
          for (let k = positions.length - 1; k >= 1; k--) this.splice(glyphs, positions[k]!, 1, []);
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
      if (!this.matchLookahead(lookup, glyphs, i, positions[positions.length - 1]!, aheadCount, (k, g) => covers(aheadAt + 2 + k * 2, g))) return -1;
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
      if (!this.matchLookahead(lookup, glyphs, i, positions[positions.length - 1]!, aheadCount, (k, g) => valueIn(aheadClasses, g) === rule.u16(aheadAt + 2 + k * 2))) continue;
      return this.applyRecords(glyphs, positions, records(rule, recordsAt + 2, rule.u16(recordsAt)), depth);
    }
    return -1;
  }
}

/**
 * This function gives the lookups of the features `features` of GSUB for a script, in the order of the lookup list, as
 * HarfBuzz applies them. The lookups include the lookups of the necessary feature of the language system.
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
  const indices = new Map<number, string[]>();
  const add = (featureIndex: number, required: boolean) => {
    const record = 2 + featureIndex * 6;
    if (featureIndex >= featureList.u16(0)) return;
    const tag = featureList.tag(record);
    if (!required && !wanted.has(tag)) return;
    const feature = featureList.part(featureList.u16(record + 4));
    for (let k = 0; k < feature.u16(2); k++) {
      const index = feature.u16(4 + k * 2);
      const tags = indices.get(index) ?? [];
      if (!tags.includes(tag)) tags.push(tag);
      indices.set(index, tags);
    }
  };
  const required = langSys.u16(2);
  if (required !== 0xffff) add(required, true);
  for (let i = 0; i < langSys.u16(4); i++) add(langSys.u16(6 + i * 2), false);
  const table = new Gsub(gsub, filter);
  const result: SubstitutionLookup[] = [];
  for (const [index, tags] of [...indices].sort(([a], [b]) => a - b)) {
    const lookup = table.lookup(index);
    if (lookup === undefined) continue;
    result.push({
      index,
      type: lookup.type,
      flags: lookup.flags,
      features: tags,
      apply: (glyphs: number[], masks?: number[], mask?: number) => table.applyAll(index, glyphs, masks, mask),
      applyInfos: (glyphs: number[], infos: GlyphInfo[], mask: number, perSyllable: boolean) => table.applyRun(index, glyphs, infos, mask, perSyllable),
      wouldApply: (glyphs: readonly number[]) => table.wouldApply(index, glyphs),
      rules: () => table.rulesOf(index),
    });
  }
  return result;
}
