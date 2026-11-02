import { quantile } from "@mark1russell7/rigor-statistics";
import { fontsFor, type FontId, type LengthClass, type Sample, type ScriptId } from "@typeset/corpus";
import { measureWidth, type Font } from "@typeset/fonts";
import { scriptTags } from "./sources.ts";

/** One width of one text, from the tables and from the canvas. */
export interface WidthRecord {
  readonly sample: string;
  readonly script: ScriptId;
  readonly lengthClass: LengthClass;
  readonly font: FontId | string;
  /** The CSS weight of the canvas and the weight axis of the model. */
  readonly weight: number;
  readonly size: number;
  readonly codePoints: number;
  /** The count of code points that the font has no glyph for. The canvas then uses a fallback font. */
  readonly missing: number;
  readonly canvas: number;
  readonly tables: number;
  /** The table width minus the canvas width, in px. */
  readonly error: number;
  /** The table width in the rounding mode `pixel`. */
  readonly pixel: number;
}

/** The widths to get for one font: the texts and the sizes. */
export interface FontTask {
  readonly font: FontId | string;
  /** The CSS weight. The default is 400. */
  readonly weight?: number;
  readonly samples: readonly Sample[];
  readonly sizes: readonly number[];
}

/** This function gives one task for each font: each sample of a script that the font covers, at each size. */
export function tasksOf(samples: readonly Sample[], fontIds: readonly FontId[], sizes: readonly number[]): FontTask[] {
  return fontIds.map((font) => ({ font, sizes, samples: samples.filter((sample) => fontsFor(sample.script).some((spec) => spec.id === font)) }));
}

/** This function gives the count of code points of a text that a font has no glyph for. */
export function missingGlyphs(font: Font, text: string): number {
  let missing = 0;
  for (const character of text) if (font.glyph(character.codePointAt(0)!) === 0) missing++;
  return missing;
}

/** This function gives the records of one task from the canvas widths. `canvas[s][i]` is the width of the sample `i` at the size `s`. */
export function recordsOf(task: FontTask, font: Font, canvas: readonly (readonly number[])[]): WidthRecord[] {
  const records: WidthRecord[] = [];
  task.samples.forEach((sample, i) => {
    const missing = missingGlyphs(font, sample.text);
    const codePoints = [...sample.text].length;
    task.sizes.forEach((size, s) => {
      const options = { script: scriptTags[sample.script] };
      const tables = measureWidth(font, sample.text, size, options);
      const pixel = measureWidth(font, sample.text, size, { ...options, rounding: "pixel" });
      const measured = canvas[s]![i]!;
      records.push({ sample: sample.id, script: sample.script, lengthClass: sample.lengthClass, font: task.font, weight: task.weight ?? 400, size, codePoints, missing, canvas: measured, tables, error: tables - measured, pixel });
    });
  });
  return records;
}

/** The errors of one script and one length class. A record with a missing glyph is not in the numbers, only in `excluded`. */
export interface Cell {
  readonly n: number;
  readonly excluded: number;
  readonly worstPx: number;
  readonly meanPx: number;
  readonly p90Px: number;
  /** The largest error divided by the canvas width. */
  readonly worstRelative: number;
  readonly worst?: { readonly sample: string; readonly font: FontId | string; readonly size: number; readonly error: number };
  /** The count of records where the width of the mode `pixel` is equal to the canvas width. */
  readonly pixelExact: number;
  /** The largest error of the mode `pixel`, in px. */
  readonly pixelWorstPx: number;
}

/** This function gives the cells of the errors, by script and by length class. */
export function summarize(records: readonly WidthRecord[]): Partial<Record<ScriptId, Partial<Record<LengthClass, Cell>>>> {
  const groups = new Map<string, WidthRecord[]>();
  for (const record of records) {
    const key = `${record.script}\u0000${record.lengthClass}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  const summary: Partial<Record<ScriptId, Partial<Record<LengthClass, Cell>>>> = {};
  for (const [key, group] of groups) {
    const [script, lengthClass] = key.split("\u0000") as [ScriptId, LengthClass];
    const used = group.filter((record) => record.missing === 0);
    const errors = used.map((record) => Math.abs(record.error));
    let worst: WidthRecord | undefined;
    for (const record of used) if (worst === undefined || Math.abs(record.error) > Math.abs(worst.error)) worst = record;
    const cell: Cell = {
      n: used.length,
      excluded: group.length - used.length,
      worstPx: errors.length === 0 ? Number.NaN : Math.max(...errors),
      meanPx: errors.length === 0 ? Number.NaN : errors.reduce((a, b) => a + b, 0) / errors.length,
      p90Px: errors.length === 0 ? Number.NaN : quantile(errors, 0.9),
      worstRelative: used.length === 0 ? Number.NaN : Math.max(...used.map((record) => (record.canvas === 0 ? 0 : Math.abs(record.error) / record.canvas))),
      ...(worst === undefined ? {} : { worst: { sample: worst.sample, font: worst.font, size: worst.size, error: worst.error } }),
      pixelExact: used.filter((record) => record.pixel === record.canvas).length,
      pixelWorstPx: used.length === 0 ? Number.NaN : Math.max(...used.map((record) => Math.abs(record.pixel - record.canvas))),
    };
    (summary[script] ??= {})[lengthClass] = cell;
  }
  return summary;
}

/** A bound of the prediction `typeset-t1-font-tables` on the worst error of the line class, in px. */
export interface Bound {
  readonly outcome: string;
  readonly scripts: readonly ScriptId[];
  /** The bound holds when each worst error is at most `atMost`, or more than `above`. */
  readonly atMost?: number;
  readonly above?: number;
}

/** The bounds of the prediction, written before the code. */
export const bounds: readonly Bound[] = [
  { outcome: "specificBoundEuropean", scripts: ["latin", "greek", "cyrillic", "hebrew"], atMost: 0.5 },
  { outcome: "specificBoundMarks", scripts: ["latin-extended"], atMost: 1.0 },
  { outcome: "specificBoundCjk", scripts: ["han", "kana", "hangul"], atMost: 0.1 },
  { outcome: "specificShapingGap", scripts: ["arabic", "devanagari"], above: 2 },
];

/** This function tells for each bound if it holds on the line class of a summary. */
export function checkBounds(summary: ReturnType<typeof summarize>): { outcome: string; holds: boolean; worst: Partial<Record<ScriptId, number>> }[] {
  return bounds.map((bound) => {
    const worst: Partial<Record<ScriptId, number>> = {};
    let holds = true;
    for (const script of bound.scripts) {
      const value = summary[script]?.line?.worstPx ?? Number.NaN;
      worst[script] = value;
      if (Number.isNaN(value)) holds = false;
      if (bound.atMost !== undefined && !(value <= bound.atMost)) holds = false;
      if (bound.above !== undefined && !(value > bound.above)) holds = false;
    }
    return { outcome: bound.outcome, holds, worst };
  });
}

/** The fractional parts of a list of widths: how many are on each grid, and a histogram in steps of 1/64 px. */
export interface Fractions {
  readonly n: number;
  readonly whole: number;
  readonly half: number;
  readonly quarter: number;
  readonly sixtyFourth: number;
  /** The count of widths with a fractional part in each step of 1/64 px, from 0 to 63/64. */
  readonly histogram: readonly number[];
}

/** This function tells if a value is on the grid of the step `1/steps`. */
function onGrid(value: number, steps: number): boolean {
  return Math.abs(value * steps - Math.round(value * steps)) < 1e-6;
}

/** This function gives the fractional parts of the widths. A width on the 1/4 px grid shows a rounding of the browser. */
export function fractionsOf(widths: readonly number[]): Fractions {
  const histogram = new Array<number>(64).fill(0);
  for (const width of widths) histogram[Math.min(63, Math.floor((width - Math.floor(width)) * 64 + 1e-6))]!++;
  return {
    n: widths.length,
    whole: widths.filter((width) => onGrid(width, 1)).length,
    half: widths.filter((width) => onGrid(width, 2)).length,
    quarter: widths.filter((width) => onGrid(width, 4)).length,
    sixtyFourth: widths.filter((width) => onGrid(width, 64)).length,
    histogram,
  };
}

/**
 * This function gives the characters of the instance probe of a font. They are the characters of the texts with a glyph
 * in the font, with no marks and no spaces, at most `limit`. The probe measures each character alone, so no shaping and
 * no kerning change it.
 */
export function probeCharacters(font: Font, texts: readonly string[], limit = 64): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const character of text) {
      if (found.size >= limit) return [...found];
      const glyph = font.glyph(character.codePointAt(0)!);
      if (glyph !== 0 && font.glyphClass(glyph) !== 3 && !/\p{M}|\s/u.test(character)) found.add(character);
    }
  }
  return [...found];
}

/** The result of the instance probe of one font on one arm. */
export interface InstanceProbe {
  readonly font: string;
  /** The CSS weight of the canvas, and the weight of the model. */
  readonly requested: number;
  /** The instance of the model, after the clamp to the axes of the font. */
  readonly model: Readonly<Record<string, number>>;
  readonly characters: number;
  /** The model weight with the smallest error. With a tie, this is the requested weight when it is in the tie. */
  readonly found: number;
  /** The count of weights with the smallest error. A count above 1 means that the probe does not tell those weights apart. */
  readonly tied: number;
  readonly errorAtRequested: number;
  readonly minimumError: number;
  readonly matches: boolean;
}

/**
 * This function finds the weight of the model that is nearest to the canvas widths of the probe characters. The error of a
 * weight is the sum of the absolute differences of the characters, in px. The weights go from 100 to 900 in steps of 25,
 * in the range of the axis.
 */
export function probeInstance(id: string, font: Font, requested: number, characters: readonly string[], canvas: readonly number[], size: number, rounding: "exact" | "pixel"): InstanceProbe {
  const axis = font.axes.find((a) => a.tag === "wght");
  const weights: number[] = [];
  for (let weight = 100; weight <= 900; weight += 25) if (axis === undefined || (weight >= axis.min && weight <= axis.max)) weights.push(weight);
  const errorOf = (weight: number): number => {
    const instanced = font.at({ ...font.instance, wght: weight });
    return characters.reduce((sum, character, i) => sum + Math.abs(measureWidth(instanced, character, size, { rounding }) - canvas[i]!), 0);
  };
  const errors = weights.map(errorOf);
  const minimumError = Math.min(...errors);
  const best = weights.filter((_, i) => errors[i]! - minimumError < 1e-9);
  const found = best.includes(requested) ? requested : best[0]!;
  return {
    font: id,
    requested,
    model: font.instance,
    characters: characters.length,
    found,
    tied: best.length,
    errorAtRequested: errorOf(requested),
    minimumError,
    matches: found === requested && font.instance["wght"] === requested,
  };
}
