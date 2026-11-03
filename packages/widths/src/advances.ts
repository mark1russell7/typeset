import { measureWidth, type Font } from "@mark1russell7/typeset/fonts";

/** The four models of the advances of an instance: the deltas of `HVAR` or the phantom points of `gvar`, rounded or exact. */
export const advanceModelNames = ["hvarRound", "hvarExact", "gvarRound", "gvarExact", "componentRound"] as const;

/** The name of a model of the advances. */
export type AdvanceModelName = (typeof advanceModelNames)[number];

/** The error of one model against the canvas widths of single characters, in font units. */
export interface ModelError {
  /** The largest absolute error. */
  readonly worst: number;
  /** The mean of the signed errors. A bias of the model shows here. */
  readonly mean: number;
  /** The share of the characters with an absolute error of at most 0.02 units. */
  readonly exactShare: number;
}

/** The diagnostic of the advances of one font at one weight. */
export interface AdvanceModelRow {
  readonly font: string;
  readonly weight: number;
  readonly unitsPerEm: number;
  /** It is `true` when the weight is the default instance of the font. Then each model gives the advances of `hmtx`. */
  readonly defaultInstance: boolean;
  /** The tables of the font that give the advances of an instance. */
  readonly tables: { readonly HVAR: boolean; readonly gvar: boolean };
  /** The canvas size of the characters, in px. */
  readonly size: number;
  readonly characters: number;
  /** The largest difference of the exact `gvar` and the exact `HVAR` advances over the characters, in font units. It is `null` when the font has not both tables. */
  readonly gvarAgainstHvar: number | null;
  /** The error of each model of the font against the canvas, in font units. A model needs its table. */
  readonly canvas: Partial<Record<AdvanceModelName, ModelError>>;
  /** The model with the smallest largest error. */
  readonly best?: AdvanceModelName;
  /** The five characters with the largest error of a model, with the canvas width and the model widths in font units. */
  readonly worst: readonly { readonly character: string; readonly canvas: number; readonly models: Partial<Record<AdvanceModelName, number>> }[];
}

/**
 * This function gives the diagnostic of the advances of one font at one weight. The models are the font at the instance,
 * one for each table that the font has. `canvas` has the canvas width in px of each character at the size `size`.
 */
export function advanceModelRow(
  font: string,
  weight: number,
  tables: { readonly HVAR: boolean; readonly gvar: boolean },
  models: Partial<Record<AdvanceModelName, Font>>,
  characters: readonly string[],
  canvas: readonly number[],
  size: number,
): AdvanceModelRow {
  const present = advanceModelNames.filter((name) => models[name] !== undefined);
  const unitsPerEm = models[present[0]!]?.unitsPerEm ?? 1000;
  // The width of a single character in font units: the width at a size of one em in px
  const units = (name: AdvanceModelName, character: string) => measureWidth(models[name]!, character, models[name]!.unitsPerEm);
  const canvasUnits = canvas.map((width) => (width * unitsPerEm) / size);
  const errors = new Map(present.map((name) => [name, characters.map((character, i) => units(name, character) - canvasUnits[i]!)] as const));
  const result: Partial<Record<AdvanceModelName, ModelError>> = {};
  for (const [name, list] of errors) {
    if (list.length === 0) continue;
    result[name] = {
      worst: Math.max(...list.map(Math.abs)),
      mean: list.reduce((sum, value) => sum + value, 0) / list.length,
      exactShare: list.filter((value) => Math.abs(value) <= 0.02).length / list.length,
    };
  }
  const both = models.hvarExact !== undefined && models.gvarExact !== undefined;
  const gvarAgainstHvar = both && characters.length > 0 ? Math.max(...characters.map((character) => Math.abs(units("gvarExact", character) - units("hvarExact", character)))) : null;
  const best = present.filter((name) => result[name] !== undefined).sort((a, b) => result[a]!.worst - result[b]!.worst)[0];
  const spread = characters.map((_, i) => Math.max(0, ...present.map((name) => Math.abs(errors.get(name)![i]!))));
  const order = characters.map((_, i) => i).sort((a, b) => spread[b]! - spread[a]!).slice(0, 5);
  return {
    font,
    weight,
    unitsPerEm,
    defaultInstance: models[present[0]!]?.coordinates.every((value) => value === 0) ?? true,
    tables,
    size,
    characters: characters.length,
    gvarAgainstHvar,
    canvas: result,
    ...(best === undefined ? {} : { best }),
    worst: order.map((i) => ({
      character: characters[i]!,
      canvas: canvasUnits[i]!,
      models: Object.fromEntries(present.map((name) => [name, units(name, characters[i]!)])),
    })),
  };
}

/** This function gives the weights of the diagnostic that the axis `wght` of a font covers. A font with no axis `wght` has only 400. */
export function diagnosticWeights(font: Font, weights: readonly number[]): number[] {
  const axis = font.axes.find((candidate) => candidate.tag === "wght");
  return axis === undefined ? [400] : weights.filter((weight) => weight >= axis.min && weight <= axis.max);
}
