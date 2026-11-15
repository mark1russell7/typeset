/**
 * The command `node src/stack-gate.ts <folder>`. It reads the file `font-widths.json` of each arm in the folder, and it
 * fails when a cell of the font stacks fails. A width cell fails above 1.28/64 px. A break cell fails by `breakVerdict`.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BreakCell } from "./breaks.ts";
import { allArms } from "./score.ts";
import type { StackCell, StackSet } from "./stacks.ts";

/** The bar of a break cell: the least share of its records with the same lines as Chromium. */
export const breakBar = 0.97;

/**
 * A known gap: a cell that fails the bar because `layoutText` does not break where Chromium breaks. Each gap names the
 * items that close it and their due date.
 */
export interface BreakGap {
  readonly stack: string;
  readonly set: StackSet;
  readonly items: readonly string[];
  readonly due: string;
  readonly reason: string;
}

/**
 * The known gaps of `layoutText` of layout-contract 0.10.0, which breaks a text at the places of `lineBreaks` (UAX #14).
 * On each arm, a listed cell fails the bar only by its `opportunity` records, or it passes. The engines of the arms round the
 * widths differently, so a cell can pass on one arm and be a known gap on another arm. The gate fails a gap when its cell
 * passes the bar on each arm, so that the list stays true. The cells of latin-han pass on each arm since layout-contract 0.10.0.
 */
export const breakGaps: readonly BreakGap[] = [
  { stack: "han-first", set: "covered", items: ["layout-contract#255"], due: "when layout-contract#255 closes", reason: "Chromium breaks before a small kana, as the CSS line-break normal does, and lineBreaks reads a small kana as class NS, as UAX #14 does by default" },
  { stack: "han-first", set: "uncovered", items: ["layout-contract#255"], due: "when layout-contract#255 closes", reason: "Chromium breaks before a small kana, as the CSS line-break normal does, and lineBreaks reads a small kana as class NS, as UAX #14 does by default" },
  { stack: "latin-arabic-emoji", set: "covered", items: ["layout-contract#255"], due: "when layout-contract#255 closes", reason: "Chromium ends a line that holds a lone skin tone modifier after a space one emoji earlier than the model, and the model has a break place there. The cause is open" },
  { stack: "latin-arabic-emoji", set: "uncovered", items: ["layout-contract#255"], due: "when layout-contract#255 closes", reason: "Chromium ends a line that holds a lone skin tone modifier after a space one emoji earlier than the model, and the model has a break place there. The cause is open" },
  { stack: "latin-indic-thai", set: "covered", items: ["T12b", "layout-contract#255"], due: "2026-11-28", reason: "Chromium breaks Thai words by the dictionary of ICU" },
  { stack: "latin-indic-thai", set: "uncovered", items: ["T12b", "layout-contract#255"], due: "2026-11-28", reason: "Chromium breaks Thai words by the dictionary of ICU" },
  { stack: "all-scripts", set: "covered", items: ["T12b", "layout-contract#255"], due: "2026-11-28", reason: "Chromium breaks before a small kana, as the CSS line-break normal does, and lineBreaks reads a small kana as class NS, as UAX #14 does by default. Chromium breaks Thai words by the dictionary of ICU. Chromium ends a line that holds a lone skin tone modifier after a space one emoji earlier than the model, and the model has a break place there. The cause is open" },
  { stack: "all-scripts", set: "uncovered", items: ["T12b", "layout-contract#255"], due: "2026-11-28", reason: "Chromium breaks before a small kana, as the CSS line-break normal does, and lineBreaks reads a small kana as class NS, as UAX #14 does by default. Chromium breaks Thai words by the dictionary of ICU. Chromium ends a line that holds a lone skin tone modifier after a space one emoji earlier than the model, and the model has a break place there. The cause is open" },
];

/** The verdict of a break cell. A `known-gap` cell is not a pass. */
export interface BreakVerdict {
  readonly verdict: "pass" | "known-gap" | "fail";
  readonly reason: string;
}

/**
 * This function gives the verdict of a cell on one arm. A cell passes when at least `breakBar` of its records have the same
 * lines. A listed cell is a known gap only when the bar holds with its `opportunity` records counted as the same. A listed
 * cell that passes is a pass on this arm. `staleGaps` examines the gap on all the arms.
 */
export function breakVerdict(cell: BreakCell, gaps: readonly BreakGap[] = breakGaps): BreakVerdict {
  const gap = gaps.find((value) => value.stack === cell.stack && value.set === cell.set);
  if (cell.n === 0) return { verdict: "fail", reason: "the cell has no record" };
  const share = `${cell.same} of ${cell.n} the same`;
  if (cell.same >= breakBar * cell.n) return { verdict: "pass", reason: gap === undefined ? share : `${share}, so the gap of ${gap.items.join(" and ")} is not necessary on this arm` };
  if (gap === undefined) return { verdict: "fail", reason: `${share}, opportunity ${cell.opportunity}, width ${cell.width}` };
  if (cell.same + cell.opportunity >= breakBar * cell.n) return { verdict: "known-gap", reason: `${share}, opportunity ${cell.opportunity}: ${gap.reason}, ${gap.items.join(" and ")}, due ${gap.due}` };
  return { verdict: "fail", reason: `${share}, and ${cell.width} width records are more than the gap allows` };
}

/** A break cell with its verdict. The Fonts job writes it, and the site shows it. */
export interface BreakCellVerdict extends BreakCell, BreakVerdict {}

/** This function gives each cell with its verdict. */
export function withVerdicts(cells: readonly BreakCell[], gaps: readonly BreakGap[] = breakGaps): BreakCellVerdict[] {
  return cells.map((cell) => ({ ...cell, ...breakVerdict(cell, gaps) }));
}

/** The width limit of a stack cell, in 1/64 px. */
export const stackLimit64 = 1.28;

/** The part of an arm file that the gate uses. An arm file with no stacks has no such field. */
export interface StackArm {
  readonly arm: string;
  readonly stacks?: { readonly cells: readonly StackCell[]; readonly breaks?: { readonly cells: readonly BreakCell[] } };
}

/** One row of the gate. */
export interface GateRow {
  readonly arm: string;
  readonly cell: string;
  readonly verdict: BreakVerdict["verdict"];
  readonly reason: string;
}

/**
 * This function gives the gaps that no arm needs: each break cell of the gap passes the bar on its arm. A gap whose cell is on
 * no arm is also stale. The gate fails each stale gap, so that the list stays true.
 */
export function staleGaps(files: ReadonlyMap<string, StackArm>, gaps: readonly BreakGap[] = breakGaps): BreakGap[] {
  const cells = [...files.values()].flatMap((file) => file.stacks?.breaks?.cells ?? []);
  return gaps.filter((gap) => !cells.some((cell) => cell.stack === gap.stack && cell.set === gap.set && breakVerdict(cell, [gap]).verdict !== "pass"));
}

/**
 * This function gives the rows of the gate. An arm with no file, no stacks or no break cells gives a failed row. A stale gap
 * gives a failed row for all the arms.
 */
export function stackGate(arms: readonly string[], files: ReadonlyMap<string, StackArm>, gaps: readonly BreakGap[] = breakGaps): GateRow[] {
  const rows = arms.flatMap((arm): GateRow[] => {
    const file = files.get(arm);
    if (file?.stacks?.breaks === undefined) return [{ arm, cell: "all", verdict: "fail", reason: "the arm has no record of the stack widths and breaks" }];
    const widths = file.stacks.cells.map((cell): GateRow => ({
      arm,
      cell: `width ${cell.stack} ${cell.set} ${cell.size}px`,
      verdict: cell.n > 0 && cell.worst64 <= stackLimit64 ? "pass" : "fail",
      reason: `worst ${cell.worst64.toFixed(3)}/64 px, n ${cell.n}`,
    }));
    const breaks = file.stacks.breaks.cells.map((cell): GateRow => ({ arm, cell: `breaks ${cell.stack} ${cell.set}`, ...breakVerdict(cell, gaps) }));
    return [...widths, ...breaks];
  });
  const stale = staleGaps(files, gaps).map((gap): GateRow => ({
    arm: "all",
    cell: `breaks ${gap.stack} ${gap.set}`,
    verdict: "fail",
    reason: `the cell passes the bar on each arm, so the gap of ${gap.items.join(" and ")} is stale`,
  }));
  return [...rows, ...stale];
}

if (import.meta.main) {
  const folder = process.argv[2];
  if (folder === undefined) throw new Error("give the folder of the arm files");
  const files = new Map<string, StackArm>();
  for (const arm of allArms) {
    const file = join(folder, `font-widths-${arm}`, "font-widths.json");
    if (existsSync(file)) files.set(arm, JSON.parse(readFileSync(file, "utf8")) as StackArm);
  }
  const rows = stackGate(allArms, files);
  const failed = rows.filter((row) => row.verdict === "fail");
  const lines = [
    `### Font stacks: ${failed.length} failed, ${rows.filter((row) => row.verdict === "known-gap").length} known gaps, ${rows.length} cells`,
    ``,
    `| arm | cell | verdict | reason |`,
    `|---|---|---|---|`,
    ...rows.filter((row) => row.verdict !== "pass" || row.cell.startsWith("breaks")).map((row) => `| ${row.arm} | ${row.cell} | ${row.verdict} | ${row.reason} |`),
  ];
  console.log(lines.join("\n"));
  if (process.env["GITHUB_STEP_SUMMARY"] !== undefined) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], lines.join("\n") + "\n");
  if (failed.length > 0) process.exitCode = 1;
}
