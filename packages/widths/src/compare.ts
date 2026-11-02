import { quantile } from "@mark1russell7/rigor-statistics";
import { fontsFor, type FontId, type LengthClass, type Sample, type ScriptId } from "@typeset/corpus";
import { measureWidth, type Font } from "@typeset/fonts";
import { scriptTags } from "./sources.ts";

/** One width of one text, from the tables and from the canvas. */
export interface WidthRecord {
  readonly sample: string;
  readonly script: ScriptId;
  readonly lengthClass: LengthClass;
  readonly font: FontId;
  readonly size: number;
  readonly codePoints: number;
  /** The count of code points that the font has no glyph for. The canvas then uses a fallback font. */
  readonly missing: number;
  readonly canvas: number;
  readonly tables: number;
  /** The table width minus the canvas width, in px. */
  readonly error: number;
}

/** The widths to get for one font: the texts and the sizes. */
export interface FontTask {
  readonly font: FontId;
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
      const tables = measureWidth(font, sample.text, size, { script: scriptTags[sample.script] });
      const measured = canvas[s]![i]!;
      records.push({ sample: sample.id, script: sample.script, lengthClass: sample.lengthClass, font: task.font, size, codePoints, missing, canvas: measured, tables, error: tables - measured });
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
  readonly worst?: { readonly sample: string; readonly font: FontId; readonly size: number; readonly error: number };
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
