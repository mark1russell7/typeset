import { fnv1a32 } from "@mark1russell7/rigor-generators";
import type { Reader } from "./binary.ts";
import { readGposKerning, readKernTable, IGNORE_BASE, IGNORE_LIGATURES, IGNORE_MARKS, type PairLookup } from "./kerning.ts";
import { readTables, type Decompress, type TableMap } from "./sfnt.ts";
import { defaultFeatures, readGlyphFilter, readSubstitutions, type GlyphFilter, type SubstitutionLookup } from "./substitution.ts";
import { readAdvances, readCharacterMap, readGlyphClasses, readHeader } from "./tables.ts";
import { gvarAdvanceDeltas, readPointCounts, readTransformedPointCounts } from "./gvar.ts";
import { instanceAdvances, normalize, readAxes, readVariationStore, type Axis, type Instance } from "./variations.ts";

/** The options of `readFont`. */
export interface ReadOptions {
  /** The Brotli decompress function. A WOFF2 file needs it. */
  readonly decompress?: Decompress;
  /**
   * The instance of a variable font, in the user units of its axes, for example `{ wght: 400 }`. An absent axis has its
   * default value. A browser uses the CSS weight, so a page with the weight `normal` needs `{ wght: 400 }`.
   */
  readonly instance?: Instance;
  /**
   * The rounding of the `HVAR` deltas. `round` (the default) rounds each delta to whole font units, as FreeType does.
   * `exact` keeps the fraction. The epoch tells the two modes apart.
   */
  readonly deltas?: "round" | "exact";
  /**
   * The source of the advances of an instance. `auto` (the default) uses `HVAR` when the font has it, else the phantom
   * points of `gvar`. `gvar` uses the phantom points also when the font has `HVAR`. The epoch tells the two modes apart.
   */
  readonly advances?: "auto" | "gvar";
}

/** The source of the advances of an instance: the default advances of `hmtx`, the deltas of `HVAR`, or the phantom points of `gvar`. */
export type AdvanceSource = "hmtx" | "HVAR" | "gvar";

/** The measured tables of one font file. */
export interface Font {
  /**
   * The font epoch: the revision of `head` and an FNV-1a hash of the data that gives the widths. A cache of widths can use
   * it as a key. The TrueType file and the WOFF2 file of one font give the same epoch.
   */
  readonly epoch: string;
  readonly unitsPerEm: number;
  /** The axes of `fvar`. A font that is not variable has no axes. */
  readonly axes: readonly Axis[];
  /** The instance of the font: the value of each axis in user units, after the clamp to the range of the axis. */
  readonly instance: Instance;
  /** The normalized coordinates of the instance, one for each axis, after `avar`. */
  readonly coordinates: readonly number[];
  /** The source of the advances of this instance. The default instance and a font that is not variable use `hmtx`. */
  readonly advanceSource: AdvanceSource;
  readonly numGlyphs: number;
  /** This function gives the glyph of a code point, or 0 when the font has no glyph for it. */
  glyph(codePoint: number): number;
  /** This function gives the advance of a glyph in font units, as the shaper uses it. A mark has the advance 0. */
  advance(glyph: number): number;
  /** This function gives the GDEF class of a glyph: 1 base, 2 ligature, 3 mark, 4 component, 0 none. */
  glyphClass(glyph: number): number;
  /** This function gives the pair lookups of the kerning for an OpenType script tag, for example `latn`. */
  kerning(script: string): readonly PairLookup[];
  /** This function gives the GSUB lookups of a list of feature tags for an OpenType script tag, in the order of the lookup list. */
  substitutions(script: string, features: readonly string[]): readonly SubstitutionLookup[];
  /** This function gives the same font at another instance. It uses the tables that are already read. */
  at(instance: Instance): Font;
}

/** This function reads a TrueType, OpenType or WOFF2 file. */
export function readFont(bytes: Uint8Array, options: ReadOptions = {}): Font {
  const tables = readTables(bytes, options.decompress);
  const need = (tag: string) => {
    const table = tables.get(tag);
    if (table === undefined) throw new Error(`the font has no ${tag} table`);
    return table;
  };
  const header = readHeader(need("head"), need("hhea"), need("maxp"));
  const parsed: Parsed = {
    tables,
    header,
    advances: readAdvances(need("hmtx"), header),
    characters: readCharacterMap(need("cmap")),
    glyphClass: readGlyphClasses(tables.get("GDEF")),
    filter: readGlyphFilter(tables.get("GDEF"), readGlyphClasses(tables.get("GDEF"))),
    axes: tables.has("fvar") ? readAxes(tables.get("fvar")!) : [],
    pointCounts: lazy(() => pointCountsOf(tables, need("head"), header.numGlyphs)),
  };
  return build(parsed, options.instance ?? {}, { deltas: options.deltas ?? "round", advances: options.advances ?? "auto" });
}

/** This function gives a function that computes a value at its first call and then keeps it. */
function lazy<T>(compute: () => T): () => T {
  let done = false;
  let value: T | undefined;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value as T;
  };
}

/**
 * This function gives the count of points of each glyph, or `undefined` when the font has no `glyf` table. A WOFF2 file
 * keeps `glyf` in its transformed form, and its `loca` table is then empty.
 */
function pointCountsOf(tables: TableMap, head: Reader, numGlyphs: number): Uint32Array | undefined {
  const glyf = tables.get("glyf");
  const loca = tables.get("loca");
  if (glyf === undefined || loca === undefined) return undefined;
  return loca.length === 0 ? readTransformedPointCounts(glyf, numGlyphs) : readPointCounts(glyf, loca, head.i16(50), numGlyphs);
}

/** The modes of `readFont` that stay the same for each instance of a font. */
interface Modes {
  readonly deltas: "round" | "exact";
  readonly advances: "auto" | "gvar";
}

/** The tables of a font that do not change with the instance. */
interface Parsed {
  readonly tables: TableMap;
  readonly header: ReturnType<typeof readHeader>;
  readonly advances: Uint16Array;
  readonly characters: Map<number, number>;
  readonly glyphClass: (glyph: number) => number;
  readonly filter: GlyphFilter;
  readonly axes: readonly Axis[];
  /** The count of points of each glyph, for the phantom points of `gvar`. */
  readonly pointCounts: () => Uint32Array | undefined;
}

/** This function gives the font at one instance. */
function build(parsed: Parsed, requested: Instance, modes: Modes): Font {
  const { tables, header, characters, glyphClass, axes } = parsed;
  const { deltas } = modes;
  const instance = Object.fromEntries(axes.map((axis) => [axis.tag, Math.min(axis.max, Math.max(axis.min, requested[axis.tag] ?? axis.default))]));
  const coordinates = normalize(axes, tables.get("avar"), instance);
  const variable = coordinates.some((value) => value !== 0);
  const hvar = tables.get("HVAR");
  const gvar = tables.get("gvar");
  const phantoms = gvar !== undefined && (modes.advances === "gvar" || hvar === undefined) && parsed.pointCounts() !== undefined;
  const advanceSource: AdvanceSource = !variable ? "hmtx" : phantoms ? "gvar" : hvar !== undefined ? "HVAR" : "hmtx";
  const advances = advanceSource === "gvar" ? phantomAdvances(parsed.advances, gvarAdvanceDeltas(gvar!, parsed.pointCounts()!, coordinates, deltas)) : instanceAdvances(parsed.advances, advanceSource === "HVAR" ? hvar : undefined, coordinates, deltas);
  const gdef = tables.get("GDEF");
  // The ItemVariationStore of GDEF 1.3 gives the deltas of the GPOS values
  const storeOffset = variable && gdef !== undefined && gdef.u16(2) >= 3 ? gdef.u32(14) : 0;
  const store = storeOffset === 0 ? undefined : readVariationStore(gdef!.part(storeOffset), coordinates);
  const gpos = tables.get("GPOS");
  const kern = tables.get("kern");
  const gsub = tables.get("GSUB");
  const lookups = new Map<string, readonly PairLookup[]>();
  const substitutions = new Map<string, readonly SubstitutionLookup[]>();
  const hashed = [tables.get("cmap"), gdef, gpos, kern, tables.get("fvar"), tables.get("avar"), tables.get("HVAR"), gsub];
  return {
    epoch: `${header.revision.toString(16).padStart(8, "0")}-${widthHash(header.unitsPerEm, coordinates, advances, hashed)}${deltas === "exact" ? "-exact" : ""}${advanceSource === "gvar" && hvar !== undefined ? "-gvar" : ""}`,
    unitsPerEm: header.unitsPerEm,
    numGlyphs: header.numGlyphs,
    axes,
    instance,
    coordinates,
    advanceSource,
    glyph: (codePoint) => characters.get(codePoint) ?? 0,
    advance: (glyph) => (glyphClass(glyph) === 3 ? 0 : advances[glyph] ?? 0),
    glyphClass,
    kerning(script) {
      let found = lookups.get(script);
      if (found === undefined) {
        // HarfBuzz uses the kern table only when the font has no GPOS table
        found = gpos !== undefined ? readGposKerning(gpos, script, store) : kern !== undefined ? readKernTable(kern) : [];
        lookups.set(script, found);
      }
      return found;
    },
    substitutions(script, features) {
      const key = `${script} ${features.join(",")}`;
      let found = substitutions.get(key);
      if (found === undefined) {
        found = gsub === undefined ? [] : readSubstitutions(gsub, script, features, parsed.filter);
        substitutions.set(key, found);
      }
      return found;
    },
    at: (next) => build(parsed, next, modes),
  };
}

/** This function adds the advance delta of each glyph to its default advance. A negative sum becomes 0. */
function phantomAdvances(advances: Uint16Array, deltas: Float64Array): Float64Array {
  return Float64Array.from(advances, (advance, glyph) => Math.max(0, advance + (deltas[glyph] ?? 0)));
}

/**
 * This function gives 8 hexadecimal digits of FNV-1a. The hash covers the units per em, the coordinates of the instance,
 * the advances and the tables that change a width.
 */
function widthHash(unitsPerEm: number, coordinates: readonly number[], advances: Float64Array, tables: readonly (Reader | undefined)[]): string {
  const parts: string[] = [String(unitsPerEm), coordinates.join(",")];
  const units = Uint16Array.from(advances, (value) => value & 0xffff);
  for (let i = 0; i < units.length; i += 4096) parts.push(String.fromCharCode(...units.subarray(i, i + 4096)));
  for (const table of tables) {
    parts.push(table === undefined ? "-" : "+");
    if (table === undefined) continue;
    for (let i = 0; i < table.length; i += 8192) parts.push(String.fromCharCode(...table.bytes.subarray(i, i + 8192)));
  }
  return fnv1a32(parts.join("")).toString(16).padStart(8, "0");
}

/** The options of `measureWidth`. */
export interface MeasureOptions {
  /** The OpenType script tag of the text, for example `latn` or `cyrl`. The default is `DFLT`. */
  readonly script?: string;
  /**
   * The rounding of the width. `exact` (the default) adds the advances with no rounding. `pixel` rounds each advance to
   * 1/64 px and then to a whole px, and each kerning value to a whole px. Chromium on Linux does this at the device scale 1.
   */
  readonly rounding?: "exact" | "pixel";
  /** The pair kerning. When it is `false`, the width is the sum of the advances only. The default is `true`. */
  readonly kerning?: boolean;
  /**
   * The GSUB features to apply before the kerning. The default is `defaultFeatures`: the features that a browser applies
   * when the page does not change them. An empty list applies no substitution.
   */
  readonly features?: readonly string[];
}

/** This function tells if a lookup with the flags `flags` skips a glyph of the GDEF class `glyphClass`. */
function skips(flags: number, glyphClass: number): boolean {
  return ((flags & IGNORE_MARKS) !== 0 && glyphClass === 3) || ((flags & IGNORE_BASE) !== 0 && glyphClass === 1) || ((flags & IGNORE_LIGATURES) !== 0 && glyphClass === 2);
}

/**
 * This function divides a text into the words that the GSUB pass shapes one at a time. Each space and each tab is a word
 * alone. Blink shapes the text of a canvas in the same words, so no GSUB context goes across a space.
 */
export function shapingWords(text: string): string[] {
  const words: string[] = [];
  let word = "";
  for (const character of text) {
    if (character !== " " && character !== "	") {
      word += character;
      continue;
    }
    if (word !== "") words.push(word);
    words.push(character);
    word = "";
  }
  if (word !== "") words.push(word);
  return words;
}

/**
 * This function gives the glyphs of a text and their advances in font units. It applies the GSUB substitutions of the
 * features to each word of `shapingWords`, and then the pair kerning to all the text.
 */
export function glyphAdvances(font: Font, text: string, options: MeasureOptions = {}): { glyphs: number[]; advances: number[] } {
  const lookups = font.substitutions(options.script ?? "DFLT", options.features ?? defaultFeatures);
  const glyphs: number[] = [];
  for (const word of shapingWords(text)) {
    const wordGlyphs: number[] = [];
    for (const character of word) wordGlyphs.push(font.glyph(character.codePointAt(0)!));
    for (const lookup of lookups) lookup.apply(wordGlyphs);
    glyphs.push(...wordGlyphs);
  }
  const advances = glyphs.map((glyph) => font.advance(glyph));
  for (const lookup of options.kerning === false ? [] : font.kerning(options.script ?? "DFLT")) {
    const next = (from: number): number => {
      for (let j = from; j < glyphs.length; j++) if (!skips(lookup.flags, font.glyphClass(glyphs[j]!))) return j;
      return -1;
    };
    let i = next(0);
    while (i >= 0) {
      const j = next(i + 1);
      if (j < 0) break;
      const value = lookup.pair(glyphs[i]!, glyphs[j]!);
      if (value === undefined) {
        i = j;
        continue;
      }
      advances[i]! += value.first;
      advances[j]! += value.second;
      i = value.skipSecond ? next(j + 1) : j;
    }
  }
  return { glyphs, advances };
}

/**
 * This function gives the width of a text in px at the size `size` in px. The width is the sum of the advances after the
 * GSUB substitutions and the pair kerning.
 */
export function measureWidth(font: Font, text: string, size: number, options: MeasureOptions = {}): number {
  const { glyphs, advances } = glyphAdvances(font, text, options);
  if (options.rounding === "pixel") {
    const scale = size / font.unitsPerEm;
    let px = 0;
    glyphs.forEach((glyph, i) => {
      const base = font.advance(glyph);
      // FreeType gives the advance in 26.6 fixed point, and Skia rounds it to whole px
      px += Math.round(Math.round(base * scale * 64) / 64) + Math.round((advances[i]! - base) * scale);
    });
    return px;
  }
  let units = 0;
  for (const advance of advances) units += advance;
  return (units * size) / font.unitsPerEm;
}
