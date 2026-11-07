/**
 * The Indic shaper of HarfBuzz for the script Devanagari. This module follows `hb-ot-shaper-indic.cc`, the syllable machine
 * of `hb-ot-shaper-indic-machine.rl`, the dotted circles of `hb-ot-shaper-syllabic.cc` and `hb-ot-shaper-vowel-constraints.cc`,
 * and the rules of the mode `COMPOSED_DIACRITICS_NO_SHORT_CIRCUIT`. The table of the categories comes from `hb-ot-shaper-indic-table.cc`.
 */
import type { Font } from "./font.ts";
import { alt, any, compile, longestMatch, opt, seq, set, star, type Machine, type Pattern } from "./machine.ts";
import { normalForms, normalizeCodePoints, type NormalForms } from "./normalize.ts";
import { LIGATED, MULTIPLIED, SUBSTITUTED, type GlyphInfo } from "./substitution.ts";
import { isHidden } from "./normalize.ts";

/** The OpenType script tags that use the Indic shaper in this model. */
export const indicScripts: readonly string[] = ["deva"];

// The categories of the Indic table of HarfBuzz
const X = 0;
const C = 1;
const V = 2;
const N = 3;
const H = 4;
const ZWNJ = 5;
const ZWJ = 6;
const M = 7;
const SM = 8;
const A = 9;
const PLACEHOLDER = 10;
const DOTTEDCIRCLE = 11;
const RS = 12;
const MPST = 13;
const REPHA = 14;
const RA = 15;
const CM = 16;
const SYMBOL = 17;
const CS = 18;
const SMPST = 57;

// The positions of the Indic table of HarfBuzz, in the order of the glyphs of a syllable
const START = 0;
const RA_TO_BECOME_REPH = 1;
const PRE_M = 2;
const PRE_C = 3;
const BASE_C = 4;
const BELOW_C = 8;
const AFTER_SUB = 9;
const POST_C = 11;
const SMVD = 13;
const END = 14;

// The syllable types of the machine
const CONSONANT_SYLLABLE = 0;
const VOWEL_SYLLABLE = 1;
const STANDALONE_CLUSTER = 2;
const SYMBOL_CLUSTER = 3;
const BROKEN_CLUSTER = 4;
const NON_INDIC_CLUSTER = 5;

/**
 * The categories and positions of the Indic table of HarfBuzz for the characters that Devanagari text uses. Each group of
 * four has the first code point, the last code point, the category and the position. Another code point has the category
 * `X` and the position `END`.
 */
const indicTable: readonly number[] = [
  0x2d, 0x2d, PLACEHOLDER, BASE_C, 0x30, 0x39, PLACEHOLDER, BASE_C, 0xa0, 0xa0, PLACEHOLDER, BASE_C, 0xb2, 0xb3, SMPST, SMVD,
  0xd7, 0xd7, PLACEHOLDER, BASE_C, 0x900, 0x903, SM, SMVD, 0x904, 0x914, V, BASE_C, 0x915, 0x92f, C, BASE_C,
  0x930, 0x930, RA, BASE_C, 0x931, 0x939, C, BASE_C, 0x93a, 0x93b, M, AFTER_SUB, 0x93c, 0x93c, N, END,
  0x93d, 0x93d, SYMBOL, SMVD, 0x93e, 0x93e, M, AFTER_SUB, 0x93f, 0x93f, M, PRE_M, 0x940, 0x94c, M, AFTER_SUB,
  0x94d, 0x94d, H, BELOW_C, 0x94e, 0x94e, M, PRE_M, 0x94f, 0x94f, M, AFTER_SUB, 0x951, 0x952, A, SMVD,
  0x953, 0x954, SM, SMVD, 0x955, 0x957, M, AFTER_SUB, 0x958, 0x95f, C, BASE_C, 0x960, 0x961, V, BASE_C,
  0x962, 0x963, M, AFTER_SUB, 0x966, 0x96f, PLACEHOLDER, BASE_C, 0x972, 0x977, V, BASE_C, 0x978, 0x97f, C, BASE_C,
  0x1cd0, 0x1cd2, A, SMVD, 0x1cd4, 0x1ce8, A, SMVD, 0x1ce9, 0x1cec, SYMBOL, SMVD, 0x1ced, 0x1ced, A, SMVD,
  0x1cee, 0x1cf1, SYMBOL, SMVD, 0x1cf2, 0x1cf3, C, BASE_C, 0x1cf4, 0x1cf4, A, SMVD, 0x1cf5, 0x1cf6, CS, BASE_C,
  0x1cf7, 0x1cf9, A, SMVD, 0x1cfa, 0x1cfa, PLACEHOLDER, BASE_C, 0x200c, 0x200c, ZWNJ, END, 0x200d, 0x200d, ZWJ, END,
  0x2010, 0x2015, PLACEHOLDER, BASE_C, 0x2022, 0x2022, PLACEHOLDER, BASE_C, 0x2074, 0x2074, SMPST, SMVD,
  0x2082, 0x2084, SMPST, SMVD, 0x25cc, 0x25cc, DOTTEDCIRCLE, BASE_C, 0xa8e0, 0xa8f1, A, SMVD, 0xa8f2, 0xa8f7, SYMBOL, SMVD,
  0xa8fe, 0xa8fe, V, BASE_C, 0xa8ff, 0xa8ff, M, AFTER_SUB,
];

/** This function gives the category and the position of a code point. */
function indicProperties(codePoint: number): [number, number] {
  let low = 0;
  let high = indicTable.length / 4 - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (codePoint < indicTable[middle * 4]!) high = middle - 1;
    else if (codePoint > indicTable[middle * 4 + 1]!) low = middle + 1;
    else return [indicTable[middle * 4 + 2]!, indicTable[middle * 4 + 3]!];
  }
  return [X, END];
}

/** The general categories from `FORMAT` to `NON_SPACING_MARK` of HarfBuzz: a letter, a mark, or a format or other code point. */
const letterOrMark = /[\p{L}\p{M}\p{Cf}\p{Cn}\p{Co}\p{Cs}]/u;

/**
 * This function inserts a dotted circle in each vowel sequence of Devanagari that looks like another vowel, as
 * `_hb_preprocess_text_vowel_constraints` does.
 */
function vowelConstraints(codePoints: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i + 1 < codePoints.length) {
    const first = codePoints[i]!;
    const second = codePoints[i + 1]!;
    let matched = false;
    if (first === 0x905) matched = [0x93a, 0x93b, 0x93e, 0x945, 0x946, 0x949, 0x94a, 0x94b, 0x94c, 0x94f, 0x956, 0x957].includes(second);
    else if (first === 0x906) matched = [0x93a, 0x945, 0x946, 0x947, 0x948].includes(second);
    else if (first === 0x909) matched = second === 0x941;
    else if (first === 0x90f) matched = [0x945, 0x946, 0x947].includes(second);
    else if (first === 0x930 && second === 0x94d && codePoints[i + 2] === 0x907) {
      out.push(codePoints[i++]!);
      matched = true;
    }
    out.push(codePoints[i++]!);
    if (matched) out.push(0x25cc, codePoints[i++]!);
  }
  while (i < codePoints.length) out.push(codePoints[i++]!);
  return out;
}

/** The code points of Devanagari that do not decompose. */
const kept: ReadonlySet<number> = new Set([0x931]);

/** This function gives the code points that `normalizeCodePoints` and `vowelConstraints` can give for a set of characters. */
export function indicForms(characters: ReadonlySet<number>, hasGlyph: (codePoint: number) => boolean): NormalForms {
  return normalForms(new Set([...characters, 0x25cc]), hasGlyph, kept);
}

// The syllable machine, with one letter for each category
const letters = new Map<number, string>([
  [X, "x"], [C, "c"], [V, "v"], [N, "n"], [H, "h"], [ZWNJ, "w"], [ZWJ, "j"], [M, "m"], [SM, "s"], [A, "a"], [PLACEHOLDER, "p"],
  [DOTTEDCIRCLE, "d"], [RS, "r"], [MPST, "q"], [REPHA, "f"], [RA, "R"], [CM, "k"], [SYMBOL, "y"], [CS, "S"], [SMPST, "t"],
]);
const c = set("cR");
const n = seq(opt(seq(opt("w"), "r")), opt(seq("n", opt("n"))));
const z = set("wj");
const reph = alt("Rh", "f");
const sm = set("st");
const cn = seq(c, opt("j"), n);
const matraGroup = seq(star(z), alt("m", seq(opt(sm), "q")), opt("n"), opt("h"));
const syllableTail = seq(opt(seq(opt(z), sm, opt(sm), opt("w"))), star("a"));
const halantGroup = seq(opt(z), "h", opt(seq("j", opt("n"))));
const finalHalantGroup = alt(halantGroup, "hw");
const complexSyllableTail = seq(star(seq(halantGroup, cn)), opt("k"), alt(finalHalantGroup, star(matraGroup)), syllableTail);
/** The rules of the machine in the order of HarfBuzz, with the type of each. A tie of two lengths goes to the first rule. */
const indicRules: readonly (readonly [Pattern, number])[] = [
  [seq(opt(set("fS")), cn, complexSyllableTail), CONSONANT_SYLLABLE],
  [seq(opt(reph), "v", n, alt("j", complexSyllableTail)), VOWEL_SYLLABLE],
  [seq(alt(seq(opt(set("fS")), "p"), seq(opt(reph), "d")), n, complexSyllableTail), STANDALONE_CLUSTER],
  [seq("y", opt("n"), syllableTail), SYMBOL_CLUSTER],
  ["t", NON_INDIC_CLUSTER],
  [seq(opt(reph), n, complexSyllableTail), BROKEN_CLUSTER],
  [any, NON_INDIC_CLUSTER],
];
const machines: readonly Machine[] = indicRules.map(([rule]) => compile(rule));

/**
 * This function divides a text of category letters into syllables, as the machine of HarfBuzz does. At each position,
 * it takes the longest match of the rules, in one pass. It gives the length and the type of each syllable.
 */
export function letterSyllables(text: string): (readonly [length: number, type: number])[] {
  const out: (readonly [number, number])[] = [];
  let at = 0;
  while (at < text.length) {
    // No rule but the last one matches the category X, so a syllable stops before it
    const next = text.indexOf("x", at + 1);
    const match = longestMatch(machines, text, at, next < 0 ? text.length : next);
    const length = match?.length ?? 1;
    out.push([length, match === undefined ? NON_INDIC_CLUSTER : indicRules[match.rule]![1]]);
    at += length;
  }
  return out;
}

/** This function gives the category letter of each code point of a text. The tests use it. */
export function indicLetters(text: string): string {
  return Array.from(text, (character) => letters.get(indicProperties(character.codePointAt(0)!)[0]) ?? "x").join("");
}

/**
 * This function divides the glyphs into syllables. Each glyph gets the syllable byte. Its high 4 bits are a serial
 * number from 1 to 15, and its low 4 bits are the type. The function tells if a syllable is a broken cluster.
 */
function findSyllables(infos: GlyphInfo[]): boolean {
  const text = infos.map((info) => letters.get(info.category) ?? "x").join("");
  let serial = 1;
  let broken = false;
  let at = 0;
  for (const [length, type] of letterSyllables(text)) {
    if (type === BROKEN_CLUSTER) broken = true;
    for (let i = at; i < at + length; i++) infos[i]!.syllable = (serial << 4) | type;
    serial = serial === 15 ? 1 : serial + 1;
    at += length;
  }
  return broken;
}

/** The types of the syllables of the Indic machine of HarfBuzz. */
export type IndicSyllableType = "consonant" | "vowel" | "standalone" | "symbol" | "broken" | "non-indic";
const syllableTypes: readonly IndicSyllableType[] = ["consonant", "vowel", "standalone", "symbol", "broken", "non-indic"];

/**
 * This function divides a text into the syllables of the Indic machine of HarfBuzz. It does not normalize the text and
 * does not insert dotted circles.
 */
export function indicSyllables(text: string): { readonly text: string; readonly type: IndicSyllableType }[] {
  const characters = [...text];
  const infos = characters.map((character): GlyphInfo => {
    const codePoint = character.codePointAt(0)!;
    const [category, position] = indicProperties(codePoint);
    return { mask: GLOBAL, syllable: 0, props: 0, category, position, codePoint };
  });
  findSyllables(infos);
  return syllables(infos).map(([start, end]) => ({ text: characters.slice(start, end).join(""), type: syllableTypes[infos[start]!.syllable & 0x0f]! }));
}

/** It is true when the glyph made no ligature and its category is one of `categories`. A ligature has no category. */
function isOneOf(info: GlyphInfo, categories: readonly number[]): boolean {
  return (info.props & LIGATED) === 0 && categories.includes(info.category);
}

const consonants = [C, CS, RA, CM, V, PLACEHOLDER, DOTTEDCIRCLE];
const joiners = [ZWJ, ZWNJ];
const isConsonant = (info: GlyphInfo): boolean => isOneOf(info, consonants);
const isJoiner = (info: GlyphInfo): boolean => isOneOf(info, joiners);
const isHalant = (info: GlyphInfo): boolean => isOneOf(info, [H]);
const ligatedAndDidntMultiply = (info: GlyphInfo): boolean => (info.props & (LIGATED | MULTIPLIED)) === LIGATED;

/** The basic features, in the order of their stages before the final reordering. The value is true for a global feature. */
const basicFeatures: readonly (readonly [string, boolean])[] = [
  ["nukt", true], ["akhn", true], ["rphf", false], ["rkrf", true], ["pref", false], ["blwf", false],
  ["abvf", false], ["half", false], ["pstf", false], ["vatu", true], ["cjct", true],
];
/** The features of the last stage, after the final reordering. They match only in a syllable. */
const finalFeatures: readonly string[] = ["init", "pres", "abvs", "blws", "psts", "haln"];
/** This function gives the features of the page that the last stage applies. */
function pageFeatures(features: readonly string[]): string[] {
  return features.filter((tag) => !["ccmp", "locl", "liga"].includes(tag) && !finalFeatures.includes(tag));
}

/** This function gives all the features that `indicShaper` applies for the features `features` of the page. */
export function indicFeatures(features: readonly string[]): string[] {
  return ["locl", "ccmp", ...basicFeatures.map(([tag]) => tag), ...finalFeatures, ...pageFeatures(features)];
}

/** The mask bit of the global features. Each glyph has it. */
const GLOBAL = 1;
/** The mask bits of the features that apply only to some glyphs of a syllable. */
const featureBits = new Map<string, number>([["rphf", 2], ["pref", 4], ["blwf", 8], ["abvf", 16], ["half", 32], ["pstf", 64], ["init", 128]]);

/** The glyphs of a text and the data of each glyph. The two arrays change together. */
interface Run {
  readonly glyphs: number[];
  readonly infos: GlyphInfo[];
}

/** This function moves the glyph at `from` to `to`. The glyphs between them move by one position. */
function move(run: Run, from: number, to: number): void {
  const [glyph] = run.glyphs.splice(from, 1);
  const [info] = run.infos.splice(from, 1);
  run.glyphs.splice(to, 0, glyph!);
  run.infos.splice(to, 0, info!);
}

function reverse(run: Run, start: number, end: number): void {
  run.glyphs.splice(start, end - start, ...run.glyphs.slice(start, end).reverse());
  run.infos.splice(start, end - start, ...run.infos.slice(start, end).reverse());
}

/** This function gives the ranges of the syllables, as `foreach_syllable` of HarfBuzz. */
function syllables(infos: readonly GlyphInfo[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= infos.length; i++) {
    if (i === infos.length || infos[i]!.syllable !== infos[start]!.syllable) {
      ranges.push([start, i]);
      start = i;
    }
  }
  return infos.length === 0 ? [] : ranges;
}

/**
 * This function makes the function that gives the glyphs of a word with the Indic shaper. The features `features` are the
 * features of the page. The shaper applies `locl` and `ccmp` before it reorders the syllables, and the other features of
 * the page after its own features. It does not apply `liga`.
 */
export function indicShaper(font: Font, script: string, features: readonly string[]): (word: string) => number[] {
  const lookupsOf = (tags: readonly string[]) => font.substitutions(script, tags);
  const maskOf = (tag: string): number => (lookupsOf([tag]).length === 0 ? 0 : featureBits.get(tag) ?? GLOBAL);
  const [rphfMask, prefMask, blwfMask, abvfMask, halfMask, pstfMask, initMask] = ["rphf", "pref", "blwf", "abvf", "half", "pstf", "init"].map(maskOf) as [number, number, number, number, number, number, number];
  const would = (tag: string, glyphs: readonly number[]): boolean => lookupsOf([tag]).some((lookup) => lookup.wouldApply(glyphs));
  const virama = font.glyph(0x94d);
  const dottedCircle = font.glyph(0x25cc);
  const positions = new Map<number, number>();
  /** This function gives the position of a consonant from the below-base, post-base and pre-base forms of the font. */
  const consonantPosition = (consonant: number): number => {
    let position = positions.get(consonant);
    if (position === undefined) {
      const before = [virama, consonant];
      const after = [consonant, virama];
      const either = (tag: string) => would(tag, before) || would(tag, after);
      position = either("blwf") || either("vatu") ? BELOW_C : either("pstf") || either("pref") ? POST_C : BASE_C;
      positions.set(consonant, position);
    }
    return position;
  };
  const first = lookupsOf(["locl", "ccmp"]);
  const basic = basicFeatures.map(([tag, global]) => ({ lookups: lookupsOf([tag]), mask: global ? GLOBAL : featureBits.get(tag)! }));
  const last = lookupsOf([...finalFeatures, ...pageFeatures(features)]).map((lookup) => ({
    lookup,
    mask: lookup.features.reduce((mask, tag) => mask | (tag === "init" ? initMask : GLOBAL), 0),
    perSyllable: lookup.features.some((tag) => finalFeatures.includes(tag)),
  }));

  /** This function reorders one syllable before the basic features, and gives the masks of its glyphs. */
  const initialReordering = (run: Run, start: number, end: number): void => {
    const { glyphs, infos } = run;
    let base = end;
    let hasReph = false;
    let limit = start;
    if (rphfMask !== 0 && start + 3 <= end && !isJoiner(infos[start + 2]!) && would("rphf", [glyphs[start]!, glyphs[start + 1]!])) {
      limit += 2;
      while (limit < end && isJoiner(infos[limit]!)) limit++;
      base = start;
      hasReph = true;
    }
    // The base is the last consonant that has no below-base or post-base form
    let seenBelow = false;
    for (let i = end - 1; i >= limit; i--) {
      const info = infos[i]!;
      if (isConsonant(info)) {
        base = i;
        if (info.position !== BELOW_C && (info.position !== POST_C || seenBelow)) break;
        if (info.position === BELOW_C) seenBelow = true;
      } else if (start < i && info.category === ZWJ && infos[i - 1]!.category === H) break;
    }
    if (hasReph && base === start && limit - base <= 2) hasReph = false;
    for (let i = start; i < base; i++) infos[i]!.position = Math.min(PRE_C, infos[i]!.position);
    if (base < end) infos[base]!.position = BASE_C;
    if (hasReph) infos[start]!.position = RA_TO_BECOME_REPH;
    // A joiner, a nukta or a halant goes with the glyph before it
    let lastPosition = START;
    for (let i = start; i < end; i++) {
      const info = infos[i]!;
      if ([ZWJ, ZWNJ, N, RS, CM, H].includes(info.category)) {
        info.position = lastPosition;
        if (info.category === H && info.position === PRE_M) {
          for (let j = i; j > start; j--) {
            if (infos[j - 1]!.position !== PRE_M) {
              info.position = infos[j - 1]!.position;
              break;
            }
          }
        }
      } else if (info.position !== SMVD) {
        if (info.category === MPST && i > start && infos[i - 1]!.category === SM) infos[i - 1]!.position = info.position;
        lastPosition = info.position;
      }
    }
    // A post-base consonant takes the glyphs before it
    let previous = base;
    for (let i = base + 1; i < end; i++) {
      if (isConsonant(infos[i]!)) {
        for (let j = previous + 1; j < i; j++) if (infos[j]!.position < SMVD) infos[j]!.position = infos[i]!.position;
        previous = i;
      } else if (infos[i]!.category === M || infos[i]!.category === MPST) previous = i;
    }
    const order = glyphs.slice(start, end).map((glyph, k) => ({ glyph, info: infos[start + k]! })).sort((a, b) => a.info.position - b.info.position);
    order.forEach(({ glyph, info }, k) => {
      glyphs[start + k] = glyph;
      infos[start + k] = info;
    });
    base = end;
    let firstLeftMatra = end;
    let lastLeftMatra = end;
    for (let i = start; i < end; i++) {
      if (infos[i]!.position === BASE_C) {
        base = i;
        break;
      }
      if (infos[i]!.position === PRE_M) {
        if (firstLeftMatra === end) firstLeftMatra = i;
        lastLeftMatra = i;
      }
    }
    if (firstLeftMatra < lastLeftMatra) {
      reverse(run, firstLeftMatra, lastLeftMatra + 1);
      let i = firstLeftMatra;
      for (let j = i; j <= lastLeftMatra; j++) {
        if (infos[j]!.category === M || infos[j]!.category === MPST) {
          reverse(run, i, j + 1);
          i = j + 1;
        }
      }
    }
    for (let i = start; i < end && infos[i]!.position === RA_TO_BECOME_REPH; i++) infos[i]!.mask |= rphfMask;
    for (let i = start; i < base; i++) infos[i]!.mask |= halfMask | blwfMask;
    for (let i = base + 1; i < end; i++) infos[i]!.mask |= blwfMask | abvfMask | pstfMask;
    if (prefMask !== 0 && base + 2 < end) {
      for (let i = base + 1; i + 1 < end; i++) {
        if (would("pref", [glyphs[i]!, glyphs[i + 1]!])) {
          infos[i]!.mask |= prefMask;
          infos[i + 1]!.mask |= prefMask;
          break;
        }
      }
    }
    // A ZWNJ stops the half forms of the glyphs before it
    for (let i = start + 1; i < end; i++) {
      if (!isJoiner(infos[i]!) || infos[i]!.category !== ZWNJ) continue;
      let j = i;
      do {
        j--;
        infos[j]!.mask &= ~halfMask;
      } while (j > start && !isConsonant(infos[j]!));
    }
  };

  /** This function moves the pre-base matra and the reph of one syllable after the basic features. */
  const finalReordering = (run: Run, start: number, end: number): void => {
    const { glyphs, infos } = run;
    for (let i = start; i < end; i++) {
      // A virama that came out of a ligature is a halant again
      if (virama !== 0 && glyphs[i] === virama && (infos[i]!.props & (LIGATED | MULTIPLIED)) === (LIGATED | MULTIPLIED)) {
        infos[i]!.category = H;
        infos[i]!.props &= ~(LIGATED | MULTIPLIED);
      }
    }
    let tryPref = prefMask !== 0;
    let base = start;
    for (; base < end; base++) {
      if (infos[base]!.position < BASE_C) continue;
      if (tryPref && base + 1 < end) {
        for (let i = base + 1; i < end; i++) {
          if ((infos[i]!.mask & prefMask) === 0) continue;
          if (!((infos[i]!.props & SUBSTITUTED) !== 0 && ligatedAndDidntMultiply(infos[i]!))) {
            base = i;
            while (base < end && isHalant(infos[base]!)) base++;
            if (base < end) infos[base]!.position = BASE_C;
            tryPref = false;
          }
          break;
        }
        if (base === end) break;
      }
      if (start < base && infos[base]!.position > BASE_C) base--;
      break;
    }
    if (base === end && start < base && isOneOf(infos[base - 1]!, [ZWJ])) base--;
    if (base < end) while (start < base && isOneOf(infos[base]!, [N, H])) base--;

    // A pre-base matra goes after the last halant before the base
    if (start + 1 < end && start < base) {
      let newPosition = base === end ? base - 2 : base - 1;
      for (;;) {
        while (newPosition > start && !isOneOf(infos[newPosition]!, [M, MPST, H])) newPosition--;
        if (isHalant(infos[newPosition]!) && infos[newPosition]!.position !== PRE_M) {
          if (newPosition + 1 < end && infos[newPosition + 1]!.category === ZWJ && newPosition > start) {
            newPosition--;
            continue;
          }
        } else newPosition = start;
        break;
      }
      if (start < newPosition && infos[newPosition]!.position !== PRE_M) {
        for (let i = newPosition; i > start; i--) {
          if (infos[i - 1]!.position !== PRE_M) continue;
          const oldPosition = i - 1;
          if (oldPosition < base && base <= newPosition) base--;
          move(run, oldPosition, newPosition);
          newPosition--;
        }
      }
    }

    // The reph goes after the first halant before the base, or else at the end of the syllable before the signs
    if (start + 1 < end && infos[start]!.position === RA_TO_BECOME_REPH && (infos[start]!.category === REPHA) !== ligatedAndDidntMultiply(infos[start]!)) {
      let newPosition = start + 1;
      while (newPosition < base && !isHalant(infos[newPosition]!)) newPosition++;
      if (newPosition < base && isHalant(infos[newPosition]!)) {
        if (newPosition + 1 < base && isJoiner(infos[newPosition + 1]!)) newPosition++;
      } else {
        newPosition = end - 1;
        while (newPosition > start && infos[newPosition]!.position === SMVD) newPosition--;
        if (isHalant(infos[newPosition]!)) {
          for (let i = base + 1; i < newPosition; i++) if (infos[i]!.category === M || infos[i]!.category === MPST) newPosition--;
        }
      }
      move(run, start, newPosition);
      if (start < base && base <= newPosition) base--;
    }

    // A pre-base form of a consonant goes before the base
    if (tryPref && base + 1 < end) {
      for (let i = base + 1; i < end; i++) {
        if ((infos[i]!.mask & prefMask) === 0) continue;
        if (ligatedAndDidntMultiply(infos[i]!)) {
          let newPosition = base;
          while (newPosition > start && !isOneOf(infos[newPosition - 1]!, [M, MPST, H])) newPosition--;
          if (newPosition > start && isHalant(infos[newPosition - 1]!) && newPosition < end && isJoiner(infos[newPosition]!)) newPosition++;
          move(run, i, newPosition);
          if (newPosition <= base && base < i) base++;
        }
        break;
      }
    }
    if (infos[start]!.position === PRE_M && (start === 0 || !letterOrMark.test(String.fromCodePoint(infos[start - 1]!.codePoint)))) infos[start]!.mask |= initMask;
  };

  return (word: string): number[] => {
    const codePoints = normalizeCodePoints(vowelConstraints([...word].map((character) => character.codePointAt(0)!)), { hasGlyph: (codePoint) => font.glyph(codePoint) !== 0, shortCircuit: false, kept });
    const run: Run = { glyphs: codePoints.map((codePoint) => font.glyph(codePoint)), infos: [] };
    for (const codePoint of codePoints) {
      const [category, position] = indicProperties(codePoint);
      run.infos.push({ mask: GLOBAL, syllable: 0, props: 0, category, position, codePoint });
    }
    const broken = findSyllables(run.infos);
    for (const lookup of first) lookup.applyInfos(run.glyphs, run.infos, GLOBAL, true);
    if (virama !== 0) for (let i = 0; i < run.infos.length; i++) if (run.infos[i]!.position === BASE_C) run.infos[i]!.position = consonantPosition(run.glyphs[i]!);
    if (broken && dottedCircle !== 0) {
      // A broken cluster starts with a dotted circle
      for (let i = run.infos.length - 1; i >= 0; i--) {
        const info = run.infos[i]!;
        if ((info.syllable & 0x0f) !== BROKEN_CLUSTER || (i > 0 && run.infos[i - 1]!.syllable === info.syllable)) continue;
        run.glyphs.splice(i, 0, dottedCircle);
        run.infos.splice(i, 0, { mask: info.mask, syllable: info.syllable, props: 0, category: DOTTEDCIRCLE, position: END, codePoint: 0x25cc });
      }
    }
    for (const [start, end] of syllables(run.infos)) {
      const type = run.infos[start]!.syllable & 0x0f;
      if (type !== SYMBOL_CLUSTER && type !== NON_INDIC_CLUSTER) initialReordering(run, start, end);
    }
    for (const { lookups, mask } of basic) for (const lookup of lookups) lookup.applyInfos(run.glyphs, run.infos, mask, true);
    for (const [start, end] of syllables(run.infos)) finalReordering(run, start, end);
    for (const { lookup, mask, perSyllable } of last) lookup.applyInfos(run.glyphs, run.infos, mask, perSyllable);
    return run.glyphs.map((glyph, i) => ((run.infos[i]!.props & SUBSTITUTED) === 0 && isHidden(run.infos[i]!.codePoint) ? ~glyph : glyph));
  };
}
