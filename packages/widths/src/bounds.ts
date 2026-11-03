/**
 * The error bounds of T4: the error of the fast path of `@mark1russell7/typeset/fonts` against HarfBuzz, in 1/64 px.
 * This module gives the tiers of the fast path, the sizes of the sweep and the statistics of one cell.
 */
import { deriveSeed } from "@mark1russell7/rigor-generators";
import { bootstrap, quantile } from "@mark1russell7/rigor-statistics";
import { fontSizes } from "@typeset/corpus";
import type { MeasureOptions } from "@mark1russell7/typeset/fonts";
import type { readTables } from "@mark1russell7/typeset/fonts/inspect";

/**
 * The three tiers of the fast path. Each tier is a set of options of `measureWidth`. The tier `advances` adds the advances
 * only. The tier `kerned` adds the pair kerning. The tier `model` is the full model: GSUB, joining, the Indic shaper and kerning.
 */
export const tiers: Readonly<Record<TierName, MeasureOptions>> = {
  advances: { kerning: false, features: [], joining: false, indic: false },
  kerned: { features: [], joining: false, indic: false },
  model: {},
};

/** The name of a tier of `tiers`. */
export type TierName = "advances" | "kerned" | "model";

/** The names of the tiers, from the simplest to the full model. */
export const tierNames: readonly TierName[] = ["advances", "kerned", "model"];

/** The sizes of the sweep, in px: the sizes of the corpus and five more, with two fractional sizes. */
export const boundSizes: readonly number[] = [...fontSizes, 8, 13.5, 15.333, 72, 96].sort((a, b) => a - b);

/** The count of the bootstrap draws of each interval. */
export const bootstrapRuns: number = 2000;

/** The scripts with a known open error. The record marks them, and no test gates on them. */
export const knownOpen: Readonly<Record<string, string>> = { "latin-extended": "T1e" };

/** One statistic and its 95 % bootstrap interval. */
export interface Estimate {
  readonly estimate: number;
  readonly low: number;
  readonly high: number;
}

/** The statistics of the errors of one cell, in 1/64 px. */
export interface BoundStatistics {
  readonly n: number;
  /** The error with the largest absolute value, with its sign. A positive error is a model width larger than HarfBuzz. */
  readonly worst: Estimate | null;
  /** The 0.99 quantile of the absolute errors, with the linear method. */
  readonly p99: Estimate | null;
}

/** This function gives the value with the largest absolute value. On a tie, the first value stays. */
export function worstSigned(values: readonly number[]): number {
  let worst = 0;
  for (const value of values) if (Math.abs(value) > Math.abs(worst)) worst = value;
  return worst;
}

function estimateOf(interval: { readonly estimate: number; readonly low: number; readonly high: number }): Estimate {
  return { estimate: interval.estimate, low: interval.low, high: interval.high };
}

/**
 * This function gives the statistics of the errors `errors` of one cell. Each interval is a percentile bootstrap of
 * `rigor-statistics`, with a seed of `rigor-generators` from the label `label`. A cell with no error gives `null` statistics.
 */
export function boundStatistics(errors: readonly number[], label: string, runs: number = bootstrapRuns): BoundStatistics {
  if (errors.length === 0) return { n: 0, worst: null, p99: null };
  const absolute = errors.map((error) => Math.abs(error));
  const options = { runs, level: 0.95 };
  return {
    n: errors.length,
    worst: estimateOf(bootstrap(errors, worstSigned, { ...options, seed: deriveSeed(1, `${label}/worst`) })),
    p99: estimateOf(bootstrap(absolute, (sample) => quantile(sample, 0.99), { ...options, seed: deriveSeed(1, `${label}/p99`) })),
  };
}

/**
 * This function gives the advance of each glyph in the `hmtx` table of a font, in font units, with no variation and no
 * shaping. A glyph after the last long metric has the advance of the last long metric.
 */
export function hmtxAdvances(tables: ReturnType<typeof readTables>): (glyph: number) => number {
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  if (hhea === undefined || hmtx === undefined) throw new Error("the font has no hhea or hmtx table");
  const longMetrics = hhea.u16(34);
  return (glyph) => hmtx.u16(4 * Math.min(glyph, longMetrics - 1));
}

/**
 * One cell of the record, as `harfbuzz-bounds.json` writes it. The statistics of the cell are the model error: the model
 * under the rule of the engine row minus HarfBuzz under the same rule. The field `rounding` is the rounding effect.
 */
export interface RecordCell extends BoundStatistics {
  readonly script: string;
  readonly font: string;
  readonly weight: number;
  readonly size: number;
  readonly tier: TierName;
  readonly engine: string;
  /** The rounding effect: HarfBuzz under the rule of the engine row minus HarfBuzz with no rounding, in 1/64 px. */
  readonly rounding: BoundStatistics;
}

/** The marks in `docs/FONTS.md` between which `scripts/bounds-table.ts` writes the table. */
export const tableMarks = { start: "<!-- bounds-table:start -->", end: "<!-- bounds-table:end -->" } as const;

const format = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

/** This function gives the worst value of the statistics `of` over the cells, with its interval and the place of the cell. */
function worstOf(cells: readonly RecordCell[], of: (cell: RecordCell) => BoundStatistics): string {
  let worst: { cell: RecordCell; value: Estimate } | undefined;
  for (const cell of cells) {
    const value = of(cell).worst;
    if (value !== null && (worst === undefined || Math.abs(value.estimate) > Math.abs(worst.value.estimate))) worst = { cell, value };
  }
  if (worst === undefined) return "no data";
  const { cell, value } = worst;
  return `${format(value.estimate)} [${format(value.low)}, ${format(value.high)}] (${cell.font} ${cell.weight}, ${cell.size} px, ${cell.engine})`;
}

/**
 * This function gives a Markdown table of the record. Each row is a script. Each tier has a column of the worst model error,
 * and the last column is the worst rounding effect. Each worst value is over the fonts, the weights, the sizes and the
 * engine rows, with its 95 % interval, in 1/64 px. The rounding effect has one column, because HarfBuzz has no tiers.
 */
export function boundsTable(cells: readonly RecordCell[]): string {
  const scripts = [...new Set(cells.map((cell) => cell.script))].sort();
  const rows = scripts.map((script) => {
    const own = cells.filter((cell) => cell.script === script);
    const values = tierNames.map((tier) => worstOf(own.filter((cell) => cell.tier === tier), (cell) => cell));
    values.push(worstOf(own, (cell) => cell.rounding));
    const open = knownOpen[script] === undefined ? "" : ` (open: ${knownOpen[script]})`;
    return `| ${script}${open} | ${values.join(" | ")} |`;
  });
  const heads = [...tierNames.map((tier) => `Model error, \`${tier}\``), "Rounding effect"];
  return [`| Script | ${heads.join(" | ")} |`, `|---|${heads.map(() => "---").join("|")}|`, ...rows].join("\n");
}

/** This function puts the table between the marks of a document. It throws an error when the document has no marks. */
export function withTable(document: string, table: string): string {
  const start = document.indexOf(tableMarks.start);
  const end = document.indexOf(tableMarks.end);
  if (start < 0 || end < start) throw new Error(`the document has no marks ${tableMarks.start} and ${tableMarks.end}`);
  return `${document.slice(0, start + tableMarks.start.length)}\n${table}\n${document.slice(end)}`;
}

/** The glyphs of one word: the advance of each glyph after the shaping, and its advance before the kerning, in font units. */
export interface RuledWord {
  readonly advances: readonly number[];
  readonly bases: readonly number[];
}

/** The fields of an engine row that change a width: the rounding of each advance and the sum. */
export interface WidthRule {
  readonly rounding: "exact" | "pixel";
  readonly sum: "exact" | "float32";
}

/**
 * This function gives the width in px of the words `words` under the rule `rule`, as `measureWidth` applies the rule.
 * The test applies it to the advances of HarfBuzz, so the model and HarfBuzz get the same rounding. Each word is a word of
 * `canvasWords`. The sum `float32` of `measureWidth` adds the segments of `canvasSegments`. A word with two bidi levels
 * has two segments, and then the sum has one step less in single precision.
 */
export function ruledWidth(words: readonly RuledWord[], size: number, unitsPerEm: number, rule: WidthRule): number {
  if (rule.rounding === "pixel") {
    const scale = size / unitsPerEm;
    let px = 0;
    for (const { advances, bases } of words) {
      advances.forEach((advance, i) => {
        const base = bases[i]!;
        px += Math.round(Math.round(base * scale * 64) / 64) + Math.round((advance - base) * scale);
      });
    }
    return px;
  }
  if (rule.sum === "float32") {
    const xScale = Math.trunc(Math.fround(size) * 65536);
    const multiplier = Math.floor((xScale * 65536) / unitsPerEm);
    const pxPerUnit = size / unitsPerEm;
    let total = 0;
    for (const { advances, bases } of words) {
      let units = 0;
      advances.forEach((advance, i) => {
        const base = bases[i]!;
        // The kerning has a whole part, which HarfBuzz scales with em_mult, and the fraction of a variation delta, which it scales exactly
        const kerning = advance - base;
        const whole = Math.round(kerning);
        const fraction = Math.fround(Math.fround(Math.fround(kerning - whole) * xScale) / unitsPerEm);
        units += Math.trunc(Math.fround(base * pxPerUnit) * 65536) + Math.floor((whole * multiplier + 32768) / 65536) + Math.sign(fraction) * Math.round(Math.abs(fraction));
      });
      total = Math.fround(total + Math.fround(units / 65536));
    }
    return total;
  }
  let units = 0;
  for (const { advances } of words) for (const advance of advances) units += advance;
  return (units * size) / unitsPerEm;
}
