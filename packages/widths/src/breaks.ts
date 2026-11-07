/**
 * The line breaks of the font stacks against Chromium (T11b). A DOM box with the CSS list of a stack lays out each text.
 * The lines of the box are compared with the lines of the model.
 */
import type { Font } from "@mark1russell7/typeset/fonts";
import { missingRuns, setOf, type StackSet, type StackText } from "./stacks.ts";

/** The sizes of the break comparison, in px. */
export const breakSizes: readonly number[] = [10, 16, 48];

/** The widths of the DOM box, as factors of the size. A box of 8 times the size holds approximately 2 to 4 words. */
export const breakWidths: readonly number[] = [8, 20];

/** The line height of the DOM box and of the model, as a factor of the size. */
export const lineFactor = 1.25;

/**
 * One grapheme cluster of a DOM box, with the vertical middle of its first client rectangle. A cluster with no rectangle
 * has the middle NaN.
 */
export interface DomCluster {
  readonly text: string;
  readonly middle: number;
}

/**
 * This function gives the lines of a DOM box from its clusters. A cluster starts a line when its middle is more than half a
 * line height below the middle of the first cluster of the line. The fonts of a line have different ascents, so a smaller
 * step stays on the line. A cluster with no rectangle stays on the line before it. Each line is trimmed.
 */
export function linesOf(clusters: readonly DomCluster[], lineHeight: number): string[] {
  const lines: string[] = [];
  let line = "";
  let middle = Number.NaN;
  for (const cluster of clusters) {
    if (!Number.isNaN(cluster.middle) && !Number.isNaN(middle) && cluster.middle > middle + lineHeight / 2) {
      lines.push(line);
      line = "";
      middle = Number.NaN;
    }
    if (Number.isNaN(middle)) middle = cluster.middle;
    line += cluster.text;
  }
  lines.push(line);
  return lines.map((value) => value.trim()).filter((value) => value !== "");
}

/** This function tells if two layouts have the same lines, with the spaces at the two ends of each line not counted. */
export function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line.trim() === b[index]!.trim());
}

/** One text of a stack at one size and one box width, on one arm. */
export interface BreakRecord {
  readonly stack: string;
  readonly set: StackSet;
  readonly sample: string;
  readonly size: number;
  readonly width: number;
  readonly chromium: readonly string[];
  readonly model: readonly string[];
  readonly same: boolean;
  /**
   * The cause of different lines. `opportunity`: Chromium breaks a line at a position that is not white space, as between
   * two ideographs. The model breaks only at white space. `width`: each line of Chromium ends at white space, so the widths differ.
   */
  readonly cause?: "opportunity" | "width";
  /** A `width` record has the first line of the model that differs, with its model width. The box width is `width`. */
  readonly widthLine?: { readonly line: number; readonly model: number };
}

/** This function splits a text into its words at white space. */
const wordsOf = (value: string): string[] => value.split(/\s+/u).filter((word) => word !== "");

/** This function tells if each line of a layout ends at white space of the text. Then the lines hold whole words. */
export function breaksAtSpaces(text: string, lines: readonly string[]): boolean {
  const words = wordsOf(text);
  return lines.flatMap(wordsOf).length === words.length && lines.flatMap(wordsOf).every((word, index) => word === words[index]);
}

/** This function gives the record of one case. */
export function breakRecord(stack: string, text: StackText, size: number, width: number, chromium: readonly string[], model: readonly string[]): BreakRecord {
  const same = sameLines(chromium, model);
  const record = { stack, set: setOf(text.kind), sample: text.id, size, width, chromium: [...chromium], model: model.map((line) => line.trim()), same };
  return same ? record : { ...record, cause: breaksAtSpaces(text.text, chromium) ? "width" : "opportunity" };
}

/** This function adds the first different line of the model to a `width` record, with the width that `measure` gives it. */
export function withWidthLine(record: BreakRecord, measure: (line: string) => number): BreakRecord {
  if (record.cause !== "width") return record;
  const line = record.model.findIndex((value, index) => value !== record.chromium[index]?.trim());
  return line < 0 ? record : { ...record, widthLine: { line, model: measure(record.model[line]!) } };
}

/** The break records of one stack and one set, over the sizes and widths. */
export interface BreakCell {
  readonly stack: string;
  readonly set: StackSet;
  readonly n: number;
  readonly same: number;
  /** The count of records with different lines for each cause. */
  readonly opportunity: number;
  readonly width: number;
  /** The first record with different lines, in the order of the records. */
  readonly firstDifferent?: string;
}

/** This function gives one cell for each stack and set, in the order of the records. */
export function breakCells(records: readonly BreakRecord[]): BreakCell[] {
  const cells = new Map<string, { stack: string; set: StackSet; n: number; same: number; opportunity: number; width: number; firstDifferent?: string }>();
  for (const record of records) {
    const key = `${record.stack}|${record.set}`;
    const cell = cells.get(key) ?? { stack: record.stack, set: record.set, n: 0, same: 0, opportunity: 0, width: 0 };
    cells.set(key, cell);
    cell.n++;
    if (record.same) cell.same++;
    if (record.cause !== undefined) cell[record.cause]++;
    if (!record.same) cell.firstDifferent ??= `${record.sample} ${record.size}px ${record.width}px`;
  }
  return [...cells.values()];
}

/** This function gives the key of a canvas width of a text in a CSS font. */
export function widthKey(font: string, text: string): string {
  return `${font}\u0000${text}`;
}

/**
 * This function gives the model with the canvas width of each missing run. Chromium draws a missing run with a font of the
 * system, and the CSS list does not name it. So the model takes the canvas width of the run, after the cluster before it.
 * A text that this function needs and `canvas` does not have goes into `needed`, and the function gives the model width.
 */
export function withRunWidths(advance: (text: string, font: string) => number, fonts: readonly Font[], canvas: ReadonlyMap<string, number>, needed: Set<string>): (text: string, font: string) => number {
  const width = (text: string, font: string): number | undefined => {
    if (text === "") return 0;
    const found = canvas.get(widthKey(font, text));
    if (found === undefined) needed.add(widthKey(font, text));
    return found;
  };
  return (text, font) => {
    let total = advance(text, font);
    for (const { before, run } of missingRuns(fonts, text)) {
      const after = width(before + run, font);
      const alone = width(before, font);
      if (after === undefined || alone === undefined) continue;
      const model = advance(before + run, font) - (before === "" ? 0 : advance(before, font));
      total += after - alone - model;
    }
    return total;
  };
}

