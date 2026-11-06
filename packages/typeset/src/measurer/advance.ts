/**
 * The advance function of the font model: the width of a text in a CSS font, as the measurer of
 * `@mark1russell7/layout-contract/text` asks for it. The host gives the font files as faces. The function finds the face
 * of each run of the text with the matching rules of CSS. It finds the script of the run, and measures the run with the
 * rules of one text engine.
 */
import { engines, isEngineName, type EngineName, type EngineRules } from "../fonts/engines.ts";
import { measureWidth, readFont, type Font } from "../fonts/font.ts";
import { shapingRisks } from "../fonts/risks.ts";
import type { Decompress } from "../fonts/sfnt.ts";
import { canvasWords } from "../fonts/words.ts";

/** This function gives the width of a text in a CSS font, as `AdvanceFn` of layout-contract does. */
export type AdvanceFn = (text: string, font: string) => number;

/** One font file of the host, with the family, the weight and the style that CSS matches. */
export interface FontFace {
  /** The family name, as the CSS font names it. The match ignores the case. */
  readonly family: string;
  /** The bytes of a TrueType, OpenType or WOFF2 file. */
  readonly data: Uint8Array;
  /**
   * The weight of the face: one value, or the range of a variable font. The default is the range of the `wght` axis of the
   * font, or 400 for a font with no `wght` axis.
   */
  readonly weight?: number | readonly [number, number];
  /** The style of the face. The default is `normal`. */
  readonly style?: "normal" | "italic" | "oblique";
  /** The Brotli decompressor of a WOFF2 file. */
  readonly decompress?: Decompress;
}

/** The options of `fontAdvance`. */
export interface FontAdvanceOptions {
  /** The font files of the host. The order sets the choice between two faces with the same match. */
  readonly faces: readonly FontFace[];
  /** The text engine: a row name of `engines`, or the rules of a row. The default is `freetype`, as Chromium on Linux. */
  readonly engine?: EngineName | EngineRules;
  /**
   * The shaping of `measureWidth`. The default is `canvas`, as `canvasAdvance` of layout-contract measures each segment
   * with `measureText`. Use `dom` for the widths of a text in a page.
   */
  readonly shaping?: "dom" | "canvas";
  /** The shaper of the host. Under the shaping `canvas`, it measures each word that `shapingRisks` flags. The shaping `dom` does not use it. */
  readonly fallback?: AdvanceFn;
}

/** The parts of a CSS font shorthand that change a width. */
export interface FontSpec {
  readonly style: "normal" | "italic" | "oblique";
  /** The angle of an oblique style in degrees. CSS gives 14 when the font names no angle. */
  readonly angle: number;
  /** The weight from 1 to 1000. */
  readonly weight: number;
  /** The width of the font as a percent of the normal width, from the keyword of `font-stretch`. */
  readonly stretch: number;
  /** The size in px. */
  readonly size: number;
  /** The family names in the order of the font, with no quotes. */
  readonly families: readonly string[];
}

const stretches: Readonly<Record<string, number>> = {
  "ultra-condensed": 50,
  "extra-condensed": 62.5,
  condensed: 75,
  "semi-condensed": 87.5,
  "semi-expanded": 112.5,
  expanded: 125,
  "extra-expanded": 150,
  "ultra-expanded": 200,
};

// Each number pattern matches a text in one way only. Thus a long run of digits does not make the match slow.
const sizePattern = /^((?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)(px|pt)(\/.*)?$/i;
const anglePattern = /^(-?(?:\d+(?:\.\d+)?|\.\d+))deg$/i;
const weightPattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * This function reads a CSS font shorthand, for example `italic 700 16px/1.2 "Noto Sans", sans-serif`. The size must be in
 * `px` or `pt`. The function refuses `small-caps`, the system font keywords and the relative sizes with a `RangeError`.
 */
export function parseFont(font: string): FontSpec {
  const tokens = font.trim().split(/\s+/);
  let style: FontSpec["style"] = "normal";
  let angle = 14;
  let weight = 400;
  let stretch = 100;
  let index = 0;
  for (; index < tokens.length; index++) {
    const token = tokens[index]!;
    const lower = token.toLowerCase();
    const size = sizePattern.exec(token);
    if (size !== null) break;
    if (lower === "normal") continue;
    if (lower === "italic") style = "italic";
    else if (lower === "oblique") {
      style = "oblique";
      const next = anglePattern.exec(tokens[index + 1] ?? "");
      if (next !== null) {
        angle = Number(next[1]);
        index++;
      }
    } else if (lower === "bold" || lower === "bolder") weight = 700;
    else if (lower === "lighter") weight = 100;
    else if (weightPattern.test(token) && Number(token) >= 1 && Number(token) <= 1000) weight = Number(token);
    else if (Object.hasOwn(stretches, lower)) stretch = stretches[lower]!;
    else throw new RangeError(`the font "${font}" has the part "${token}", which the measurer does not know`);
  }
  const size = sizePattern.exec(tokens[index] ?? "");
  if (size === null) throw new RangeError(`the font "${font}" has no size in px or pt`);
  let rest = tokens.slice(index + 1).join(" ");
  // A line height after a space: "16px / 1.2" or "16px /1.2"
  if (size[3] === undefined && rest.startsWith("/")) rest = rest.slice(1).trim().replace(/^\S+\s*/, "");
  const families = rest
    .split(",")
    .map((family) => family.trim().replace(/^(["'])(.*)\1$/, "$2").trim())
    .filter((family) => family.length > 0);
  if (families.length === 0) throw new RangeError(`the font "${font}" has no family`);
  const value = Number(size[1]);
  return { style, angle, weight, stretch, size: size[2]!.toLowerCase() === "pt" ? (value * 4) / 3 : value, families };
}

/** The Unicode scripts and their OpenType tags. A script that is not in the list gets `DFLT`. */
const scriptPatterns: readonly (readonly [RegExp, string])[] = [
  [/\p{sc=Latin}/u, "latn"],
  [/\p{sc=Greek}/u, "grek"],
  [/\p{sc=Cyrillic}/u, "cyrl"],
  [/\p{sc=Armenian}/u, "armn"],
  [/\p{sc=Hebrew}/u, "hebr"],
  [/\p{sc=Arabic}/u, "arab"],
  [/\p{sc=Syriac}/u, "syrc"],
  [/\p{sc=Thaana}/u, "thaa"],
  [/\p{sc=Devanagari}/u, "deva"],
  [/\p{sc=Bengali}/u, "beng"],
  [/\p{sc=Gurmukhi}/u, "guru"],
  [/\p{sc=Gujarati}/u, "gujr"],
  [/\p{sc=Oriya}/u, "orya"],
  [/\p{sc=Tamil}/u, "taml"],
  [/\p{sc=Telugu}/u, "telu"],
  [/\p{sc=Kannada}/u, "knda"],
  [/\p{sc=Malayalam}/u, "mlym"],
  [/\p{sc=Sinhala}/u, "sinh"],
  [/\p{sc=Thai}/u, "thai"],
  [/\p{sc=Lao}/u, "lao "],
  [/\p{sc=Tibetan}/u, "tibt"],
  [/\p{sc=Myanmar}/u, "mymr"],
  [/\p{sc=Georgian}/u, "geor"],
  [/\p{sc=Hangul}/u, "hang"],
  [/\p{sc=Ethiopic}/u, "ethi"],
  [/\p{sc=Khmer}/u, "khmr"],
  [/\p{sc=Mongolian}/u, "mong"],
  [/[\p{sc=Hiragana}\p{sc=Katakana}]/u, "kana"],
  [/\p{sc=Bopomofo}/u, "bopo"],
  [/\p{sc=Han}/u, "hani"],
];

const neutral = /[\p{sc=Common}\p{sc=Inherited}\p{sc=Unknown}]/u;

/** This function divides a text into parts of one script. A neutral character stays with the part before it. */
export function scriptRuns(text: string): string[] {
  if (/^[\0-\x7f]*$/.test(text)) return [text];
  const runs: string[] = [];
  let run = "";
  let current: string | undefined;
  for (const character of text) {
    if (!neutral.test(character)) {
      const tag = scriptTag(character).replace(/kana|bopo/, "hani");
      if (current !== undefined && tag !== current) {
        runs.push(run);
        run = "";
      }
      current = tag;
    }
    run += character;
  }
  runs.push(run);
  return runs;
}

/**
 * This function gives the OpenType script tag of a text, as HarfBuzz guesses it. The tag is the script of the first
 * character that is not of the scripts Common, Inherited or Unknown. A text of only those characters, for example emoji, gets `DFLT`.
 */
export function scriptTag(text: string): string {
  for (const character of text) {
    if (neutral.test(character)) continue;
    for (const [pattern, tag] of scriptPatterns) if (pattern.test(character)) return tag;
    return "DFLT";
  }
  return "DFLT";
}

/** The clusters of a font list: a font takes a whole cluster, as the second pass of Blink does. */
const clusters = new Intl.Segmenter("und", { granularity: "grapheme" });

/** This pattern finds a character with no ink. A font needs no glyph for it, because HarfBuzz hides it. */
const ignorable = /^\p{Default_Ignorable_Code_Point}$/u;

/** This function tells if a font has a glyph for each code point of a text that needs one. */
function covers(font: Font, text: string): boolean {
  for (const character of text) if (font.glyph(character.codePointAt(0)!) === 0 && !ignorable.test(character)) return false;
  return true;
}

/**
 * This function tells if a font holds a cluster. The normalizer of HarfBuzz composes a base and a mark when the font has the
 * composed character. So a font with `â` holds `a` and U+0302.
 */
function holds(font: Font, cluster: string): boolean {
  return covers(font, cluster) || covers(font, cluster.normalize("NFC"));
}

/** This pattern finds a character that starts an emoji run of Blink: a character with emoji presentation, or a skin tone modifier. */
const emojiStart = /^[\p{Emoji_Presentation}\p{Emoji_Modifier}]$/u;

/**
 * This function gives the clusters of a text for the font fallback. The run segmenter of Blink divides the text into script
 * runs and emoji runs before the fallback. So a cluster is a grapheme cluster inside one run of `scriptRuns`. It splits
 * where an emoji run starts. Thus a Devanagari mark after a Latin base keeps the base in its font. A space before a lone
 * skin tone modifier also keeps its font.
 */
export function fallbackClusters(text: string): string[] {
  const out: string[] = [];
  for (const run of scriptRuns(text)) {
    for (const { segment } of clusters.segment(run)) {
      const characters = [...segment];
      const split = emojiStart.test(characters[0]!) ? -1 : characters.findIndex((character) => emojiStart.test(character));
      if (split <= 0) out.push(segment);
      else out.push(characters.slice(0, split).join(""), characters.slice(split).join(""));
    }
  }
  return out;
}

const styleOrder: Readonly<Record<FontSpec["style"], readonly FontSpec["style"][]>> = {
  normal: ["normal", "oblique", "italic"],
  italic: ["italic", "oblique", "normal"],
  oblique: ["oblique", "italic", "normal"],
};

/** A face with its font, read at the first use. */
interface Loaded {
  readonly face: FontFace;
  readonly index: number;
  readonly font: Font;
  readonly range: readonly [number, number];
}

/**
 * This function gives the rank of a face for the weight `weight`, with the rules of CSS Fonts 4. A lower rank is a
 * better match. A face whose range holds the weight has the rank 0.
 */
function weightRank(range: readonly [number, number], weight: number): number {
  const [min, max] = range;
  if (min <= weight && weight <= max) return 0;
  const above = min > weight;
  // The groups of CSS: 1 is the first choice after an exact match, 3 is the last
  if (weight >= 400 && weight <= 500) {
    if (above && min <= 500) return 1000 + min;
    if (!above) return 3000 - max;
    return 5000 + min;
  }
  if (weight < 400) return above ? 3000 + min : 1000 - max;
  return above ? 1000 + min : 3000 - max;
}

/**
 * This function gives the advance function of the faces of the host: the width in px of a text in a CSS font. Each cluster
 * of `fallbackClusters` gets the first family of the font that holds it, as Blink falls back. A family holds a cluster when
 * it has a glyph for each code point, or for each code point of the composed form. When no family holds the cluster, the
 * cluster gets the first family with its first code point, or else the font before it. The width of a run is `measureWidth` with the size of the font, the script
 * of `scriptTag` and the rules of the engine. The instance of a variable face takes the weight and the stretch as `wdth`.
 * It takes the style as `ital` or `slnt`, and the size as `opsz`, as `font-optical-sizing: auto` does.
 */
export function fontAdvance(options: FontAdvanceOptions): (text: string, font: string) => number {
  const engine = options.engine ?? "freetype";
  if (typeof engine === "string" && !isEngineName(engine)) throw new RangeError(`the engine "${engine}" is not a row of engines`);
  const rules: EngineRules = typeof engine === "string" ? engines[engine] : engine;
  const shaping = options.shaping ?? "canvas";
  const fallback = shaping === "canvas" ? options.fallback : undefined;
  const faces = options.faces;
  const loaded = new Map<number, Loaded>();
  const specs = new Map<string, FontSpec>();
  const instances = new Map<string, Font>();
  const families = new Map<string, readonly Font[] | undefined>();

  const load = (index: number): Loaded => {
    let entry = loaded.get(index);
    if (entry === undefined) {
      const face = faces[index]!;
      const font = readFont(face.data, { deltas: rules.deltas, metrics: rules.metrics, ...(face.decompress === undefined ? {} : { decompress: face.decompress }) });
      const axis = font.axes.find((value) => value.tag === "wght");
      const declared = face.weight;
      const range: readonly [number, number] = typeof declared === "number" ? [declared, declared] : (declared ?? (axis === undefined ? [400, 400] : [axis.min, axis.max]));
      entry = { face, index, font, range };
      loaded.set(index, entry);
    }
    return entry;
  };

  /** This function gives the font of the best face of a family for the spec, or `undefined` when the family has no face. */
  const fontOf = (family: string, spec: FontSpec): Font | undefined => {
    const name = family.toLowerCase();
    const candidates: Loaded[] = [];
    for (let i = 0; i < faces.length; i++) if (faces[i]!.family.toLowerCase() === name) candidates.push(load(i));
    if (candidates.length === 0) return undefined;
    const style = styleOrder[spec.style].find((value) => candidates.some((entry) => (entry.face.style ?? "normal") === value))!;
    let best: Loaded | undefined;
    let bestRank = Infinity;
    for (const entry of candidates) {
      if ((entry.face.style ?? "normal") !== style) continue;
      const rank = weightRank(entry.range, spec.weight);
      if (rank < bestRank) {
        best = entry;
        bestRank = rank;
      }
    }
    const chosen = best!;
    const tags = new Set(chosen.font.axes.map((axis) => axis.tag));
    const instance: Record<string, number> = {};
    if (tags.has("wght")) instance["wght"] = Math.min(chosen.range[1], Math.max(chosen.range[0], spec.weight));
    if (tags.has("wdth")) instance["wdth"] = spec.stretch;
    if (tags.has("opsz")) instance["opsz"] = spec.size;
    if (tags.has("ital")) instance["ital"] = spec.style === "italic" ? 1 : 0;
    if (tags.has("slnt")) instance["slnt"] = spec.style === "oblique" ? -spec.angle : 0;
    const key = `${chosen.index}|${JSON.stringify(instance)}`;
    let font = instances.get(key);
    if (font === undefined) {
      font = Object.keys(instance).length === 0 ? chosen.font : chosen.font.at(instance);
      instances.set(key, font);
    }
    return font;
  };

  const fontsOf = (font: string): { readonly spec: FontSpec; readonly fonts: readonly Font[] } => {
    let spec = specs.get(font);
    if (spec === undefined) {
      spec = parseFont(font);
      if (specs.size >= 256) specs.clear();
      specs.set(font, spec);
    }
    let fonts = families.get(font);
    if (fonts === undefined) {
      fonts = spec.families.map((family) => fontOf(family, spec)).filter((value) => value !== undefined);
      if (fonts.length === 0) throw new RangeError(`no face of the host has a family of the font "${font}"`);
      if (families.size >= 256) families.clear();
      families.set(font, fonts);
    }
    return { spec, fonts };
  };

  return (text: string, font: string): number => {
    const { spec, fonts } = fontsOf(font);
    const sum = (parts: readonly string[], width: (part: string) => number): number => parts.reduce((total, part) => total + width(part), 0);
    const measure = (run: string, face: Font): number => {
      const runs = scriptRuns(run);
      const tagged = (part: string): number => measureWidth(face, part, spec.size, { script: scriptTag(part), shaping, rounding: rules.rounding, sum: rules.sum });
      const risky = (part: string): boolean => fallback !== undefined && shapingRisks(face, part, { script: scriptTag(part), shaping }).length > 0;
      if (runs.length === 1 && !risky(run)) return tagged(run);
      if (shaping !== "canvas") return sum(runs, tagged);
      // The width of a word comes from the word alone. This keeps the separator law of the rope
      return sum(canvasWords(run), (word) => {
        const parts = scriptRuns(word);
        return parts.some(risky) ? fallback!(word, font) : sum(parts, tagged);
      });
    };
    if (fonts.length === 1) return measure(text, fonts[0]!);
    /** This function gives each cluster the first font that holds it, and measures each run of one font. */
    const listed = (part: string): number => {
      let width = 0;
      let run = "";
      let current: Font | undefined;
      for (const segment of fallbackClusters(part)) {
        const face = fonts.find((value) => holds(value, segment)) ?? fonts.find((value) => value.glyph(segment.codePointAt(0)!) !== 0) ?? current ?? fonts[0]!;
        if (face !== current && run.length > 0) {
          width += measure(run, current!);
          run = "";
        }
        current = face;
        run += segment;
      }
      return run.length > 0 ? width + measure(run, current!) : width;
    };
    return listed(text);
  };
}
