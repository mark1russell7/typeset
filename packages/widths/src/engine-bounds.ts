/**
 * The engine bounds of T4b: the error of each engine row against the canvas of Chromium on its own arm, in 1/64 px.
 * Each arm writes its cells into its record. `scripts/engine-bounds.ts` joins the arms into one record and one table.
 * The cells use only the widths that the arm already measures, so this module has no browser code.
 */
import { boundStatistics, bootstrapRuns, worstOf, type BoundStatistics } from "./bounds.ts";
import { engineRecords, type WidthRecord } from "./compare.ts";

/** The marks in `docs/FONTS.md` between which `scripts/engine-bounds.ts` writes the table. */
export const engineTableMarks = { start: "<!-- engine-table:start -->", end: "<!-- engine-table:end -->" } as const;

/** The arm of one measurement and the fields of its engine row that change a width. */
export interface EngineArm {
  readonly arm: string;
  readonly engine: string;
  readonly rounding: "exact" | "pixel";
  readonly sum: "exact" | "float32";
}

/** One cell of the engine record: one arm, script, font, weight and size. */
export interface EngineBoundCell {
  readonly arm: string;
  readonly engine: string;
  readonly script: string;
  readonly font: string;
  readonly weight: number;
  readonly size: number;
  /** The count of the records with a missing glyph. The canvas then uses a fallback font, so the statistics leave them out. */
  readonly excluded: number;
  /** The model under the engine row minus the canvas. A positive error is a model width larger than the canvas. */
  readonly error: BoundStatistics;
  /** The model width minus the model width with exact deltas, before the rounding of the row. */
  readonly readEffect: BoundStatistics;
}

/**
 * This function gives the cells of one arm from its records. The records hold the widths of the model with no engine
 * rule, and the engine row of `arm` then gives each error. All the statistics are in 1/64 px.
 */
export function engineBoundCells(records: readonly WidthRecord[], arm: EngineArm, runs: number = bootstrapRuns): EngineBoundCell[] {
  const ruled = engineRecords(records, arm.rounding, arm.sum);
  const groups = new Map<string, { first: WidthRecord; excluded: number; errors: number[]; reads: number[] }>();
  records.forEach((record, i) => {
    const key = [record.script, record.font, record.weight, record.size].join("/");
    const group = groups.get(key) ?? { first: record, excluded: 0, errors: [], reads: [] };
    groups.set(key, group);
    if (record.missing > 0) {
      group.excluded++;
      return;
    }
    group.errors.push(ruled[i]!.error * 64);
    if (record.exactDeltas !== undefined) group.reads.push((record.tables - record.exactDeltas) * 64);
  });
  return [...groups].map(([key, { first, excluded, errors, reads }]) => ({
    arm: arm.arm,
    engine: arm.engine,
    script: first.script,
    font: first.font,
    weight: first.weight,
    size: first.size,
    excluded,
    error: boundStatistics(errors, `${arm.arm}/${key}/error`, runs),
    readEffect: boundStatistics(reads, `${arm.arm}/${key}/read`, runs),
  }));
}

/** The result of the check of the read effect. */
export interface ReadCheck {
  /** The count of the cells with a worst read effect above the floor. */
  readonly cells: number;
  /** The largest share of the worst model error in the worst read effect, over those cells. */
  readonly worstShare: number | null;
  readonly holds: boolean;
}

/**
 * This function examines the read effect of the model. The observed effect differs from the effect of the model by the
 * model error. So only a cell with a large effect tells something, and the floor `floor` in 1/64 px selects these cells.
 * The check holds when such a cell exists and each such cell has a share of at most `limit`.
 */
export function readCheck(cells: readonly EngineBoundCell[], floor: number = 1, limit: number = 0.1): ReadCheck {
  const shares = cells.flatMap((cell) => {
    const effect = Math.abs(cell.readEffect.worst?.estimate ?? 0);
    return effect > floor ? [Math.abs(cell.error.worst?.estimate ?? 0) / effect] : [];
  });
  const worstShare = shares.length === 0 ? null : Math.max(...shares);
  return { cells: shares.length, worstShare, holds: worstShare !== null && worstShare <= limit };
}

/**
 * This function gives a Markdown table of the cells. Each row is a script. Each arm has a column of the worst model error.
 * The last column has the worst read effect. Each value is in 1/64 px, with the 95 % interval.
 */
export function engineTable(cells: readonly EngineBoundCell[]): string {
  const scripts = [...new Set(cells.map((cell) => cell.script))].sort();
  const arms = [...new Set(cells.map((cell) => cell.arm))].sort();
  const rows = scripts.map((script) => {
    const own = cells.filter((cell) => cell.script === script);
    const values = arms.map((arm) => worstOf(own.filter((cell) => cell.arm === arm), (cell) => cell.error));
    return `| ${script} | ${[...values, worstOf(own, (cell) => cell.readEffect)].join(" | ")} |`;
  });
  const heads = [...arms.map((arm) => `\`${arm}\``), "Read effect"];
  return [`| Script | ${heads.join(" | ")} |`, `|---|${heads.map(() => "---").join("|")}|`, ...rows].join("\n");
}
