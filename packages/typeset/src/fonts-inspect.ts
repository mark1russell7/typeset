/**
 * The subpath `./fonts/inspect`: the parts of the font model that a tool uses to examine a width. They give the glyphs,
 * the shaping words, the segments of a canvas, the default features and the tables of a font file.
 */
export { glyphAdvances, shapingWords } from "./fonts/font.ts";
export { canvasSegments, canvasWords } from "./fonts/words.ts";
export { defaultFeatures } from "./fonts/substitution.ts";
export { readTables } from "./fonts/sfnt.ts";
