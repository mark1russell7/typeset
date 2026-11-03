import type { ScriptId } from "@typeset/corpus";
import { defaultFeatures, shapingWords, type Font } from "@mark1russell7/typeset/fonts/model";
import type { WidthRecord } from "./compare.ts";

/**
 * The CSS of each feature setting of the DOM diagnostic. The canvas has no control of the features, so the diagnostic
 * measures DOM spans.
 */
export const featureSettings: { readonly default: string; readonly noLigatures: string; readonly noKerning: string; readonly spaceAll: string } = {
  default: "",
  noLigatures: 'font-feature-settings: "liga" 0, "calt" 0;',
  noKerning: 'font-feature-settings: "liga" 0, "calt" 0; font-kerning: none;',
  spaceAll: 'font-feature-settings: "liga" 0, "calt" 0; font-kerning: none; text-spacing-trim: space-all;',
};

/** The name of a feature setting. */
export type FeatureSetting = keyof typeof featureSettings;

/** The groups of the diagnostic: the Latin lines of the corpus fonts, the kana lines, and the extra font at each weight. */
export type FeatureGroup = "latin" | "kana" | "extra-400" | "extra-700";

/** One line of the diagnostic: its canvas width, its DOM width in each setting, and the model widths. */
export interface FeatureRecord {
  readonly group: FeatureGroup;
  readonly font: string;
  readonly weight: number;
  readonly sample: string;
  readonly size: number;
  readonly canvas: number;
  readonly dom: Readonly<Record<FeatureSetting, number>>;
  /**
   * The model widths. `kerning` has the pair kerning and no GSUB, and `noKerning` has neither. `shaped` is the default
   * model, with the GSUB features `defaultFeatures` and the kerning. A record of T1c before the GSUB pass has no `shaped`.
   */
  readonly model: { readonly kerning: number; readonly noKerning: number; readonly shaped?: number };
}

/** The worst errors of one group, in px. Each error compares a DOM setting with the model that has the same features. */
export interface FeatureSummary {
  readonly n: number;
  /** The DOM width with the default features against the canvas width: the control of the DOM measure. */
  readonly domAgainstCanvas: number;
  /** The DOM width with no ligatures against the exact model. */
  readonly noLigatures: number;
  /** The DOM width with no ligatures and no kerning against the model with no kerning. */
  readonly noKerning: number;
  /** The DOM width of `spaceAll` against the model with no kerning. */
  readonly spaceAll: number;
  /** The default DOM width against the default model with the GSUB pass. It is absent when no record has `shaped`. */
  readonly shapedDefault?: number;
  /** The sample and the size of the worst `noLigatures` error. */
  readonly worstNoLigatures?: { readonly sample: string; readonly size: number; readonly error: number };
}

function worstOf(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : Math.max(...values.map(Math.abs));
}

/** This function gives the summary of each group of the diagnostic. */
export function summarizeFeatures(records: readonly FeatureRecord[]): Partial<Record<FeatureGroup, FeatureSummary>> {
  const result: Partial<Record<FeatureGroup, FeatureSummary>> = {};
  for (const group of new Set(records.map((record) => record.group))) {
    const list = records.filter((record) => record.group === group);
    const ligature = list.map((record) => record.dom.noLigatures - record.model.kerning);
    const index = ligature.reduce((best, value, i) => (Math.abs(value) > Math.abs(ligature[best]!) ? i : best), 0);
    const shaped = list.flatMap((record) => (record.model.shaped === undefined ? [] : [record.dom.default - record.model.shaped]));
    result[group] = {
      n: list.length,
      domAgainstCanvas: worstOf(list.map((record) => record.dom.default - record.canvas)),
      noLigatures: worstOf(ligature),
      noKerning: worstOf(list.map((record) => record.dom.noKerning - record.model.noKerning)),
      spaceAll: worstOf(list.map((record) => record.dom.spaceAll - record.model.noKerning)),
      ...(shaped.length === 0 ? {} : { shapedDefault: worstOf(shaped) }),
      ...(list.length === 0 ? {} : { worstNoLigatures: { sample: list[index]!.sample, size: list[index]!.size, error: ligature[index]! } }),
    };
  }
  return result;
}

/** This function gives the worst line error of each script for the model with the `HVAR` deltas not rounded, on the canvas records. */
export function exactDeltaErrors(records: readonly WidthRecord[]): Partial<Record<ScriptId, number>> {
  const result: Partial<Record<ScriptId, number>> = {};
  for (const record of records) {
    if (record.lengthClass !== "line" || record.missing > 0 || record.exactDeltas === undefined) continue;
    result[record.script] = Math.max(result[record.script] ?? 0, Math.abs(record.exactDeltas - record.canvas));
  }
  return result;
}

/** One row of the breakdown: the line errors of one font, one weight and one script. */
export interface BreakdownRow {
  readonly font: string;
  readonly weight: number;
  readonly script: ScriptId;
  readonly n: number;
  readonly worstPx: number;
  readonly meanPx: number;
  /** The share of the lines with an error of at most 0.01 px. */
  readonly exactShare: number;
  /** The three samples with the largest errors, with the size, the error and the text when it is known. */
  readonly worst: readonly { readonly sample: string; readonly size: number; readonly error: number; readonly text?: string }[];
}

/** This function gives the breakdown of the line errors by font, weight and script. A record with a missing glyph is not in it. */
export function breakdownOf(records: readonly WidthRecord[], texts: ReadonlyMap<string, string> = new Map()): BreakdownRow[] {
  const groups = new Map<string, WidthRecord[]>();
  for (const record of records) {
    if (record.lengthClass !== "line" || record.missing > 0) continue;
    const key = `${record.font}\u0000${record.weight}\u0000${record.script}`;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const errors = list.map((record) => Math.abs(record.error));
    const worst = [...list].sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 3);
    return {
      font: list[0]!.font,
      weight: list[0]!.weight,
      script: list[0]!.script,
      n: list.length,
      worstPx: Math.max(...errors),
      meanPx: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      exactShare: errors.filter((value) => value <= 0.01).length / errors.length,
      worst: worst.map((record) => {
        const text = texts.get(record.sample);
        return { sample: record.sample, size: record.size, error: record.error, ...(text === undefined ? {} : { text }) };
      }),
    };
  });
}

/** One lookup of a trace that changed the glyphs of a text. */
export interface SubstitutionStep {
  readonly lookup: number;
  readonly type: number;
  readonly flags: number;
  readonly features: readonly string[];
  /** The glyph counts before and after the lookup. */
  readonly glyphs: readonly [number, number];
  /** The change of the sum of the advances, in font units. */
  readonly advance: number;
  /** The glyphs of the first change: up to 6 glyphs before and after the lookup, from the first changed position. */
  readonly first: { readonly at: number; readonly before: readonly number[]; readonly after: readonly number[] };
}

/**
 * This function applies the GSUB lookups of a text one at a time, as the model does: each lookup goes to each word of
 * `shapingWords`. It gives each lookup that changes the glyphs.
 */
export function substitutionTrace(font: Font, text: string, script: string, features: readonly string[] = defaultFeatures): SubstitutionStep[] {
  const words = shapingWords(text).map((word) => [...word].map((character) => font.glyph(character.codePointAt(0)!)));
  const sum = (list: readonly number[]) => list.reduce((total, glyph) => total + font.advance(glyph), 0);
  const steps: SubstitutionStep[] = [];
  for (const lookup of font.substitutions(script, features)) {
    const before = words.flat();
    for (const word of words) lookup.apply(word);
    const glyphs = words.flat();
    let at = 0;
    while (at < before.length && at < glyphs.length && before[at] === glyphs[at]) at++;
    if (at === before.length && at === glyphs.length) continue;
    steps.push({
      lookup: lookup.index,
      type: lookup.type,
      flags: lookup.flags,
      features: lookup.features,
      glyphs: [before.length, glyphs.length],
      advance: sum(glyphs) - sum(before),
      first: { at, before: before.slice(at, at + 6), after: glyphs.slice(at, at + 6) },
    });
  }
  return steps;
}
