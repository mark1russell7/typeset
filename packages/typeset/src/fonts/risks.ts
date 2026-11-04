/**
 * The risks of shaping: the text that the model cannot measure with trust. The check is synchronous, and it uses only the
 * tables of the font. A host can give such text to a real shaper.
 */
import { glyphAdvances, shapingOf, type Font, type MeasureOptions } from "./font.ts";
import { hasDefaultIgnorable, normalizeCodePoints } from "./normalize.ts";
import { canvasWords } from "./words.ts";

/** The kinds of risk. */
export type ShapingRiskCode = "missing-glyph" | "unshaped-script" | "emoji-zwj" | "variation-selector" | "keycap" | "flag" | "tag" | "positioning";

/** One part of a text that the model does not shape as HarfBuzz does. */
export interface ShapingRisk {
  readonly code: ShapingRiskCode;
  /** The offset of the part in the text, in UTF-16 units. */
  readonly index: number;
  /** The length of the part, in UTF-16 units. */
  readonly length: number;
}

const unshapedScripts = /[\p{sc=Bengali}\p{sc=Gurmukhi}\p{sc=Gujarati}\p{sc=Oriya}\p{sc=Tamil}\p{sc=Telugu}\p{sc=Kannada}\p{sc=Malayalam}\p{sc=Sinhala}\p{sc=Khmer}\p{sc=Myanmar}\p{sc=Tibetan}\p{sc=Mongolian}\p{sc=Nko}\p{sc=Mandaic}]+/gu;
const pictograph = String.raw`\p{ExtPict}(?:️|[\u{1F3FB}-\u{1F3FF}])?`;
/** The emoji sequences, with the longest forms first. Thus the selector of a keycap gives one risk. */
const sequences = new RegExp(
  String.raw`(?<tag>\p{ExtPict}[\u{E0020}-\u{E007E}]+\u{E007F})|(?<zwj>${pictograph}(?:‍${pictograph})+)|(?<keycap>[0-9#*]️?⃣)|(?<flag>\p{RI}\p{RI})|(?<selector>[︀-️\u{E0100}-\u{E01EF}])`,
  "gu",
);
const sequenceCodes: Readonly<Record<string, ShapingRiskCode>> = { tag: "tag", zwj: "emoji-zwj", keycap: "keycap", flag: "flag", selector: "variation-selector" };
const clusters = /\P{M}\p{M}*|\p{M}+/gu;
const control = /\p{Cc}/u;

/** This function gives the risks of a cluster with no glyph after normalization. Controls and default ignorables have no risk. */
function missingGlyphs(font: Font, text: string): ShapingRisk[] {
  const hasGlyph = (codePoint: number): boolean => font.glyph(codePoint) !== 0;
  const silent = (character: string): boolean => control.test(character) || hasDefaultIgnorable(character);
  const risks: ShapingRisk[] = [];
  for (const { 0: cluster, index } of text.matchAll(clusters)) {
    const parts = normalizeCodePoints(Array.from(cluster, (character) => character.codePointAt(0)!), { hasGlyph, shortCircuit: true });
    if (parts.some((codePoint) => !hasGlyph(codePoint) && !silent(String.fromCodePoint(codePoint)))) risks.push({ code: "missing-glyph", index, length: cluster.length });
  }
  return risks;
}

/** This function gives the risk of each word with a position that the model does not apply. */
function positioning(font: Font, text: string, options: MeasureOptions): ShapingRisk[] {
  if (options.kerning === false) return [];
  const tests = font.contextKerning(shapingOf(font, options).script);
  if (tests.length === 0) return [];
  const risks: ShapingRisk[] = [];
  let index = 0;
  for (const word of options.shaping === "canvas" ? canvasWords(text) : [text]) {
    const { glyphs } = glyphAdvances(font, word, options);
    if (tests.some((test) => test(glyphs))) risks.push({ code: "positioning", index, length: word.length });
    index += word.length;
  }
  return risks;
}

/**
 * This function gives the parts of a text that the model does not shape as HarfBuzz does, in the order of the text.
 * It examines the text as `measureWidth` does with the same options. An empty list is not a proof of a correct width.
 */
export function shapingRisks(font: Font, text: string, options: MeasureOptions = {}): ShapingRisk[] {
  const risks = missingGlyphs(font, text);
  for (const { 0: part, index } of text.matchAll(unshapedScripts)) risks.push({ code: "unshaped-script", index, length: part.length });
  for (const match of text.matchAll(sequences)) {
    const name = Object.keys(sequenceCodes).find((key) => match.groups?.[key] !== undefined)!;
    risks.push({ code: sequenceCodes[name]!, index: match.index, length: match[0].length });
  }
  risks.push(...positioning(font, text, options));
  return risks.sort((a, b) => a.index - b.index);
}
