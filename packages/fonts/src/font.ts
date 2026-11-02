import { fnv1a32 } from "@mark1russell7/rigor-generators";
import type { Reader } from "./binary.ts";
import { readGposKerning, readKernTable, IGNORE_BASE, IGNORE_LIGATURES, IGNORE_MARKS, type PairLookup } from "./kerning.ts";
import { readTables, type Decompress } from "./sfnt.ts";
import { readAdvances, readCharacterMap, readGlyphClasses, readHeader } from "./tables.ts";

/** The options of `readFont`. */
export interface ReadOptions {
  /** The Brotli decompress function. A WOFF2 file needs it. */
  readonly decompress?: Decompress;
}

/** The measured tables of one font file. */
export interface Font {
  /**
   * The font epoch: the revision of `head` and an FNV-1a hash of the data that gives the widths. A cache of widths can use
   * it as a key. The TrueType file and the WOFF2 file of one font give the same epoch.
   */
  readonly epoch: string;
  readonly unitsPerEm: number;
  readonly numGlyphs: number;
  /** This function gives the glyph of a code point, or 0 when the font has no glyph for it. */
  glyph(codePoint: number): number;
  /** This function gives the advance of a glyph in font units, as the shaper uses it. A mark has the advance 0. */
  advance(glyph: number): number;
  /** This function gives the GDEF class of a glyph: 1 base, 2 ligature, 3 mark, 4 component, 0 none. */
  glyphClass(glyph: number): number;
  /** This function gives the pair lookups of the kerning for an OpenType script tag, for example `latn`. */
  kerning(script: string): readonly PairLookup[];
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
  const advances = readAdvances(need("hmtx"), header);
  const characters = readCharacterMap(need("cmap"));
  const glyphClass = readGlyphClasses(tables.get("GDEF"));
  const gpos = tables.get("GPOS");
  const kern = tables.get("kern");
  const lookups = new Map<string, readonly PairLookup[]>();
  return {
    epoch: `${header.revision.toString(16).padStart(8, "0")}-${widthHash(header.unitsPerEm, advances, [tables.get("cmap"), tables.get("GDEF"), gpos, kern])}`,
    unitsPerEm: header.unitsPerEm,
    numGlyphs: header.numGlyphs,
    glyph: (codePoint) => characters.get(codePoint) ?? 0,
    advance: (glyph) => (glyphClass(glyph) === 3 ? 0 : advances[glyph] ?? 0),
    glyphClass,
    kerning(script) {
      let found = lookups.get(script);
      if (found === undefined) {
        // HarfBuzz uses the kern table only when the font has no GPOS table
        found = gpos !== undefined ? readGposKerning(gpos, script) : kern !== undefined ? readKernTable(kern) : [];
        lookups.set(script, found);
      }
      return found;
    },
  };
}

/** This function gives 8 hexadecimal digits of FNV-1a over the units per em, the advances and the tables that change a width. */
function widthHash(unitsPerEm: number, advances: Uint16Array, tables: readonly (Reader | undefined)[]): string {
  const parts: string[] = [String(unitsPerEm)];
  for (let i = 0; i < advances.length; i += 4096) parts.push(String.fromCharCode(...advances.subarray(i, i + 4096)));
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
}

/** This function tells if a lookup with the flags `flags` skips a glyph of the GDEF class `glyphClass`. */
function skips(flags: number, glyphClass: number): boolean {
  return ((flags & IGNORE_MARKS) !== 0 && glyphClass === 3) || ((flags & IGNORE_BASE) !== 0 && glyphClass === 1) || ((flags & IGNORE_LIGATURES) !== 0 && glyphClass === 2);
}

/** This function gives the advances of the glyphs of a text in font units, after the pair kerning. The text is not shaped. */
export function glyphAdvances(font: Font, text: string, options: MeasureOptions = {}): { glyphs: number[]; advances: number[] } {
  const glyphs: number[] = [];
  for (const character of text) glyphs.push(font.glyph(character.codePointAt(0)!));
  const advances = glyphs.map((glyph) => font.advance(glyph));
  for (const lookup of font.kerning(options.script ?? "DFLT")) {
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
 * This function gives the width of a text in px at the size `size` in px. The width is the sum of the advances and of the
 * pair kerning, with no shaping.
 */
export function measureWidth(font: Font, text: string, size: number, options: MeasureOptions = {}): number {
  const { advances } = glyphAdvances(font, text, options);
  let units = 0;
  for (const advance of advances) units += advance;
  return (units * size) / font.unitsPerEm;
}
