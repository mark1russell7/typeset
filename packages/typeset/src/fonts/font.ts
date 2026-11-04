import { fnv1a32 } from "@mark1russell7/rigor-generators";
import type { Reader } from "./binary.ts";
import { readGposKerning, readKernTable, IGNORE_BASE, IGNORE_LIGATURES, IGNORE_MARKS, type PairLookup } from "./kerning.ts";
import { readTables, type Decompress, type TableMap } from "./sfnt.ts";
import { defaultFeatures, readGlyphFilter, readSubstitutions, type GlyphFilter, type SubstitutionLookup } from "./substitution.ts";
import { readAdvances, readCharacterMap, readGlyphClasses, readHeader } from "./tables.ts";
import { gvarAdvanceDeltas, readPointCounts, readTransformedPointCounts, type GlyphPoints } from "./gvar.ts";
import { instanceAdvances, normalize, readAxes, readVariationStore, type Axis, type Instance } from "./variations.ts";
import { indicScripts, indicShaper } from "./indic.ts";
import { joiningFeatures, joiningForms, joiningScripts, joiningStages } from "./joining.ts";
import { hasDefaultIgnorable, hasMark, isHidden, normalizeCodePoints, zeroedMarks, type MarkRules } from "./normalize.ts";
import { canvasSegments, canvasWords } from "./words.ts";

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
  /**
   * The advance of a composite glyph. `own` (the default) uses the advance of the glyph, as FreeType and CoreText do.
   * `component` uses the advance of its component with the flag USE_MY_METRICS, as DirectWrite does.
   */
  readonly metrics?: "own" | "component";
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
  /** This value is `true` when the font has a GPOS table. */
  readonly hasPositioning: boolean;
  /** This value is `true` when the GDEF table has glyph classes. */
  readonly hasGlyphClasses: boolean;
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
    points: lazy(() => pointsOf(tables, need("head"), header.numGlyphs)),
  };
  const modes: Modes = { deltas: options.deltas ?? "round", advances: options.advances ?? "auto", metrics: options.metrics ?? "own" };
  return build(parsed, options.instance ?? {}, modes);
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
 * This function gives the points of each glyph, or `undefined` when the font has no `glyf` table. A WOFF2 file keeps
 * `glyf` in its transformed form, and its `loca` table is then empty.
 */
function pointsOf(tables: TableMap, head: Reader, numGlyphs: number): GlyphPoints | undefined {
  const glyf = tables.get("glyf");
  const loca = tables.get("loca");
  if (glyf === undefined || loca === undefined) return undefined;
  return loca.length === 0 ? readTransformedPointCounts(glyf, numGlyphs) : readPointCounts(glyf, loca, head.i16(50), numGlyphs);
}

/** The modes of `readFont` that stay the same for each instance of a font. */
interface Modes {
  readonly deltas: "round" | "exact";
  readonly advances: "auto" | "gvar";
  readonly metrics: "own" | "component";
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
  /** The points of each glyph, for the phantom points of `gvar` and the flag USE_MY_METRICS. */
  readonly points: () => GlyphPoints | undefined;
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
  const phantoms = gvar !== undefined && (modes.advances === "gvar" || hvar === undefined) && parsed.points() !== undefined;
  const advanceSource: AdvanceSource = !variable ? "hmtx" : phantoms ? "gvar" : hvar !== undefined ? "HVAR" : "hmtx";
  const advances = advanceSource === "gvar" ? phantomAdvances(parsed.advances, gvarAdvanceDeltas(gvar!, parsed.points()!.counts, coordinates, deltas)) : instanceAdvances(parsed.advances, advanceSource === "HVAR" ? hvar : undefined, coordinates, deltas);
  const metrics = modes.metrics === "component" ? parsed.points()?.metrics : undefined;
  if (metrics !== undefined) componentAdvances(advances, metrics);
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
    epoch: `${header.revision.toString(16).padStart(8, "0")}-${widthHash(header.unitsPerEm, coordinates, advances, hashed)}${deltas === "exact" ? "-exact" : ""}${advanceSource === "gvar" && hvar !== undefined ? "-gvar" : ""}${metrics !== undefined ? "-metrics" : ""}`,
    unitsPerEm: header.unitsPerEm,
    numGlyphs: header.numGlyphs,
    hasPositioning: gpos !== undefined,
    hasGlyphClasses: gdef !== undefined && gdef.u16(4) !== 0,
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
        found = gpos !== undefined ? readGposKerning(gpos, script, store, parsed.filter) : kern !== undefined ? readKernTable(kern) : [];
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

/**
 * This function gives each composite glyph the advance of its component with the flag USE_MY_METRICS. A component can
 * have that flag in its own components, so the function follows the chain. A chain of more than 8 steps stops.
 */
function componentAdvances(advances: Float64Array, metrics: Int32Array): void {
  const own = Float64Array.from(advances);
  for (let glyph = 0; glyph < metrics.length; glyph++) {
    let source = glyph;
    for (let step = 0; step < 8 && (metrics[source] ?? -1) >= 0; step++) source = metrics[source]!;
    if (source !== glyph && source < own.length) advances[glyph] = own[source]!;
  }
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
   * when the page does not change them. An empty list applies no feature of the list. The joining forms are not in the
   * list. The option `joining` controls them.
   */
  readonly features?: readonly string[];
  /**
   * The joining of the Arabic shaper of HarfBuzz. When it is `true` (the default), the scripts of `joiningScripts` get the
   * joining forms, for example `init` and `fina`. Their features then go in the stages of `joiningStages`. The other
   * scripts do not change. When it is `false`, all the scripts use the one stage of the other scripts.
   */
  readonly joining?: boolean;
  /**
   * The Indic shaper of HarfBuzz. When it is `true` (the default), the scripts of `indicScripts` get the syllables, the
   * reordering and the stages of `indicShaper`. When it is `false`, they use the one stage of the other scripts.
   */
  readonly indic?: boolean;
  /**
   * The shaping of the browser to model. `dom` (the default) shapes the words of `shapingWords` and then kerns all the
   * text. `canvas` shapes and kerns each word of `canvasWords` alone, as Blink does for the text of a canvas.
   */
  readonly shaping?: "dom" | "canvas";
  /**
   * The sum of the advances. `exact` (the default) adds them with no rounding. `float32` models the canvas of Blink with
   * CoreText and DirectWrite. Then the option `shaping` has no effect. The rounding `pixel` ignores this option.
   */
  readonly sum?: "exact" | "float32";
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

/** The choices that a set of options makes for the GSUB pass and for the kerning. */
export interface Shaping {
  readonly script: string;
  /** The features of the option `features`, or `defaultFeatures`. */
  readonly features: readonly string[];
  readonly shaper: "indic" | "joining" | "plain";
  readonly kerning: readonly PairLookup[];
}

/** This function gives the choices of a set of options: the script, the features, the shaper and the kerning lookups. */
export function shapingOf(font: Font, options: MeasureOptions): Shaping {
  const script = options.script ?? "DFLT";
  const features = options.features ?? defaultFeatures;
  const kerning = options.kerning === false ? [] : font.kerning(script);
  if (options.indic !== false && indicScripts.includes(script)) return { script, features, shaper: "indic", kerning };
  return { script, features, shaper: options.joining !== false && joiningScripts.includes(script) ? "joining" : "plain", kerning };
}

/** The bit of a mask for the features of all the glyphs. */
const GLOBAL_MASK = 0x80;
/** The bit of a mask for a default ignorable. */
const IGNORABLE_MASK = 0x100;
/** The bit of a mask for a mark that takes no advance. */
const ZEROED_MASK = 0x200;

/** The tags of the scripts whose shaper in HarfBuzz has no fallback mark position. */
const noFallbackPosition: readonly string[] = ["thai", "lao ", "khmr", "mymr", "mym2"];
/** The tags of the scripts whose shaper in HarfBuzz does not zero the marks. */
const noMarkZero: readonly string[] = ["hang", "khmr"];

/** This function gives the rules of `zeroedMarks` for a font and a script. The Indic shaper of HarfBuzz has neither rule. */
function markRules(font: Font, script: string): MarkRules {
  const indic = indicScripts.includes(script);
  return { classes: !font.hasGlyphClasses && !indic && !noMarkZero.includes(script), fallback: !font.hasPositioning && !indic && !noFallbackPosition.includes(script) };
}

/**
 * This function gives the advance of a glyph of `shaperOf`. HarfBuzz hides a default ignorable after the GSUB pass, if no
 * substitution changed it. The value `~glyph` marks a hidden glyph. It has the advance 0, and the kerning skips it.
 */
function shapedAdvance(font: Font, glyph: number): number {
  return glyph < 0 ? 0 : font.advance(glyph);
}

/** The GSUB pass of one set of options: a function that gives the glyphs of one word, and the kerning lookups. */
function shaperOf(font: Font, options: MeasureOptions): { substitute: (word: string) => number[]; kerning: readonly PairLookup[] } {
  const { script, features, shaper, kerning } = shapingOf(font, options);
  if (shaper === "indic") return { substitute: indicShaper(font, script, features), kerning };
  const marks = markRules(font, script);
  const joins = shaper === "joining";
  const lookups = joins ? [] : font.substitutions(script, features);
  const stages = joins ? joiningStages(features, features.includes("rclt") && font.substitutions(script, ["rclt"]).length > 0).map((stage) => ({ stage, lookups: font.substitutions(script, stage.features) })) : [];
  // The shaper of Hangul has its own normalization in HarfBuzz: the mode `NONE` keeps each character with a glyph
  const normalizes = script !== "hang";
  const rules = { hasGlyph: (codePoint: number) => font.glyph(codePoint) !== 0, shortCircuit: true };
  const substitute = (word: string): number[] => {
    let codePoints = [...word].map((character) => character.codePointAt(0)!);
    let wordGlyphs = codePoints.map((codePoint) => font.glyph(codePoint));
    if (normalizes && (hasMark(word) || wordGlyphs.includes(0))) {
      codePoints = normalizeCodePoints(codePoints, rules);
      wordGlyphs = codePoints.map((codePoint) => font.glyph(codePoint));
    }
    const hides = hasDefaultIgnorable(word);
    const zeroed = (marks.classes || marks.fallback) && hasMark(word) ? zeroedMarks(codePoints, marks) : [];
    const forms = joins ? joiningForms(codePoints) : [];
    // Each glyph has the bit of its joining form, and the bits of `GLOBAL_MASK`, `IGNORABLE_MASK` and `ZEROED_MASK`
    const masks = joins || hides || zeroed.length > 0 ? codePoints.map((codePoint, i) => GLOBAL_MASK | (forms[i] === undefined ? 0 : 1 << joiningFeatures.indexOf(forms[i])) | (hides && isHidden(font, codePoint) ? IGNORABLE_MASK : 0) | (zeroed[i] === true ? ZEROED_MASK : 0)) : undefined;
    const before = hides ? [...wordGlyphs] : [];
    for (const lookup of lookups) lookup.apply(wordGlyphs, masks, GLOBAL_MASK);
    for (const { stage, lookups: stageLookups } of stages) {
      const mask = stage.form === undefined ? GLOBAL_MASK : 1 << joiningFeatures.indexOf(stage.form);
      for (const lookup of stageLookups) lookup.apply(wordGlyphs, masks, mask);
    }
    // A substitution gives a new glyph the mask of its source. Thus a default ignorable with a new id is not hidden, and a mark stays zeroed
    return masks === undefined ? wordGlyphs : wordGlyphs.map((glyph, i) => {
      const mask = masks[i] ?? 0;
      return (mask & ZEROED_MASK) !== 0 || ((mask & IGNORABLE_MASK) !== 0 && before.includes(glyph)) ? ~glyph : glyph;
    });
  };
  return { substitute, kerning };
}

/**
 * This function gives the glyphs of a text and their advances in font units. With the shaping `dom`, it applies the GSUB
 * substitutions to each word of `shapingWords`, and then the pair kerning to all the text. With the shaping `canvas`, it
 * applies the substitutions and the kerning to each word of `canvasWords` alone. A script of `joiningScripts` also gets
 * the joining forms of each word, in the stages of `joiningStages`. A script of `indicScripts` uses `indicShaper`.
 */
export function glyphAdvances(font: Font, text: string, options: MeasureOptions = {}): { glyphs: number[]; advances: number[] } {
  const { glyphs, advances } = shapedAdvances(font, text, options);
  return { glyphs: glyphs.map((glyph) => (glyph < 0 ? ~glyph : glyph)), advances };
}

/** This function is `glyphAdvances` with the hidden glyphs of `shapedAdvance`. */
function shapedAdvances(font: Font, text: string, options: MeasureOptions): { glyphs: number[]; advances: number[] } {
  const { substitute, kerning } = shaperOf(font, options);
  const canvas = options.shaping === "canvas";
  const glyphs: number[] = [];
  const advances: number[] = [];
  for (const word of canvas ? canvasWords(text) : shapingWords(text)) {
    const wordGlyphs = substitute(word);
    const wordAdvances = wordGlyphs.map((glyph) => shapedAdvance(font, glyph));
    if (canvas) kern(font, kerning, wordGlyphs, wordAdvances);
    glyphs.push(...wordGlyphs);
    advances.push(...wordAdvances);
  }
  if (!canvas) kern(font, kerning, glyphs, advances);
  return { glyphs, advances };
}

/**
 * The scale of HarfBuzz at one size. Blink gives HarfBuzz the scale of the size times 65536, so a position is in 1/65536 px.
 * The field `multiplier` is the factor of `em_mult` in `hb-font.hh`.
 */
interface PositionScale {
  readonly xScale: number;
  readonly multiplier: number;
  readonly unitsPerEm: number;
}

/** This function rounds a value to the nearest whole number, and a half goes away from 0, as `roundf` does. */
function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

/**
 * This function gives a kerning value in 1/65536 px, as HarfBuzz scales it. HarfBuzz scales the value of the ValueRecord
 * with `em_mult`, and the delta of the VariationIndex table in single precision with `em_scalef`.
 */
function kerningPosition(value: number, delta: number, scale: PositionScale): number {
  const base = Math.round(value - delta);
  const scaledDelta = delta === 0 ? 0 : roundHalfAway(Math.fround(Math.fround(Math.fround(delta) * scale.xScale) / scale.unitsPerEm));
  return Math.floor((base * scale.multiplier + 32768) / 65536) + scaledDelta;
}

/**
 * This function adds the values of the pair kerning lookups `lookups` to the advances `advances` of the glyphs `glyphs`.
 * When `positions` is given, it also adds each value in 1/65536 px, as HarfBuzz scales it at the scale `scale`.
 */
function kern(font: Font, lookups: readonly PairLookup[], glyphs: readonly number[], advances: number[], positions?: number[], scale?: PositionScale): void {
  for (const lookup of lookups) {
    const next = (from: number): number => {
      for (let j = from; j < glyphs.length; j++) if (glyphs[j]! >= 0 && !(lookup.skip?.(glyphs[j]!) ?? skips(lookup.flags, font.glyphClass(glyphs[j]!)))) return j;
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
      if (positions !== undefined && scale !== undefined) {
        positions[i]! += kerningPosition(value.first, value.firstDelta ?? 0, scale);
        positions[j]! += kerningPosition(value.second, value.secondDelta ?? 0, scale);
      }
      i = value.skipSecond ? next(j + 1) : j;
    }
  }
}

/**
 * This function gives the width of a text with the sum `float32`, as Blink adds the widths of a canvas. Each advance in
 * single precision is cut to 1/65536 px, and HarfBuzz scales each kerning value. The sum of a segment of `canvasSegments`
 * is exact, and the sum of the segments is in single precision.
 */
function float32Width(font: Font, text: string, size: number, options: MeasureOptions): number {
  const { substitute, kerning } = shaperOf(font, options);
  const xScale = Math.trunc(Math.fround(size) * 65536);
  const scale: PositionScale = { xScale, multiplier: Math.floor((xScale * 65536) / font.unitsPerEm), unitsPerEm: font.unitsPerEm };
  const pxPerUnit = size / font.unitsPerEm;
  let total = 0;
  for (const segment of canvasSegments(text)) {
    const glyphs = substitute(segment);
    // Skia gives each advance in single precision, and Blink cuts it to the 16.16 fixed point of HarfBuzz
    const positions = glyphs.map((glyph) => Math.trunc(Math.fround(shapedAdvance(font, glyph) * pxPerUnit) * 65536));
    kern(font, kerning, glyphs, glyphs.map((glyph) => shapedAdvance(font, glyph)), positions, scale);
    let units = 0;
    for (const position of positions) units += position;
    total = Math.fround(total + Math.fround(units / 65536));
  }
  return total;
}

/**
 * This function gives the width of a text in px at the size `size` in px. The width is the sum of the advances after the
 * GSUB substitutions and the pair kerning.
 */
export function measureWidth(font: Font, text: string, size: number, options: MeasureOptions = {}): number {
  if (options.sum === "float32" && options.rounding !== "pixel") return float32Width(font, text, size, options);
  const { glyphs, advances } = shapedAdvances(font, text, options);
  if (options.rounding === "pixel") {
    const scale = size / font.unitsPerEm;
    let px = 0;
    glyphs.forEach((glyph, i) => {
      const base = shapedAdvance(font, glyph);
      // FreeType gives the advance in 26.6 fixed point, and Skia rounds it to whole px
      px += Math.round(Math.round(base * scale * 64) / 64) + Math.round((advances[i]! - base) * scale);
    });
    return px;
  }
  let units = 0;
  for (const advance of advances) units += advance;
  return (units * size) / font.unitsPerEm;
}
