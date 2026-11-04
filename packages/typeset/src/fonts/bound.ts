import { shapingOf, type Font, type MeasureOptions } from "./font.ts";
import { indicFeatures, indicForms } from "./indic.ts";
import { joiningStages } from "./joining.ts";
import type { SubstitutionRule } from "./substitution.ts";

/** The limit of `widthBound` for the width of a text over a declared set of characters. It needs no measurement. */
export interface WidthBound {
  /** The largest total advance of one character with all its expansions, in font units. */
  readonly advance: number;
  /** The largest positive kerning of one glyph, in font units. */
  readonly kerning: number;
  /** The largest count of glyphs of one character. */
  readonly glyphs: number;
  /**
   * This function gives the limit in px for a text of `length` UTF-16 units at the size `size`. It takes the length of a
   * string, so it does not read the text. The limit is for a text with only the characters of the set.
   */
  width(length: number, size: number): number;
}

/**
 * The largest count of passes over the lookups of a shaper with stages. A pass covers one stage, and no shaper has more stages:
 * the Indic shaper has 13 and the joining has 11. A rule that expands its own glyph has no fixed point, so it stops at this count.
 */
const ROUNDS = 16;
/** The relative error of one rounding to single precision. */
const FLOAT32 = 2 ** -24;
/** The relative error of one rounding to double precision. */
const FLOAT64 = 2 ** -53;
/** The largest size of a kerning value of a `ValueRecord`, and of its variation delta, in font units: the range of `int16`. */
const KERNING_RANGE = 2 ** 15;

/** The largest expansion of a glyph: the sum of its advances, and the count of its glyphs. */
interface Expansion {
  readonly advance: number;
  readonly glyphs: number;
}

function larger(a: Expansion, b: Expansion): Expansion {
  return { advance: Math.max(a.advance, b.advance), glyphs: Math.max(a.glyphs, b.glyphs) };
}

function sum(a: Expansion, b: Expansion): Expansion {
  return { advance: a.advance + b.advance, glyphs: a.glyphs + b.glyphs };
}

/** This function tells if a rule can apply to the glyphs `reached`. A ligature needs its first glyph and all its components. */
function applies(rule: SubstitutionRule, reached: ReadonlySet<number>): boolean {
  return reached.has(rule.from) && (rule.components ?? []).every((glyph) => reached.has(glyph));
}

/** This function adds the glyphs that the rules can give to `reached`. */
function reach(reached: Set<number>, rules: readonly SubstitutionRule[]): void {
  for (let size = -1; size !== reached.size; ) {
    size = reached.size;
    for (const rule of rules) if (applies(rule, reached)) for (const glyph of rule.to) reached.add(glyph);
  }
}

/**
 * This function applies one list of rules to the expansions. Each rule uses the values from before the list. A lookup applies
 * once at a position, so its output does not go back into it. The function tells if a value changed.
 */
function relax(rules: readonly SubstitutionRule[], expansions: Map<number, Expansion>): boolean {
  const changes: (readonly [number, Expansion])[] = [];
  for (const { from, to } of rules) {
    const before = expansions.get(from)!;
    const after = to.reduce((total, glyph) => sum(total, expansions.get(glyph)!), { advance: 0, glyphs: 0 });
    if (after.advance > before.advance || after.glyphs > before.glyphs) changes.push([from, after]);
  }
  for (const [from, after] of changes) expansions.set(from, larger(expansions.get(from)!, after));
  return changes.length > 0;
}

/**
 * This function gives the largest expansion of each glyph of `reached`. Each ligature charges its first glyph, so each output
 * glyph comes from one input glyph. Each pass goes backward over the lookups: a glyph then gets the expansions of the lookups
 * after the lookup that makes it. A shaper with stages goes over the list again for each stage, so the passes repeat.
 *
 * One context rule can apply its nested lookups in any order. So the lists of a lookup with nested lookups repeat until no
 * value changes, with the same limit. A value that stops changing holds for each order.
 */
function expansionsOf(font: Font, reached: ReadonlySet<number>, lookups: readonly (readonly (readonly SubstitutionRule[])[])[], rounds: number): Map<number, Expansion> {
  const expansions = new Map<number, Expansion>();
  for (const glyph of reached) expansions.set(glyph, { advance: Math.max(0, font.advance(glyph)), glyphs: 1 });
  const active = lookups.map((lists) => lists.map((rules) => rules.filter((rule) => applies(rule, reached))));
  for (let round = 0; round < rounds; round++) {
    let changed = false;
    for (let i = active.length - 1; i >= 0; i--) {
      const lists = active[i]!;
      for (let step = 0; step < (lists.length > 1 ? ROUNDS : 1); step++) {
        let moved = false;
        for (const rules of lists) moved = relax(rules, expansions) || moved;
        if (!moved) break;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return expansions;
}

/**
 * This function gives a limit for the width of each text over the characters `characters`, with no measurement. For each such
 * text, `measureWidth(font, text, size, options)` is at most `width(text.length, size)` of the result. Give the same `options`.
 * A text with another character has no limit from this function.
 *
 * The limit is sound, not tight. It follows the widest character of the set. It includes each glyph of the GSUB closure, each
 * dotted circle, each part or composite of the Indic normalization, and the largest positive kerning.
 */
export function widthBound(font: Font, characters: string, options: MeasureOptions = {}): WidthBound {
  const { script, features, shaper, kerning: pairLookups } = shapingOf(font, options);
  const set = new Set(Array.from(characters, (character) => character.codePointAt(0)!));
  const indic = shaper === "indic" ? indicForms(set, (codePoint) => font.glyph(codePoint) !== 0) : undefined;

  // The roots: the glyph of each code point that the shaper can see. A character with no glyph gives the glyph 0
  const reached = new Set([...(indic?.codePoints ?? set)].map((codePoint) => font.glyph(codePoint)));
  // A union of the features gives the same lookups as the union of the stages. Each stage then counts, in the rounds
  const tags = shaper === "indic" ? indicFeatures(features) : shaper === "joining" ? joiningStages(features, true).flatMap((stage) => stage.features) : features;
  const lookups = font.substitutions(script, tags).map((lookup) => lookup.rules());
  reach(reached, lookups.flat(2));
  // The plain shaper is one stage: it applies each lookup once, in the order of the list
  const expansions = expansionsOf(font, reached, lookups, shaper === "plain" ? 1 : ROUNDS);

  const form = (codePoint: number): Expansion => (indic?.composites.get(codePoint) ?? []).reduce((best, composite) => larger(best, form(composite)), expansions.get(font.glyph(codePoint))!);
  // The Indic shaper can insert a dotted circle before each code point. Without a glyph, the code point U+25CC gives the glyph 0.
  // One code point gets at most one: a circle of the vowel constraints takes the next matra, so that syllable is not broken
  const inserted = indic === undefined ? { advance: 0, glyphs: 0 } : expansions.get(font.glyph(0x25cc))!;
  let largest: Expansion = { advance: 0, glyphs: 0 };
  for (const codePoint of set) {
    const parts = indic?.parts.get(codePoint) ?? [codePoint];
    largest = larger(largest, parts.reduce((total, part) => sum(total, sum(form(part), inserted)), { advance: 0, glyphs: 0 }));
  }

  // One glyph gets at most one first value and one second value from each lookup, and each subtable of a lookup is an alternative
  let kerning = 0;
  for (const lookup of pairLookups) {
    const { first, second } = lookup.largest(reached);
    kerning += first + second;
  }

  const { advance, glyphs } = largest;
  const pixel = options.rounding === "pixel";
  const float32 = options.sum === "float32" && !pixel;
  // Pixel: an advance gets at most 1/128 px from the grid of 26.6, and then 0.5 px. A kerning sum gets at most 0.5 px
  const pixelMargin = pixel ? 0.5 + 1 / 128 + (kerning > 0 ? 0.5 : 0) : 0;
  // Float32: each lookup gives a glyph two positions, in units of 1/65536 px. A negative value gets no help from the relative
  // factor below, so it has its own margin. The floor of a value and the round of a delta give 1 unit, the floor of the
  // multiplier gives 0.5 units, and the cut of the scale gives KERNING_RANGE / unitsPerEm units to each of the two parts.
  // The single precision gives FLOAT32 to the value and 4 FLOAT32 to the delta
  const positions = pairLookups.length * 2;
  const positionMargin = float32 ? (positions * (1.5 + (2 * KERNING_RANGE) / font.unitsPerEm)) / 65536 : 0;
  const kerningMargin = float32 ? positions * 5 * FLOAT32 * KERNING_RANGE : 0;
  return {
    advance,
    kerning,
    glyphs,
    width(length: number, size: number): number {
      const total = length * ((advance + glyphs * (kerning + kerningMargin)) * (size / font.unitsPerEm) + glyphs * (pixelMargin + positionMargin));
      // Float32: the fround of a glyph or 4 steps of a positive delta, the fround of a segment, and one step of the sum for
      // each segment. A text has at most one segment for each UTF-16 unit
      const single = float32 ? (1 + FLOAT32) ** (length + 6) : 1;
      // The double precision: the scale and a few products, and one rounding for each step of a sum of fractions
      return total * single * (1 + (2 ** 13 + length) * FLOAT64);
    },
  };
}
