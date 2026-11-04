/**
 * The subpath `./fonts`: the font model of typeset. It reads the tables of a TrueType, OpenType or WOFF2 file. It gives
 * the width of a text as the text engine of a browser gives it. The host gives the bytes of the font files.
 */
export { measureWidth, readFont, type Font, type MeasureOptions, type ReadOptions } from "./fonts/font.ts";
export { widthBound, type WidthBound } from "./fonts/bound.ts";
export { engines, isEngineName, type EngineName, type EngineRules } from "./fonts/engines.ts";
export type { Decompress } from "./fonts/sfnt.ts";
export type { Axis, Instance } from "./fonts/variations.ts";
