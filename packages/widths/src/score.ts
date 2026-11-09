/**
 * The command `node src/score.ts <folder> [--out outcomes.json]`. It reads the file `font-widths.json` of each arm in the
 * folder. It gives the outcomes of the predictions of T1b, T1c and T1d.
 * Each platform has its own bounds. An arm with no file makes its outcomes fail.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gateLine, writeGateLine, type GateLine } from "@mark1russell7/rigor-bench";
import type { ScriptId } from "@typeset/corpus";
import type { AdvanceModelRow } from "./advances.ts";
import type { Cell, Fractions, InstanceProbe } from "./compare.ts";
import type { FeatureGroup, FeatureSummary } from "./features.ts";
import { sequenceEntries } from "./sequences.ts";

/** The part of an arm file that the score uses. */
export interface ArmFile {
  readonly arm: string;
  readonly instances: readonly InstanceProbe[];
  readonly fractions: { readonly line: Fractions };
  readonly woff2Mismatches: number | null;
  readonly summary: Partial<Record<ScriptId, { readonly line?: Cell }>>;
  readonly extraSummary: Record<string, { readonly line?: Cell }>;
  /** The DOM diagnostic of T1c. An arm file of T1b has no such field. */
  readonly features?: { readonly summary: Partial<Record<FeatureGroup, FeatureSummary>> };
  readonly exactDeltaErrors?: Partial<Record<ScriptId, number>>;
  /** The diagnostic of the advances of T1c. An older arm file has no such field. */
  readonly advanceModels?: readonly AdvanceModelRow[];
  /** The errors of the model of the engine of the arm. An older arm file has no such fields. */
  readonly engineSummary?: Partial<Record<ScriptId, { readonly line?: Cell; readonly paragraph?: Cell; readonly page?: Cell }>>;
  readonly engineExtraSummary?: Record<string, { readonly line?: Cell }>;
  /** The canvas widths of the sequence list in Chromium, with the model at 96 px. An older arm file has no such field. */
  readonly sequenceProbe?: readonly { readonly id: string; readonly canvas: number; readonly model: number }[];
}

/** The arms that the bounds use: the platforms with no rounding to whole px. */
export const unroundedArms = ["linux-2", "macos-2", "windows-1"] as const;

/** All the arms of the workflow. The arm `linux-1` is the reference of the mode `pixel`, and it has no bound. */
export const allArms: readonly ["linux-1", "linux-2", "macos-2", "windows-1"] = ["linux-1", ...unroundedArms];

/** One outcome of the prediction, with the values that decide it. */
export interface Outcome {
  readonly outcome: string;
  readonly holds: boolean;
  readonly detail: string;
}

function worst(file: ArmFile | undefined, script: ScriptId): number {
  return file?.summary[script]?.line?.worstPx ?? Number.NaN;
}

/** This function tells if each script of a list has a worst line error of at most `limit` on an arm. */
function bound(file: ArmFile | undefined, scripts: readonly ScriptId[], limit: number): { holds: boolean; detail: string } {
  if (file === undefined) return { holds: false, detail: "no file" };
  const values = scripts.map((script) => [script, worst(file, script)] as const);
  return { holds: values.every(([, value]) => value <= limit), detail: values.map(([script, value]) => `${script} ${value.toFixed(3)}`).join(", ") };
}

/** This function tells if a bound holds on each of the unrounded arms. */
function onEach(files: ReadonlyMap<string, ArmFile>, scripts: readonly ScriptId[], limit: number): { holds: boolean; detail: string } {
  const results = unroundedArms.map((arm) => [arm, bound(files.get(arm), scripts, limit)] as const);
  return { holds: results.every(([, result]) => result.holds), detail: results.map(([arm, result]) => `${arm}: ${result.detail}`).join("; ") };
}

/** This function gives the outcomes of the prediction from the files of the arms, by arm name. */
export function score(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  const european: ScriptId[] = ["latin", "greek", "cyrillic", "hebrew"];
  const outcomes: Outcome[] = [];
  const probes = allArms.map((arm) => [arm, files.get(arm)?.instances] as const);
  outcomes.push({
    outcome: "specificInstanceMatch",
    holds: probes.every(([, list]) => list !== undefined && list.length > 0 && list.every((probe) => probe.matches)),
    detail: probes.map(([arm, list]) => `${arm}: ${list === undefined ? "no file" : `${list.filter((probe) => probe.matches).length} of ${list.length}, tied ${list.filter((probe) => probe.tied > 1).map((probe) => probe.font).join(" ") || "none"}${list.some((probe) => !probe.matches) ? ` (not: ${list.filter((probe) => !probe.matches).map((probe) => `${probe.font} ${probe.requested} found ${probe.found}`).join(", ")})` : ""}`}`).join("; "),
  });
  const fractions = files.get("linux-2")?.fractions.line;
  outcomes.push({
    outcome: "specificDpr2Unrounded",
    holds: fractions !== undefined && fractions.n > 0 && fractions.quarter / fractions.n < 0.5,
    detail: fractions === undefined ? "no file" : `${fractions.quarter} of ${fractions.n} line widths on the 1/4 px grid, ${fractions.sixtyFourth} on 1/64`,
  });
  for (const [name, arm] of [["Linux2", "linux-2"], ["Mac", "macos-2"], ["Windows", "windows-1"]] as const) {
    outcomes.push({ outcome: `specificBoundEuropean${name}`, ...bound(files.get(arm), european, 0.5) });
  }
  outcomes.push({ outcome: "specificBoundMarks", ...onEach(files, ["latin-extended"], 1.0) });
  outcomes.push({ outcome: "specificBoundCjk", ...onEach(files, ["han", "kana", "hangul"], 0.1) });
  const extra = unroundedArms.map((arm) => {
    const file = files.get(arm);
    if (file === undefined) return [arm, false, "no file"] as const;
    const values = ["400", "700"].map((weight) => [weight, file.extraSummary[weight]?.line?.worstPx ?? Number.NaN] as const);
    return [arm, values.every(([, value]) => value <= 0.5), values.map(([weight, value]) => `${weight} ${value.toFixed(3)}`).join(", ")] as const;
  });
  outcomes.push({ outcome: "specificVariableExtra", holds: extra.every(([, holds]) => holds), detail: extra.map(([arm, , detail]) => `${arm}: ${detail}`).join("; ") });
  const checked = allArms.map((arm) => [arm, files.get(arm)?.woff2Mismatches] as const).filter(([, value]) => value !== undefined && value !== null);
  outcomes.push({
    outcome: "specificWoff2SameTables",
    holds: checked.length > 0 && checked.every(([, value]) => value === 0),
    detail: checked.length === 0 ? "no arm checked WOFF2" : checked.map(([arm, value]) => `${arm}: ${value}`).join("; "),
  });
  return outcomes;
}

/** The arms of macOS and Windows: the platforms that the T1c claims examine. */
const desktopArms = ["macos-2", "windows-1"] as const;

/** This function tells if a value of the DOM diagnostic is at most `limit` for each group, on each arm of a list. */
function featureBound(files: ReadonlyMap<string, ArmFile>, arms: readonly string[], groups: readonly FeatureGroup[], key: "domAgainstCanvas" | "noLigatures" | "noKerning" | "shapedDefault", limit: number): { holds: boolean; detail: string } {
  const parts: string[] = [];
  let holds = true;
  for (const arm of arms) {
    const summary = files.get(arm)?.features?.summary;
    if (summary === undefined) {
      holds = false;
      parts.push(`${arm}: no features`);
      continue;
    }
    const values = groups.map((group) => [group, summary[group]?.[key] ?? Number.NaN] as const);
    if (!values.every(([, value]) => value <= limit)) holds = false;
    parts.push(`${arm}: ${values.map(([group, value]) => `${group} ${value.toFixed(4)}`).join(", ")}`);
  }
  return { holds, detail: parts.join("; ") };
}

/** This function gives the outcomes of the prediction `typeset-t1c-width-causes` from the files of the arms. */
export function scoreCauses(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  const mac = files.get("macos-2")?.exactDeltaErrors;
  const deltas = (["hangul", "hebrew"] as const).map((script) => [script, mac?.[script] ?? Number.NaN] as const);
  return [
    { outcome: "specificDomMatchesCanvas", ...featureBound(files, desktopArms, ["latin", "kana", "extra-400", "extra-700"], "domAgainstCanvas", 1 / 64 + 0.001) },
    { outcome: "specificLigatureLatin", ...featureBound(files, desktopArms, ["latin"], "noLigatures", 0.5) },
    { outcome: "specificLigatureExtraWindows", ...featureBound(files, ["windows-1"], ["extra-400", "extra-700"], "noLigatures", 0.5) },
    {
      outcome: "specificUnroundedDeltasMac",
      holds: mac !== undefined && deltas.every(([, value]) => value <= 0.1),
      detail: mac === undefined ? "macos-2: no exactDeltaErrors" : `macos-2: ${deltas.map(([script, value]) => `${script} ${value.toFixed(4)}`).join(", ")}`,
    },
    { outcome: "specificKanaKerning", ...featureBound(files, desktopArms, ["kana"], "noKerning", 0.1) },
  ];
}

/** The scripts whose canvas line errors on Windows are at most 0.01 px after T1b. The GSUB pass must not change them. */
const unchangedScripts: readonly ScriptId[] = ["greek", "cyrillic", "latin-extended", "hebrew", "hangul", "han"];

/** This function gives the outcomes of the prediction `typeset-t1c-gsub-ligatures` from the files of the arms. */
export function scoreGsub(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  const windows = files.get("windows-1")?.summary;
  const lines = unchangedScripts.map((script) => [script, windows?.[script]?.line?.worstPx ?? Number.NaN] as const);
  return [
    { outcome: "specificLatinGsub", ...featureBound(files, desktopArms, ["latin"], "shapedDefault", 0.05) },
    { outcome: "specificExtraGsubWindows", ...featureBound(files, ["windows-1"], ["extra-400", "extra-700"], "shapedDefault", 0.05) },
    { outcome: "specificKanaMacDom", ...featureBound(files, ["macos-2"], ["kana"], "shapedDefault", 0.05) },
    {
      outcome: "specificNoRegression",
      holds: windows !== undefined && lines.every(([, value]) => value <= 0.01),
      detail: windows === undefined ? "windows-1: no file" : `windows-1: ${lines.map(([script, value]) => `${script} ${value.toFixed(4)}`).join(", ")}`,
    },
  ];
}

/**
 * This function gives the worst line error of the extra font at each weight on one arm. The outcome holds when each
 * error is at most `limit` px.
 */
function extraBound(files: ReadonlyMap<string, ArmFile>, arm: string, limit: number): { holds: boolean; detail: string } {
  const file = files.get(arm);
  if (file === undefined) return { holds: false, detail: `${arm}: no file` };
  const values = ["400", "700"].map((weight) => [weight, file.extraSummary[weight]?.line?.worstPx ?? Number.NaN] as const);
  return { holds: values.every(([, value]) => value <= limit), detail: `${arm}: ${values.map(([weight, value]) => `${weight} ${value.toFixed(4)}`).join(", ")}` };
}

/** This function gives the worst line error of each script on one arm. The outcome holds when each error is at most `limit` px. */
function scriptBound(files: ReadonlyMap<string, ArmFile>, arm: string, scripts: readonly ScriptId[], limit: number): { holds: boolean; detail: string } {
  const file = files.get(arm);
  if (file === undefined) return { holds: false, detail: `${arm}: no file` };
  const values = scripts.map((script) => [script, worst(file, script)] as const);
  return { holds: values.every(([, value]) => value <= limit), detail: `${arm}: ${values.map(([script, value]) => `${script} ${value.toFixed(4)}`).join(", ")}` };
}

/**
 * This function gives the outcomes of the prediction `typeset-t1c-instance-advances` from the files of the arms. The
 * comparison of `gvar` and `HVAR` uses the fonts with both tables, at the weights that are not the default instance.
 */
export function scoreAdvances(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  const rows = files.get("linux-1")?.advanceModels ?? [];
  const fonts = new Map<string, number>();
  for (const row of rows) {
    if (row.defaultInstance || row.gvarAgainstHvar === null) continue;
    fonts.set(row.font, Math.max(fonts.get(row.font) ?? 0, row.gvarAgainstHvar));
  }
  const matching = [...fonts].filter(([, value]) => value <= 0.5);
  const windows = scriptBound(files, "windows-1", unchangedScripts, 0.01);
  const mac = scriptBound(files, "macos-2", ["latin", "greek", "cyrillic"], 0.01);
  return [
    {
      outcome: "specificGvarMatchesHvar",
      holds: matching.length >= 2,
      detail: rows.length === 0 ? "linux-1: no advanceModels" : `linux-1: ${[...fonts].map(([font, value]) => `${font} ${value.toFixed(4)}`).join(", ")}`,
    },
    { outcome: "specificExtraWindows", ...extraBound(files, "windows-1", 0.05) },
    { outcome: "specificExtraMac", ...extraBound(files, "macos-2", 0.05) },
    { outcome: "specificNoRegression", holds: windows.holds && mac.holds, detail: `${windows.detail}; ${mac.detail}` },
  ];
}

/** The scripts that the prediction `typeset-t1c-engine-rules` bounds on each arm. */
export const engineScripts: readonly ScriptId[] = ["latin", "latin-extended", "greek", "cyrillic", "hebrew", "thai", "han", "hangul"];

/**
 * This function examines the model of the engine on some arms. Each line error of the scripts `scripts` is at most
 * `limit` px. When `extra` is true, the line errors of the extra font at 400 and 700 are also at most `limit` px.
 */
function engineBound(files: ReadonlyMap<string, ArmFile>, arms: readonly string[], limit: number, scripts: readonly ScriptId[] = engineScripts, extra = true): { holds: boolean; detail: string } {
  let holds = true;
  const details = arms.map((arm) => {
    const file = files.get(arm);
    if (file?.engineSummary === undefined || (extra && file.engineExtraSummary === undefined)) {
      holds = false;
      return `${arm}: no engineSummary`;
    }
    const values = [
      ...scripts.map((script) => [script, file.engineSummary![script]?.line?.worstPx ?? Number.NaN] as const),
      ...(extra ? ["400", "700"] : []).map((weight) => [`extra ${weight}`, file.engineExtraSummary![weight]?.line?.worstPx ?? Number.NaN] as const),
    ];
    if (!values.every(([, value]) => value <= limit)) holds = false;
    return `${arm}: ${values.map(([name, value]) => `${name} ${value.toFixed(4)}`).join(", ")}`;
  });
  return { holds, detail: details.join("; ") };
}

/** This function gives the outcomes of the prediction `typeset-t1c-engine-rules` from the files of the arms. */
export function scoreEngines(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  return [
    { outcome: "specificEngineLinux", ...engineBound(files, ["linux-1", "linux-2"], 0.01) },
    { outcome: "specificEngineOthers", ...engineBound(files, ["macos-2", "windows-1"], 0.01) },
  ];
}

/** This function gives the outcomes of the prediction `typeset-t1c-kana-words` from the files of the arms. */
export function scoreKana(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  const arms = ["linux-1", "linux-2", "macos-2", "windows-1"];
  return [
    { outcome: "specificKanaCanvas", ...engineBound(files, arms, 0.01, ["kana"], false) },
    { outcome: "specificKanaDom", ...featureBound(files, ["windows-1"], ["kana"], "shapedDefault", 0.03) },
    { outcome: "specificNoRegression", ...engineBound(files, arms, 0.01) },
  ];
}

/** The scripts that the prediction `typeset-t1d-arabic-joining` bounds on each arm: the scripts of `engineScripts` and kana. */
export const arabicNoRegressionScripts: readonly ScriptId[] = [...engineScripts, "kana"];

/** This function gives the outcomes of the prediction `typeset-t1d-arabic-joining` from the files of the arms. */
export function scoreArabic(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  return [
    { outcome: "specificArabicCanvas", ...engineBound(files, allArms, 0.01, ["arabic"], false) },
    { outcome: "specificNoRegression", ...engineBound(files, allArms, 0.01, arabicNoRegressionScripts) },
  ];
}

/** The scripts that the prediction `typeset-t1d-float-sum` bounds: the scripts with no missing shaper in the model. */
export const floatSumScripts: readonly ScriptId[] = ["latin", "greek", "cyrillic", "arabic", "hebrew", "thai", "han", "kana", "hangul"];

/**
 * This function examines the paragraphs and the pages of the model of the engine on some arms. Each worst error of the
 * scripts `scripts` in the two length classes is at most `limit` px. An arm or a cell that is not there is a miss.
 */
function pageBound(files: ReadonlyMap<string, ArmFile>, arms: readonly string[], limit: number, scripts: readonly ScriptId[]): { holds: boolean; detail: string } {
  let holds = true;
  const details = arms.map((arm) => {
    const summary = files.get(arm)?.engineSummary;
    if (summary === undefined) {
      holds = false;
      return `${arm}: no engineSummary`;
    }
    const values = scripts.map((script) => [script, summary[script]?.paragraph?.worstPx ?? Number.NaN, summary[script]?.page?.worstPx ?? Number.NaN] as const);
    if (!values.every(([, paragraph, page]) => paragraph <= limit && page <= limit)) holds = false;
    return `${arm}: ${values.map(([script, paragraph, page]) => `${script} ${paragraph.toFixed(4)} and ${page.toFixed(4)}`).join(", ")}`;
  });
  return { holds, detail: details.join("; ") };
}

/**
 * This function gives the outcomes of the prediction `typeset-t1d-float-sum` from the files of the arms. The report of the
 * pull request compares the `engineSummary` of `linux-1` and `linux-2` with the run before the change.
 */
export function scoreFloatSum(files: ReadonlyMap<string, ArmFile>): Outcome[] {
  return [
    { outcome: "specificPageExact", ...pageBound(files, desktopArms, 0.01, floatSumScripts) },
    { outcome: "specificNoRegression", ...engineBound(files, allArms, 0.01, floatSumScripts) },
  ];
}

/** This function finds the file `font-widths.json` of each arm: in the folder itself, or in a subfolder for each artifact. */
function readArms(folder: string): Map<string, ArmFile> {
  const files = new Map<string, ArmFile>();
  const paths = [join(folder, "font-widths.json"), ...readdirSync(folder).map((name) => join(folder, name, "font-widths.json"))];
  for (const path of paths) {
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    const file = JSON.parse(readFileSync(path, "utf8")) as ArmFile;
    files.set(file.arm, file);
  }
  return files;
}

/** This function gives the outcomes of each prediction that the arm files score. */
export function scoreAll(files: ReadonlyMap<string, ArmFile>): Readonly<Record<string, readonly Outcome[]>> {
  return { "typeset-t1b-instancing-platforms": score(files), "typeset-t1c-width-causes": scoreCauses(files), "typeset-t1c-gsub-ligatures": scoreGsub(files), "typeset-t1c-instance-advances": scoreAdvances(files), "typeset-t1c-engine-rules": scoreEngines(files), "typeset-t1c-kana-words": scoreKana(files), "typeset-t1d-arabic-joining": scoreArabic(files), "typeset-t1d-float-sum": scoreFloatSum(files) };
}

/**
 * A detail has a no-read when an arm has no file or no field. Then the detail, or the part of an arm in it, starts with
 * "no ". A value that a file does not have shows as `NaN`, and that is also a no-read.
 */
const noRead = /(?:^|[:;] )no |\bNaN\b/u;

/**
 * This function gives one check line for each prediction with a no-read. Each outcome is a case of the line. The reason
 * names the details of the no-reads. A no-read holds `false`, but the job passes, so the warning puts it on the check line.
 */
export function noReadGates(predictions: Readonly<Record<string, readonly Outcome[]>>): GateLine[] {
  return Object.entries(predictions).flatMap(([id, outcomes]) => {
    const reads = outcomes.map((o) => ({ case: o.outcome, outcome: noRead.test(o.detail) ? "no read" : "pass" }));
    const details = outcomes.filter((o) => noRead.test(o.detail)).map((o) => `${o.outcome}: ${o.detail}`);
    const line = gateLine(reads, { title: `Fonts ${id}`, reason: details.join(" | ") });
    return line === undefined ? [] : [line];
  });
}

/** The largest distance in px between the canvas width and the model of a text of the group `bidi` (T13c). */
export const bidiProbeLimit = 0.5;

/**
 * This function gives the gate line of the bidi probe (T13c), or undefined when it passes. On each arm, the canvas width of
 * each text of the sequence group `bidi` is at most 0.5 px from the model. An arm with a missing row is a no-read.
 */
export function bidiProbeGate(files: ReadonlyMap<string, ArmFile>): GateLine | undefined {
  const ids = sequenceEntries.filter((entry) => entry.group === "bidi").map((entry) => entry.id);
  const details: string[] = [];
  const reads = allArms.map((arm) => {
    const rows = new Map((files.get(arm)?.sequenceProbe ?? []).map((row) => [row.id, row] as const));
    const missing = ids.filter((id) => !rows.has(id));
    if (missing.length > 0) {
      details.push(`${arm}: no row for ${missing.length} of ${ids.length} texts`);
      return { case: arm, outcome: "no read" };
    }
    const beyond = ids.map((id) => rows.get(id)!).filter((row) => !(Math.abs(row.canvas - row.model) <= bidiProbeLimit));
    if (beyond.length === 0) return { case: arm, outcome: "pass" };
    details.push(`${arm}: ${beyond.length} of ${ids.length} texts beyond ${bidiProbeLimit} px (${beyond.map((row) => `${row.id} ${(row.canvas - row.model).toFixed(3)}`).join(", ")})`);
    return { case: arm, outcome: "beyond" };
  });
  return gateLine(reads, { title: "Fonts bidi probe", enforced: true, reason: details.join("; ") });
}

function main(): void {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string", default: "outcomes.json" } } });
  const folder = positionals[0];
  if (folder === undefined) throw new Error("give the folder of the arm files");
  const files = readArms(folder);
  const predictions = scoreAll(files);
  writeFileSync(values.out, JSON.stringify({ schema: "typeset-font-outcomes/2", arms: [...files.keys()].sort(), predictions }, null, 2) + "\n");
  const lines = [`Arms: ${[...files.keys()].sort().join(", ")}.`];
  for (const [id, outcomes] of Object.entries(predictions)) {
    lines.push(``, `## Outcomes of ${id}`, ``, `| outcome | holds | values |`, `|---|---|---|`, ...outcomes.map((o) => `| ${o.outcome} | ${o.holds} | ${o.detail} |`));
  }
  console.log(lines.join("\n"));
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined) appendFileSync(stepSummary, `${lines.join("\n")}\n`);
  for (const line of noReadGates(predictions)) writeGateLine(line);
  const bidi = bidiProbeGate(files);
  if (bidi !== undefined) {
    writeGateLine(bidi);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
