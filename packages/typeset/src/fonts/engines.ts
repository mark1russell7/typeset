/**
 * The rules of one text engine for the widths of a font. The fields `deltas` and `metrics` are options of `readFont`, and
 * the fields `rounding` and `sum` are options of `measureWidth`. Thus a caller spreads the same row into the two calls.
 */
export interface EngineRules {
  /** The rounding of the `HVAR` and `gvar` deltas of an instance. */
  readonly deltas: "round" | "exact";
  /** The advance of a composite glyph: its own advance, or the advance of its component with the flag USE_MY_METRICS. */
  readonly metrics: "own" | "component";
  /** The rounding of each advance: `pixel` rounds it to whole px, and `exact` keeps the fraction. */
  readonly rounding: "exact" | "pixel";
  /**
   * The sum of the advances: `exact`, or `float32` as Blink adds the widths of the words of a canvas in single precision.
   * A sum of whole px is exact in single precision, so the rounding `pixel` needs no `float32` sum.
   */
  readonly sum: "exact" | "float32";
}

/**
 * The rules of the text engines of Chromium, one row for each engine. The fonts runs of typeset#27 measured each row
 * against the canvas, and the T1d diagnosis of the sum measured the field `sum`. A new engine is a new row.
 */
export const engines: { readonly freetype: EngineRules; readonly coretext: EngineRules; readonly directwrite: EngineRules } = {
  /** FreeType, as Chromium on Linux uses it: rounded deltas, and each advance in whole px. */
  freetype: { deltas: "round", metrics: "own", rounding: "pixel", sum: "exact" },
  /** CoreText on macOS: it keeps the fraction of the deltas. */
  coretext: { deltas: "exact", metrics: "own", rounding: "exact", sum: "float32" },
  /** DirectWrite on Windows: a composite glyph has the advance of its USE_MY_METRICS component. */
  directwrite: { deltas: "round", metrics: "component", rounding: "exact", sum: "float32" },
};

/** The name of a text engine of the table `engines`. */
export type EngineName = keyof typeof engines;

/** This function tells if a text is the name of an engine of the table `engines`. */
export function isEngineName(name: string): name is EngineName {
  return Object.hasOwn(engines, name);
}
