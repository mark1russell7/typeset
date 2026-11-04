/**
 * The Unicode normalization of HarfBuzz, from `hb-ot-shape-normalize.cc`. HarfBuzz decomposes each cluster of a base and its marks.
 * It then sorts the marks, and composes each mark with its base when the font has the glyph of the composite.
 */
import type { Font } from "./font.ts";

const unicodeMark = /\p{M}/u;
const nonspacingMark = /\p{Mn}/u;

/**
 * The classes of HarfBuzz for the marks of Hebrew and Arabic, from `hb-unicode.hh`. Their order is not the canonical order:
 * for example the shadda comes first. Each other pair of marks uses the canonical order.
 */
const sortClasses: ReadonlyMap<number, number> = new Map([
  [0x5b0, 22], [0x5b1, 15], [0x5b2, 16], [0x5b3, 17], [0x5b4, 23], [0x5b5, 18], [0x5b6, 19], [0x5b7, 20], [0x5b8, 21], [0x5b9, 14],
  [0x5ba, 14], [0x5bb, 24], [0x5bc, 12], [0x5bd, 25], [0x5bf, 13], [0x5c1, 10], [0x5c2, 11], [0x5c7, 21], [0xfb1e, 26],
  [0x618, 31], [0x619, 32], [0x61a, 33], [0x64b, 28], [0x64c, 29], [0x64d, 30], [0x64e, 31], [0x64f, 32], [0x650, 33],
  [0x651, 27], [0x652, 34], [0x670, 35], [0x8f0, 28], [0x8f1, 29], [0x8f2, 30],
]);

/** The default ignorables of `hb-unicode.hh`. This set is not the Unicode property: it does not have the Hangul fillers. */
const defaultIgnorable = /[\u00ad\u034f\u061c\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff\ufff0-\ufff8\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]/u;

/** This function tells if a text has a default ignorable. */
export function hasDefaultIgnorable(text: string): boolean {
  return defaultIgnorable.test(text);
}

/** This function tells if the model hides a code point. U+034F with its own glyph of advance 0 stays visible to the kerning. */
export function isHidden(font: Pick<Font, "glyph" | "advance">, codePoint: number): boolean {
  if (!hasDefaultIgnorable(String.fromCodePoint(codePoint))) return false;
  const glyph = font.glyph(codePoint);
  return codePoint !== 0x34f || glyph === 0 || font.advance(glyph) !== 0;
}

/** This function tells if a code point is a mark of Unicode. The first mark of Unicode is U+0300. */
function isMark(codePoint: number): boolean {
  return codePoint >= 0x300 && unicodeMark.test(String.fromCodePoint(codePoint));
}

/** This function tells if a text has a mark of Unicode. */
export function hasMark(text: string): boolean {
  return unicodeMark.test(text);
}

/** This function tells which code points take no advance: nonspacing marks with `classes`, marks with a class after a base with `fallback`. */
export function zeroedMarks(codePoints: readonly number[], classes: boolean, fallback: boolean): boolean[] {
  let base = false;
  return codePoints.map((codePoint) => {
    const character = String.fromCodePoint(codePoint);
    if (!isMark(codePoint)) {
      base = true;
      return false;
    }
    return (classes && nonspacingMark.test(character) && !hasDefaultIgnorable(character)) || (fallback && base && !isStarter(codePoint));
  });
}

function decomposed(codePoint: number): string {
  return String.fromCodePoint(codePoint).normalize("NFD");
}

/**
 * This function tells if the mark `second` sorts before the mark `first`. That is true when the class of `first` is larger
 * than the class of `second`, and neither class is 0. The form NFD of JavaScript gives the canonical order, so no table is needed.
 */
function reorders(first: number, second: number): boolean {
  const firstClass = sortClasses.get(first);
  const secondClass = sortClasses.get(second);
  if (firstClass !== undefined && secondClass !== undefined) return firstClass > secondClass;
  const text = decomposed(first) + decomposed(second);
  return text.normalize("NFD") !== text;
}

/** This function tells if a code point has the combining class 0. U+0345 has the largest class of Unicode. */
function isStarter(codePoint: number): boolean {
  return !isMark(codePoint) || (codePoint !== 0x345 && !reorders(0x345, codePoint));
}

/** This function gives the canonical composite of two code points, or `undefined`. A mark does not compose with a mark. */
function compose(first: number, second: number): number | undefined {
  if (isMark(first)) return undefined;
  const [single, ...rest] = [...String.fromCodePoint(first, second).normalize("NFC")];
  return rest.length === 0 && single !== undefined ? single.codePointAt(0) : undefined;
}

/**
 * This function gives the code points of a character after the decomposition. A character keeps its form when the font has
 * no glyph for one of its parts, or when the set `kept` has the character.
 */
function decomposition(codePoint: number, hasGlyph: (codePoint: number) => boolean, kept: ReadonlySet<number>): number[] {
  const parts = kept.has(codePoint) ? [codePoint] : Array.from(decomposed(codePoint), (part) => part.codePointAt(0)!);
  return (parts.length > 1 || parts[0] !== codePoint) && parts.every(hasGlyph) ? parts : [codePoint];
}

/** The rules of one shaper for `normalizeCodePoints`. */
export interface NormalizeRules {
  /** This function tells if the font has a glyph for a code point. */
  readonly hasGlyph: (codePoint: number) => boolean;
  /**
   * When this is `true`, a character with a glyph and with no mark near it keeps its form, as the mode `COMPOSED_DIACRITICS`
   * of HarfBuzz does. When this is `false`, each character decomposes, as `COMPOSED_DIACRITICS_NO_SHORT_CIRCUIT` does.
   */
  readonly shortCircuit: boolean;
  /** The code points that do not decompose. */
  readonly kept?: ReadonlySet<number>;
}

/**
 * This function normalizes code points as HarfBuzz does. It decomposes the characters by `rules`. A text with a mark after
 * its first character then gets more steps. The function sorts the marks, and composes each mark with its starter again
 * when the font has the glyph of the composite. A mark between them with the same class or a larger class blocks this.
 */
export function normalizeCodePoints(codePoints: readonly number[], rules: NormalizeRules): number[] {
  const { hasGlyph, shortCircuit, kept = new Set<number>() } = rules;
  const marked = codePoints.map(isMark);
  const parts = codePoints.flatMap((codePoint, i) => {
    const simple = marked[i + 1] !== true && !(i > 0 && marked[i]!);
    return shortCircuit && simple && hasGlyph(codePoint) ? [codePoint] : decomposition(codePoint, hasGlyph, kept);
  });
  if (!marked.slice(1).includes(true)) return parts;
  // A stable sort of each run of marks with a class that is not 0
  for (let i = 1; i < parts.length; i++) {
    for (let j = i; j > 0 && isMark(parts[j - 1]!) && isMark(parts[j]!) && reorders(parts[j - 1]!, parts[j]!); j--) {
      [parts[j - 1], parts[j]] = [parts[j]!, parts[j - 1]!];
    }
  }
  const out: number[] = parts.slice(0, 1);
  let starter = 0;
  for (let i = 1; i < parts.length; i++) {
    const codePoint = parts[i]!;
    if (isMark(codePoint) && (starter === out.length - 1 || reorders(codePoint, out[out.length - 1]!))) {
      const composed = compose(out[starter]!, codePoint);
      if (composed !== undefined && hasGlyph(composed)) {
        out[starter] = composed;
        continue;
      }
    }
    out.push(codePoint);
    if (isStarter(codePoint)) starter = out.length - 1;
  }
  return out;
}

/** The code points that `normalizeCodePoints` can give for a set of characters. */
export interface NormalForms {
  /** The parts of each character of the set after the decomposition. A character with no decomposition is its one part. */
  readonly parts: ReadonlyMap<number, readonly number[]>;
  /** The composites of each code point: the code points that it becomes when a mark composes with it. */
  readonly composites: ReadonlyMap<number, readonly number[]>;
  /** All the code points that the shaper can see: the set, its parts and each composite. */
  readonly codePoints: ReadonlySet<number>;
}

/** This function gives the forms of a set of characters. It repeats the compositions until the set of code points is stable. */
export function normalForms(characters: ReadonlySet<number>, hasGlyph: (codePoint: number) => boolean, kept: ReadonlySet<number> = new Set()): NormalForms {
  const parts = new Map([...characters].map((codePoint) => [codePoint, decomposition(codePoint, hasGlyph, kept)]));
  const codePoints = new Set([...characters, ...[...parts.values()].flat()]);
  const composites = new Map<number, number[]>();
  for (let size = 0; size !== codePoints.size; ) {
    size = codePoints.size;
    const marks = [...codePoints].filter(isMark);
    for (const starter of codePoints) {
      for (const mark of marks) {
        const composed = compose(starter, mark);
        if (composed === undefined || !hasGlyph(composed)) continue;
        const known = composites.get(starter) ?? [];
        if (!known.includes(composed)) composites.set(starter, [...known, composed]);
        codePoints.add(composed);
      }
    }
  }
  return { parts, composites, codePoints };
}
