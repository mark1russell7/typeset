/**
 * The command `node src/score.ts <folder> [--out outcomes.json]`. It reads the file `font-widths.json` of each arm in the
 * folder. It gives the outcomes of the predictions `typeset-t1b-instancing-platforms` and `typeset-t1c-width-causes`.
 * Each platform has its own bounds. An arm with no file makes its outcomes fail.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { ScriptId } from "@typeset/corpus";
import type { Cell, Fractions, InstanceProbe } from "./compare.ts";
import type { FeatureGroup, FeatureSummary } from "./features.ts";

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
    const values = ["400", "700"].map((weight) => [weight, file?.extraSummary[weight]?.line?.worstPx ?? Number.NaN] as const);
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
function featureBound(files: ReadonlyMap<string, ArmFile>, arms: readonly string[], groups: readonly FeatureGroup[], key: "domAgainstCanvas" | "noLigatures" | "noKerning", limit: number): { holds: boolean; detail: string } {
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

function main(): void {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string", default: "outcomes.json" } } });
  const folder = positionals[0];
  if (folder === undefined) throw new Error("give the folder of the arm files");
  const files = readArms(folder);
  const predictions = { "typeset-t1b-instancing-platforms": score(files), "typeset-t1c-width-causes": scoreCauses(files) };
  writeFileSync(values.out, JSON.stringify({ schema: "typeset-font-outcomes/2", arms: [...files.keys()].sort(), predictions }, null, 2) + "\n");
  const lines = [`Arms: ${[...files.keys()].sort().join(", ")}.`];
  for (const [id, outcomes] of Object.entries(predictions)) {
    lines.push(``, `## Outcomes of ${id}`, ``, `| outcome | holds | values |`, `|---|---|---|`, ...outcomes.map((o) => `| ${o.outcome} | ${o.holds} | ${o.detail} |`));
  }
  console.log(lines.join("\n"));
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined) appendFileSync(stepSummary, `${lines.join("\n")}\n`);
}

if (import.meta.main) main();
