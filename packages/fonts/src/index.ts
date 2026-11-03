export { readFont, measureWidth, glyphAdvances, shapingWords, type AdvanceSource, type Font, type ReadOptions, type MeasureOptions } from "./font.ts";
export { engines, isEngineName, type EngineName, type EngineRules } from "./engines.ts";
export { readTables, type Decompress, type TableMap } from "./sfnt.ts";
export type { PairLookup, PairValue } from "./kerning.ts";
export { defaultFeatures, type GlyphFilter, type SubstitutionLookup } from "./substitution.ts";
export type { Axis, Instance } from "./variations.ts";
