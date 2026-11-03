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

/** One cell of the record, as `harfbuzz-bounds.json` writes it. */
export interface RecordCell extends BoundStatistics {
  readonly script: string;
  readonly font: string;
  readonly weight: number;
  readonly size: number;
  readonly tier: TierName;
  readonly engine: string;
}

/** The marks in `docs/FONTS.md` between which `scripts/bounds-table.ts` writes the table. */
export const tableMarks = { start: "<!-- bounds-table:start -->", end: "<!-- bounds-table:end -->" } as const;

const format = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

/**
 * This function gives a Markdown table of the record. Each row is a script, and each column is a tier. Each value is the
 * worst error over the fonts, the weights, the sizes and the engine rows, with its 95 % interval, in 1/64 px.
 */
export function boundsTable(cells: readonly RecordCell[]): string {
  const scripts = [...new Set(cells.map((cell) => cell.script))].sort();
  const rows = scripts.map((script) => {
    const values = tierNames.map((tier) => {
      let worst: RecordCell | undefined;
      for (const cell of cells) {
        if (cell.script !== script || cell.tier !== tier || cell.worst === null) continue;
        if (worst?.worst === undefined || worst.worst === null || Math.abs(cell.worst.estimate) > Math.abs(worst.worst.estimate)) worst = cell;
      }
      if (worst?.worst === undefined || worst.worst === null) return "no data";
      const { estimate, low, high } = worst.worst;
      return `${format(estimate)} [${format(low)}, ${format(high)}] at ${worst.size} px, ${worst.engine}`;
    });
    const open = knownOpen[script] === undefined ? "" : ` (open: ${knownOpen[script]})`;
    return `| ${script}${open} | ${values.join(" | ")} |`;
  });
  return [`| Script | ${tierNames.map((tier) => `\`${tier}\``).join(" | ")} |`, `|---|${tierNames.map(() => "---").join("|")}|`, ...rows].join("\n");
}

/** This function puts the table between the marks of a document. It throws an error when the document has no marks. */
export function withTable(document: string, table: string): string {
  const start = document.indexOf(tableMarks.start);
  const end = document.indexOf(tableMarks.end);
  if (start < 0 || end < start) throw new Error(`the document has no marks ${tableMarks.start} and ${tableMarks.end}`);
  return `${document.slice(0, start + tableMarks.start.length)}\n${table}\n${document.slice(end)}`;
}
