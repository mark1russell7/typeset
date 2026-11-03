/**
 * The reference shaper of T4: HarfBuzz from the package `harfbuzzjs`. This module shapes the words of a canvas with HarfBuzz
 * and gives the glyphs and their advances. The error run of `bounds.test.ts` compares the font model with these advances.
 *
 * The scale of the font is its units per em. Thus each advance is a whole number of font units, with the `HVAR` delta rounded
 * as HarfBuzz rounds it. The conversion to px is `units × size / unitsPerEm`, with no rounding. One shaping then serves
 * all the sizes, and a fractional size, for example 15.333 px, gets no rounding of the scale.
 */
import { Blob, Buffer, BufferFlag, Direction, Face, Font, shape, Variation, versionString } from "harfbuzzjs";
import { canvasWords } from "@mark1russell7/typeset/fonts/inspect";

/** The version of HarfBuzz in the package `harfbuzzjs`, for example `12.1.0`. */
export const harfbuzzVersion: string = versionString();

/** The OpenType script tags that HarfBuzz shapes from right to left. */
const rightToLeft: ReadonlySet<string> = new Set(["arab", "hebr", "syrc", "thaa", "nkoo"]);

/** The glyphs of one text and their advances in font units, in the logical order of the text. */
export interface Shaped {
  readonly glyphs: number[];
  readonly advances: number[];
}

/** One font file in HarfBuzz at one instance. */
export interface ReferenceFont {
  readonly unitsPerEm: number;
  /** The axes of the font, as the tags of `fvar`. */
  readonly axes: readonly string[];
  /** This function shapes the text as one HarfBuzz buffer at the scale of the units per em. */
  shape(text: string, script: string): Shaped;
  /** This function shapes each word of `canvasWords` alone, as Blink does for a canvas, and gives the words in order. */
  shapeWords(text: string, script: string): { readonly word: string; readonly shaped: Shaped }[];
  /** This function gives the advance of a glyph from `hb_font_get_glyph_h_advance` at the scale `scale`, with no shaping. */
  glyphAdvance(glyph: number, scale: number): number;
}

/**
 * This function gives the ISO 15924 script of HarfBuzz for an OpenType script tag. The tag `DFLT` becomes `Zyyy`, the
 * script Common, so HarfBuzz selects the script `DFLT` of the font, as the model does.
 */
export function harfbuzzScript(tag: string): string {
  if (tag === "DFLT") return "Zyyy";
  return tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
}

/**
 * This function opens a font file in HarfBuzz at the instance `instance`, in the user units of the axes. An axis that the
 * font does not have is left out. HarfBuzz clamps each value to the range of its axis, as the model does.
 */
export function openReferenceFont(bytes: Uint8Array, instance: Readonly<Record<string, number>> = {}): ReferenceFont {
  const face = new Face(new Blob(bytes));
  const font = new Font(face);
  const upem = face.upem;
  const axes = Object.keys(face.getAxisInfos());
  const variations = Object.entries(instance)
    .filter(([tag]) => axes.includes(tag))
    .map(([tag, value]) => new Variation(tag, value));
  if (variations.length > 0) font.setVariations(variations);
  const buffer = new Buffer();
  const shapeText = (text: string, script: string): Shaped => {
    font.setScale(upem, upem);
    buffer.reset();
    buffer.addText(text);
    buffer.setScript(harfbuzzScript(script));
    buffer.setDirection(rightToLeft.has(script) ? Direction.RTL : Direction.LTR);
    buffer.setFlags(BufferFlag.BOT | BufferFlag.EOT);
    shape(font, buffer);
    const glyphs = buffer.getGlyphInfos().map((info) => info.codepoint);
    const advances = buffer.getGlyphPositions().map((position) => position.xAdvance);
    // HarfBuzz gives the glyphs of a right-to-left buffer in the visual order, and the model gives them in the logical order
    if (rightToLeft.has(script)) {
      glyphs.reverse();
      advances.reverse();
    }
    return { glyphs, advances };
  };
  return {
    unitsPerEm: upem,
    axes,
    shape: shapeText,
    shapeWords: (text, script) => canvasWords(text).map((word) => ({ word, shaped: shapeText(word, script) })),
    glyphAdvance(glyph, scale) {
      font.setScale(scale, scale);
      const advance = font.glyphHAdvance(glyph);
      font.setScale(upem, upem);
      return advance;
    },
  };
}

/** This function gives the sum of the advances of the words of a canvas, in font units at the scale of the units per em. */
export function referenceUnits(font: ReferenceFont, text: string, script: string): number {
  let units = 0;
  for (const { shaped } of font.shapeWords(text, script)) for (const advance of shaped.advances) units += advance;
  return units;
}
