/**
 * The snapshot of the CI data: the summaries of each arm of one fonts run, with no records. The script
 * `scripts/snapshot.ts` writes it from the artifacts of the run, and the explorer reads it.
 */
import type { LengthClass, ScriptId } from "@typeset/corpus";
import type { Cell, StackCell, StackSet } from "@typeset/widths";
import { formatPx } from "./heat.ts";

/** The cells of one summary, by script and by length class. */
export type Summary = Partial<Record<ScriptId, Partial<Record<LengthClass, Cell>>>>;

/** The cells of the extra font, by CSS weight and by length class. */
export type ExtraSummary = Partial<Record<string, Partial<Record<LengthClass, Cell>>>>;

/** The summaries of one arm of the fonts run. */
export interface ArmSnapshot {
  readonly arm: string;
  /** The device scale of the page. */
  readonly scale: number;
  readonly platform: string;
  readonly chromium: string;
  /** The text engine of the arm and the rules of its model. */
  readonly engine: string;
  readonly rounding: "exact" | "pixel";
  /** The line errors of the model with no rounding. */
  readonly summary: Summary;
  /** The line errors of the model of the engine of the arm. */
  readonly engineSummary: Summary;
  readonly extraSummary: ExtraSummary;
  readonly engineExtraSummary: ExtraSummary;
  /** The errors of each font stack at each size. A run before T11 has no stacks. */
  readonly stacks?: readonly StackCell[];
  /** The groups of the sequence probe: canvas widths against the model at 96 px. A run before T13b has no probe. */
  readonly probe?: readonly ProbeGroup[];
}

/** The summary of one group of the sequence probe on one arm. The probe measures each text at 96 px with the canvas and with the model. */
export interface ProbeGroup {
  readonly group: string;
  /** The count of texts of the group. */
  readonly n: number;
  /** The count of texts with no canvas width or no model width. */
  readonly noRead: number;
  /** The largest distance in px between the canvas width and the model width. */
  readonly worstPx: number;
  /** The identifier of the text with the largest distance. */
  readonly worstId: string;
  /** The count of texts more than 1/64 px from the model. */
  readonly over64: number;
  /** The shaping risks that the model names for the texts more than 1/64 px off, with the count of texts of each risk. */
  readonly risks: Readonly<Record<string, number>>;
  /** The count of texts more than 1/64 px off with one or more named risks. */
  readonly risky: number;
}

/** The run that gives a snapshot. */
export interface RunInfo {
  readonly id: number;
  readonly branch: string;
  readonly sha: string;
  /** The date of the run, as `YYYY-MM-DD`. */
  readonly date: string;
}

/** The snapshot file of the site. */
export interface Snapshot {
  readonly schema: typeof snapshotSchema;
  readonly run: RunInfo;
  readonly corpus: { readonly seed: number; readonly perCell: number; readonly samples: number; readonly fingerprint: string };
  readonly fontsCommit: string;
  readonly arms: readonly ArmSnapshot[];
  /** The font list of each stack, by the identifier of the stack. A run before T11 has no stacks. */
  readonly stackFonts?: Readonly<Record<string, readonly string[]>>;
}

/** The schema name of the snapshot file. */
export const snapshotSchema = "typeset-site-snapshot/1";

/** The order of the arms in the explorer: the two Linux arms, then macOS and Windows. */
export const armOrder: readonly string[] = ["linux-1", "linux-2", "macos-2", "windows-1"];

/** The schema of the file `font-widths.json` that the snapshot reads. */
const widthsSchema = "typeset-font-widths/3";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** This function keeps 4 significant digits of a number, so the snapshot file stays small. NaN becomes `null` in JSON. */
function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(4)) : value;
}

/** This function gives a copy of a cell with fewer digits. */
function roundCell(cell: Cell): Cell {
  const { worst, ...rest } = cell;
  const out: Cell = { ...rest, worstPx: round(cell.worstPx), meanPx: round(cell.meanPx), p90Px: round(cell.p90Px), worstRelative: round(cell.worstRelative), pixelWorstPx: round(cell.pixelWorstPx) };
  return worst === undefined ? out : { ...out, worst: { ...worst, error: round(worst.error) } };
}

/** This function gives a copy of a table of cells, by a key and by length class, with fewer digits. */
function roundCells<K extends string>(table: unknown): Partial<Record<K, Partial<Record<LengthClass, Cell>>>> {
  const out: Partial<Record<K, Partial<Record<LengthClass, Cell>>>> = {};
  if (!isObject(table)) return out;
  for (const [key, cells] of Object.entries(table)) {
    if (!isObject(cells)) continue;
    const row: Partial<Record<LengthClass, Cell>> = {};
    for (const [lengthClass, cell] of Object.entries(cells)) if (isObject(cell)) row[lengthClass as LengthClass] = roundCell(cell as unknown as Cell);
    out[key as K] = row;
  }
  return out;
}

/** This function gives the stack cells of a field `stacks` of a file `font-widths.json`, with fewer digits. */
function stackCellsOf(value: unknown): StackCell[] | undefined {
  if (!isObject(value) || !Array.isArray(value["cells"])) return undefined;
  return value["cells"].filter(isObject).map((c) => {
    // A file of a run before the two sets has only covered cells.
    const set = c["set"] === "uncovered" ? "uncovered" : "covered";
    let cell: StackCell = { stack: String(c["stack"]), set, size: Number(c["size"]), n: Number(c["n"]), excluded: Number(c["excluded"]), worst64: round(Number(c["worst64"])) };
    if (typeof c["worstSample"] === "string") cell = { ...cell, worstSample: c["worstSample"] };
    if (set === "uncovered") cell = { ...cell, missingTexts: Number(c["missingTexts"] ?? 0), words: Number(c["words"] ?? 0), missingWords: Number(c["missingWords"] ?? 0) };
    return cell;
  });
}

/** This function gives the font list of each stack of a field `stacks` of a file `font-widths.json`. */
function stackFontsOf(value: unknown): Record<string, string[]> | undefined {
  if (!isObject(value) || !Array.isArray(value["list"])) return undefined;
  const out: Record<string, string[]> = {};
  for (const stack of value["list"]) if (isObject(stack) && Array.isArray(stack["fonts"])) out[String(stack["id"])] = stack["fonts"].map(String);
  return out;
}

/** This function gives the groups of a field `sequenceProbe` of a file `font-widths.json`, in the order of their first text. */
function probeGroupsOf(value: unknown): ProbeGroup[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const groups = new Map<string, { n: number; noRead: number; worstPx: number; worstId: string; over64: number; risky: number; risks: Record<string, number> }>();
  for (const row of value.filter(isObject)) {
    const id = String(row["id"]);
    const name = id.split("/")[0]!;
    let group = groups.get(name);
    if (group === undefined) {
      group = { n: 0, noRead: 0, worstPx: 0, worstId: "", over64: 0, risky: 0, risks: {} };
      groups.set(name, group);
    }
    group.n++;
    const canvas = row["canvas"];
    const model = row["model"];
    if (typeof canvas !== "number" || typeof model !== "number" || !Number.isFinite(canvas) || !Number.isFinite(model)) {
      group.noRead++;
      continue;
    }
    const distance = Math.abs(canvas - model);
    if (group.worstId === "" || distance > group.worstPx) {
      group.worstPx = distance;
      group.worstId = id;
    }
    if (distance <= 1 / 64) continue;
    group.over64++;
    const risks = Array.isArray(row["risks"]) ? row["risks"].map(String) : [];
    if (risks.length > 0) group.risky++;
    for (const risk of risks) group.risks[risk] = (group.risks[risk] ?? 0) + 1;
  }
  return [...groups].map(([group, g]) => ({ group, n: g.n, noRead: g.noRead, worstPx: round(g.worstPx), worstId: g.worstId, over64: g.over64, risks: g.risks, risky: g.risky }));
}

/**
 * This function makes a snapshot from the parsed files `font-widths.json` of the arms of one run. It keeps only the
 * summaries. It refuses a file with another schema, and two files of one arm.
 */
export function snapshotOf(files: readonly unknown[], run: RunInfo): Snapshot {
  const arms: ArmSnapshot[] = [];
  let corpus: Snapshot["corpus"] | undefined;
  let fontsCommit = "";
  let stackFonts: Record<string, string[]> | undefined;
  for (const file of files) {
    if (!isObject(file) || file["schema"] !== widthsSchema) throw new Error(`a file of the run does not have the schema ${widthsSchema}`);
    const arm = String(file["arm"]);
    if (arms.some((a) => a.arm === arm)) throw new Error(`the run has two files of the arm ${arm}`);
    const models = isObject(file["models"]) ? file["models"] : {};
    const stacks = stackCellsOf(file["stacks"]);
    const probe = probeGroupsOf(file["sequenceProbe"]);
    stackFonts ??= stackFontsOf(file["stacks"]);
    arms.push({
      arm,
      scale: Number(file["scale"]),
      platform: String(file["platform"]),
      chromium: String(file["chromium"]),
      engine: String(models["engine"]),
      rounding: models["rounding"] === "pixel" ? "pixel" : "exact",
      summary: roundCells<ScriptId>(file["summary"]),
      engineSummary: roundCells<ScriptId>(file["engineSummary"]),
      extraSummary: roundCells<string>(file["extraSummary"]),
      engineExtraSummary: roundCells<string>(file["engineExtraSummary"]),
      ...(stacks === undefined ? {} : { stacks }),
      ...(probe === undefined ? {} : { probe }),
    });
    if (isObject(file["corpus"])) {
      const c = file["corpus"];
      corpus = { seed: Number(c["seed"]), perCell: Number(c["perCell"]), samples: Number(c["samples"]), fingerprint: String(c["fingerprint"]) };
    }
    if (isObject(file["fonts"])) fontsCommit = String(file["fonts"]["commit"]);
  }
  if (corpus === undefined) throw new Error("the run has no file with a corpus");
  arms.sort((a, b) => rank(a.arm) - rank(b.arm));
  return { schema: snapshotSchema, run, corpus, fontsCommit, arms, ...(stackFonts === undefined ? {} : { stackFonts }) };
}

/** This function gives the place of an arm in `armOrder`. An unknown arm goes last. */
function rank(arm: string): number {
  const index = armOrder.indexOf(arm);
  return index < 0 ? armOrder.length : index;
}

/** This function examines a parsed snapshot file and gives it with its type. It throws on a file of another schema. */
export function readSnapshot(value: unknown): Snapshot {
  if (!isObject(value) || value["schema"] !== snapshotSchema) throw new Error(`the snapshot does not have the schema ${snapshotSchema}`);
  if (!Array.isArray(value["arms"]) || value["arms"].length === 0) throw new Error("the snapshot has no arms");
  for (const arm of value["arms"]) if (!isObject(arm) || typeof arm["arm"] !== "string" || !isObject(arm["engineSummary"])) throw new Error("an arm of the snapshot has no engine summary");
  return value as unknown as Snapshot;
}

/** The model of the explorer: the model of the engine of each arm, or the model with no rounding. */
export type ModelChoice = "engine" | "plain";

/** The statistic of a cell that the explorer shows. */
export type Statistic = "worstPx" | "meanPx" | "p90Px";

/** One row of the explorer: a script, or the extra font at one weight, with one cell for each arm. */
export interface MatrixRow {
  readonly key: string;
  readonly label: string;
  /** The cell of each arm, in the order of the arms of the snapshot. A missing cell is `undefined`. */
  readonly cells: readonly (Cell | undefined)[];
}

/**
 * This function gives the rows of the explorer: one row for each script, then one row for each weight of the extra font.
 * Each row has the cell of one length class for each arm.
 */
export function armMatrix(snapshot: Snapshot, model: ModelChoice, lengthClass: LengthClass, scriptOrder: readonly ScriptId[], extraLabel: string): MatrixRow[] {
  const summaryOf = (arm: ArmSnapshot): Summary => (model === "engine" ? arm.engineSummary : arm.summary);
  const extraOf = (arm: ArmSnapshot): ExtraSummary => (model === "engine" ? arm.engineExtraSummary : arm.extraSummary);
  const rows: MatrixRow[] = [];
  for (const script of scriptOrder) {
    const cells = snapshot.arms.map((arm) => summaryOf(arm)[script]?.[lengthClass]);
    if (cells.some((cell) => cell !== undefined)) rows.push({ key: script, label: script, cells });
  }
  const weights = new Set<string>();
  for (const arm of snapshot.arms) for (const weight of Object.keys(extraOf(arm))) weights.add(weight);
  for (const weight of [...weights].sort((a, b) => Number(a) - Number(b))) {
    const cells = snapshot.arms.map((arm) => extraOf(arm)[weight]?.[lengthClass]);
    if (cells.some((cell) => cell !== undefined)) rows.push({ key: `extra-${weight}`, label: `${extraLabel} ${weight}`, cells });
  }
  return rows;
}

/** This function gives the value of a statistic of a cell, or NaN when the cell is missing or has no records. */
export function statOf(cell: Cell | undefined, statistic: Statistic): number {
  if (cell === undefined || cell.n === 0) return Number.NaN;
  const value = cell[statistic];
  return typeof value === "number" ? value : Number.NaN;
}

/** This function gives `true` when no cell of a row has a width and some cell left out texts for a missing glyph. */
export function allLeftOut(cells: readonly (Cell | undefined)[]): boolean {
  return cells.every((cell) => cell === undefined || cell.n === 0) && cells.some((cell) => cell !== undefined && cell.excluded > 0);
}

/** The limit of a stack cell, in 1/64 px: the bar of T11. */
export const stackLimit64 = 1.28;

/** One row of the stack table: a font stack and a set of texts. It has the cells of each arm, in the order of the arms. */
export interface StackRow {
  readonly stack: string;
  readonly set: StackSet;
  readonly fonts: readonly string[];
  /** The cells of each size of the stack, for each arm. An arm with no stacks has no cells. */
  readonly cells: readonly (readonly StackCell[])[];
}

/** This function gives one row for each font stack and set of a snapshot, in the order of the first arm that has it. */
export function stackMatrix(snapshot: Snapshot): StackRow[] {
  const order: { stack: string; set: StackSet }[] = [];
  for (const arm of snapshot.arms) for (const cell of arm.stacks ?? []) if (!order.some((row) => row.stack === cell.stack && row.set === cell.set)) order.push({ stack: cell.stack, set: cell.set });
  return order.map(({ stack, set }) => ({ stack, set, fonts: snapshot.stackFonts?.[stack] ?? [], cells: snapshot.arms.map((arm) => (arm.stacks ?? []).filter((cell) => cell.stack === stack && cell.set === set)) }));
}

/** This function gives the worst error of the cells of a stack over all sizes, in px. It gives NaN when no cell has a text. */
export function stackWorstPx(cells: readonly StackCell[]): number {
  const measured = cells.filter((cell) => cell.n > 0);
  return measured.length === 0 ? Number.NaN : Math.max(...measured.map((cell) => cell.worst64)) / 64;
}

/** The largest distance in px of a text of the probe group `bidi` (T13c). It is the same value as `bidiProbeLimit` of `@typeset/widths`. */
export const bidiProbeLimit = 0.5;

/** The limit of each probe group that has a gate, in px. */
export const probeLimits: Readonly<Record<string, number>> = { bidi: bidiProbeLimit };

/** One row of the probe table: a group of the sequence probe, with the summary of each arm in the order of the arms. */
export interface ProbeRow {
  readonly group: string;
  /** The limit of the gate of the group in px, when the group has a gate. */
  readonly limitPx?: number;
  readonly cells: readonly (ProbeGroup | undefined)[];
}

/** This function gives one row for each group of the sequence probe of a snapshot, in the order of the first arm that has it. */
export function probeMatrix(snapshot: Snapshot): ProbeRow[] {
  const order: string[] = [];
  for (const arm of snapshot.arms) for (const group of arm.probe ?? []) if (!order.includes(group.group)) order.push(group.group);
  return order.map((group) => {
    const cells = snapshot.arms.map((arm) => arm.probe?.find((value) => value.group === group));
    const limitPx = probeLimits[group];
    return limitPx === undefined ? { group, cells } : { group, limitPx, cells };
  });
}

/** This function gives the lines of the tip of a probe cell: the worst text, the texts more than 1/64 px off and the gate. */
export function probeLines(title: string, group: ProbeGroup | undefined, limitPx?: number): string[] {
  if (group === undefined) return [title, "This arm has no probe data."];
  const lines = [title, `${group.n} texts at 96 px. The worst text is ${group.worstId}, ${formatPx(group.worstPx)} px from the model.`];
  if (group.noRead > 0) lines.push(`${group.noRead} texts have no width.`);
  lines.push(`${group.over64} of ${group.n} texts are more than 1/64 px from the model.`);
  const risks = Object.entries(group.risks).map(([risk, count]) => `${risk} (${count})`);
  if (group.risky > 0) lines.push(`The model names a shaping risk for ${group.risky} of them: ${risks.join(", ")}.`);
  if (limitPx !== undefined) {
    const holds = group.noRead === 0 && group.worstPx <= limitPx;
    lines.push(`The gate of T13c: each text is at most ${limitPx} px from the model. ${holds ? "The gate holds on this arm." : "The gate fails on this arm."}`);
  }
  return lines;
}
