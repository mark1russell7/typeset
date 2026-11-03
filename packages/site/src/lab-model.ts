/** The pure logic of the lab: the model width of a text, its canvas words and its glyphs, against the canvas widths. */
import { fontSizes, generateCorpus, generateSample, type LengthClass, type ScriptId } from "@typeset/corpus";
import { canvasWords, glyphAdvances, measureWidth, type Font } from "@typeset/fonts";
import { engineRecords, missingGlyphs, recordsOf, scriptTags, summarize, type FontTask } from "@typeset/widths";
import type { Summary } from "./snapshot.ts";

/** One glyph of the model, after the substitutions and the kerning. */
export interface GlyphView {
  /** The characters of the glyph, when the word has one glyph for each character. Else the text is empty. */
  readonly text: string;
  readonly glyph: number;
  /** The advance of the glyph in font units, with no kerning. */
  readonly advance: number;
  /** The pair kerning of the glyph in font units. */
  readonly kerning: number;
  /** The advance with the kerning, in px at the size of the text, with no rounding. */
  readonly px: number;
}

/** One canvas word: the model width and the canvas width of the word alone. */
export interface WordView {
  readonly text: string;
  readonly model: number;
  readonly canvas: number;
  readonly error: number;
  /** This value is `true` for a space, a tab or a zero width space. */
  readonly space: boolean;
  readonly glyphs: readonly GlyphView[];
}

/** The result of the lab for one text. */
export interface LabResult {
  readonly model: number;
  readonly canvas: number;
  /** The model width minus the canvas width, in px. */
  readonly error: number;
  /** The count of characters that the font has no glyph for. The browser then uses a fallback font. */
  readonly missing: number;
  readonly words: readonly WordView[];
}

/** The input of `labResult`. */
export interface LabInput {
  readonly font: Font;
  readonly text: string;
  readonly size: number;
  readonly script: ScriptId;
  readonly rounding: "exact" | "pixel";
  /** The sum of the engine. `float32` models the canvas of Blink on macOS and Windows. The default is `exact`. */
  readonly sum?: "exact" | "float32";
}

/**
 * This function measures a text with the model and with a canvas function `canvas`, and gives the canvas words with
 * their glyphs. The model shapes each canvas word alone, as Blink does, so the words add up to the whole text.
 */
export function labResult(input: LabInput, canvas: (text: string) => number): LabResult {
  const { font, text, size, rounding } = input;
  const script = scriptTags[input.script];
  const options = { script, shaping: "canvas", rounding, sum: input.sum ?? "exact" } as const;
  const model = measureWidth(font, text, size, options);
  const measured = canvas(text);
  const scale = size / font.unitsPerEm;
  const words = canvasWords(text).map((word): WordView => {
    const { glyphs, advances } = glyphAdvances(font, word, options);
    const characters = [...word];
    const views = glyphs.map((glyph, i): GlyphView => {
      const advance = font.advance(glyph);
      return { text: glyphs.length === characters.length ? characters[i]! : "", glyph, advance, kerning: advances[i]! - advance, px: advances[i]! * scale };
    });
    const wordModel = measureWidth(font, word, size, options);
    const wordCanvas = canvas(word);
    return { text: word, model: wordModel, canvas: wordCanvas, error: wordModel - wordCanvas, space: /^[\s​]$/u.test(word), glyphs: views };
  });
  return { model, canvas: measured, error: model - measured, missing: missingGlyphs(font, text), words };
}

/** This function gives the text of a sample of the corpus with the seed 1, as CI uses it. */
export function sampleText(script: ScriptId, lengthClass: LengthClass, index: number): string {
  return generateSample(1, script, lengthClass, index).text;
}

/** The length classes of the sweep. The class `page` has texts of up to 6000 characters, so the sweep leaves it out. */
export const sweepClasses: readonly LengthClass[] = ["word", "line", "paragraph"];

/**
 * This function gives the task of a sweep. The task has the samples of the corpus with the seed 1 for the scripts of a
 * font, at each size of the corpus. CI uses 40 samples for each script and length class.
 */
export function sweepTask(font: string, weight: number, scripts: readonly ScriptId[], perCell: number): FontTask {
  const samples = generateCorpus({ seed: 1, perCell, scripts, lengthClasses: sweepClasses });
  return { font, weight, samples, sizes: fontSizes };
}

/**
 * This function gives the summary of a sweep from its canvas widths, `canvas[s][i]` for the size `s` and the sample `i`.
 * It uses the code of the CI comparison, with the rounding and the sum of the engine.
 */
export function sweepSummary(task: FontTask, font: Font, canvas: readonly (readonly number[])[], rounding: "exact" | "pixel", sum: "exact" | "float32" = "exact"): Summary {
  return summarize(engineRecords(recordsOf(task, font, canvas), rounding, sum));
}

/**
 * This function gives the scale of the preview drawing, so that a drawing of `width` px fits in a box of `available` px.
 * The scale is at most 1 and at least `minimum`. A wider drawing at the minimum scale scrolls in its box.
 */
export function previewFit(width: number, available: number, minimum = 0.5): number {
  if (!(width > 0) || !(available > 0)) return 1;
  return Math.max(minimum, Math.min(1, available / width));
}
