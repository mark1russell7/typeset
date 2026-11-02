export { readFont, measureWidth, glyphAdvances, shapingWords, type Font, type ReadOptions, type MeasureOptions } from "./font.ts";
export { readTables, type Decompress, type TableMap } from "./sfnt.ts";
export type { PairLookup, PairValue } from "./kerning.ts";
export { defaultFeatures, type GlyphFilter, type SubstitutionLookup } from "./substitution.ts";
export type { Axis, Instance } from "./variations.ts";
