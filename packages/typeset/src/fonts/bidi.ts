/**
 * The Unicode Bidirectional Algorithm (UAX #9) for the text of a canvas, as one paragraph with the base level 0. Blink adds
 * the widths of the words of a canvas in the visual order, so the single-precision sum needs this order. The rules are the
 * shared rules of `../bidi/resolve.ts`. This module gets the bidi class of a character from its script and its general
 * category, so that this entry has no class table. `@mark1russell7/typeset/bidi` has the exact classes.
 */
import { bracketOf } from "../bidi/brackets.ts";
import { icuDirection, removed, resolveLevels, type BidiClass } from "../bidi/resolve.ts";

const nonSpacingMark = /[\p{Mn}\p{Me}]/u;
const currency = /\p{Sc}/u;
const format = /\p{Cf}/u;
const hebrew = /\p{Script_Extensions=Hebrew}/u;
const arabicLetter = /[\p{Script_Extensions=Arabic}\p{Script_Extensions=Syriac}\p{Script_Extensions=Thaana}]/u;
const letter = /[\p{L}\p{Mc}]/u;
const commonSeparators: ReadonlySet<number> = new Set([0x2c, 0x2e, 0x2f, 0x3a, 0xa0, 0x60c, 0x202f, 0x2044]);
const embeddings: readonly BidiClass[] = ["LRE", "RLE", "PDF", "LRO", "RLO"];
const isolates: readonly BidiClass[] = ["LRI", "RLI", "FSI", "PDI"];

/** This function gives the bidi class of a character, from its code point, its script and its general category. */
function bidiClass(character: string): BidiClass {
  const c = character.codePointAt(0)!;
  if (nonSpacingMark.test(character)) return "NSM";
  if ((c >= 0x30 && c <= 0x39) || (c >= 0x6f0 && c <= 0x6f9) || c === 0xb2 || c === 0xb3 || c === 0xb9 || (c >= 0xff10 && c <= 0xff19)) return "EN";
  if ((c >= 0x660 && c <= 0x669) || c === 0x66b || c === 0x66c) return "AN";
  if (c === 0x2b || c === 0x2d || c === 0x2212) return "ES";
  if (c === 0x23 || c === 0x25 || c === 0xb0 || c === 0x2030 || currency.test(character)) return "ET";
  if (commonSeparators.has(c)) return "CS";
  if (c === 0x9 || c === 0xb || c === 0x1f) return "S";
  if (c === 0xa || c === 0xd || (c >= 0x1c && c <= 0x1e) || c === 0x85 || c === 0x2029) return "B";
  if (c === 0x20 || c === 0xc || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x3000) return "WS";
  if (c >= 0x202a && c <= 0x202e) return embeddings[c - 0x202a]!;
  if (c >= 0x2066 && c <= 0x2069) return isolates[c - 0x2066]!;
  if (c === 0x200e) return "L";
  if (c === 0x200f) return "R";
  if (c === 0x61c) return "AL";
  if (format.test(character)) return "BN";
  if (hebrew.test(character)) return "R";
  if (arabicLetter.test(character)) return "AL";
  return letter.test(character) ? "L" : "ON";
}

/**
 * This function gives the bidi level of each code point of a text, in a paragraph with the base level 0. A character that
 * the rule X9 removes takes the level of the character before it. Before white space or a separator, it takes the base level.
 */
export function bidiLevels(text: string): number[] {
  const characters = [...text];
  const classes = characters.map(bidiClass);
  const { levels } = resolveLevels(classes, characters.map((character) => bracketOf(character.codePointAt(0)!)), 0);
  const n = levels.length;
  let atEnd = true;
  for (let i = n - 1; i >= 0; i--) {
    if (levels[i] !== removed) atEnd = classes[i] === "WS" || classes[i] === "S" || classes[i] === "B";
    else if (atEnd) levels[i] = 0;
  }
  let level = 0;
  for (let i = 0; i < n; i++) {
    if (levels[i] === removed) levels[i] = level;
    else level = levels[i]!;
  }
  return levels;
}

/**
 * This function tells if ICU gives the direction `mixed` to a text in a paragraph with the base level 0. Blink divides
 * the text of a canvas into bidi runs only then. ICU reads the classes R, AL and AN and the controls RLE, RLO and RLI.
 */
export function isMixed(text: string): boolean {
  return icuDirection([...text].map(bidiClass), 0) === "mixed";
}

export { visualOrder } from "../bidi/resolve.ts";
