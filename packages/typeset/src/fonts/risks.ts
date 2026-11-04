/** The risks of shaping: the text that the model cannot measure with trust. */
import { glyphAdvances, shapingOf, type Font, type MeasureOptions } from "./font.ts";
import { hasDefaultIgnorable, normalizeCodePoints } from "./normalize.ts";
import { canvasWords } from "./words.ts";

/** The kinds of risk. */
export type ShapingRiskCode = "missing-glyph" | "unshaped-script" | "emoji-zwj" | "variation-selector" | "keycap" | "flag" | "tag" | "positioning";

/** One part of a text that the model does not shape as HarfBuzz does, in UTF-16 units. */
export interface ShapingRisk {
  readonly code: ShapingRiskCode;
  readonly index: number;
  readonly length: number;
}

const unshaped = /[\p{sc=Beng}\p{sc=Guru}\p{sc=Gujr}\p{sc=Orya}\p{sc=Taml}\p{sc=Telu}\p{sc=Knda}\p{sc=Mlym}\p{sc=Sinh}\p{sc=Khmr}\p{sc=Mymr}\p{sc=Tibt}\p{sc=Mong}\p{sc=Nkoo}\p{sc=Mand}]+/gu;
const pictograph = String.raw`\p{ExtPict}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?`;
// The longest forms come first
const sequences = new RegExp(String.raw`(\p{ExtPict}[\u{E0020}-\u{E007E}]+\u{E007F})|(${pictograph}(?:\u200D${pictograph})+)|([0-9#*]\uFE0F?\u20E3)|(\p{RI}\p{RI})|([\uFE00-\uFE0F\u{E0100}-\u{E01EF}])`, "gu");
const sequenceCodes: readonly ShapingRiskCode[] = ["tag", "emoji-zwj", "keycap", "flag", "variation-selector"];
const clusters = /\P{M}\p{M}*|\p{M}+/gu;
const control = /\p{Cc}/u;

/** This function gives the risks of a text in text order. An empty list is not a proof of a correct width. */
export function shapingRisks(font: Font, text: string, options: MeasureOptions = {}): ShapingRisk[] {
  const risks: ShapingRisk[] = [];
  const add = (code: ShapingRiskCode, index: number, { length }: string): number => risks.push({ code, index, length });
  const absent = (codePoint: number): boolean => {
    const character = String.fromCodePoint(codePoint);
    return font.glyph(codePoint) === 0 && !control.test(character) && !hasDefaultIgnorable(character);
  };
  const hasGlyph = (codePoint: number): boolean => font.glyph(codePoint) !== 0;
  for (const { 0: cluster, index } of text.matchAll(clusters)) {
    if (normalizeCodePoints(Array.from(cluster, (character) => character.codePointAt(0)!), { hasGlyph, shortCircuit: true }).some(absent)) add("missing-glyph", index, cluster);
  }
  for (const { 0: part, index } of text.matchAll(unshaped)) add("unshaped-script", index, part);
  for (const match of text.matchAll(sequences)) add(sequenceCodes[match.slice(1).findIndex(Boolean)]!, match.index, match[0]);
  const tests = options.kerning === false ? [] : font.contextKerning?.(shapingOf(font, options).script) ?? [];
  if (tests.length > 0) {
    let index = 0;
    for (const word of options.shaping === "canvas" ? canvasWords(text) : [text]) {
      const { glyphs } = glyphAdvances(font, word, options);
      if (tests.some((test) => test(glyphs))) add("positioning", index, word);
      index += word.length;
    }
  }
  return risks.sort((a, b) => a.index - b.index);
}
