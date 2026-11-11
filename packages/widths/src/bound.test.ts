import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deriveSeed, random as createRandom, type Random } from "@mark1russell7/rigor-generators";
import { median } from "@mark1russell7/rigor-statistics";
import { engines, measureWidth, readFont, widthBound, type EngineName, type Font, type MeasureOptions } from "@mark1russell7/typeset/fonts";
import { fontsFor, generateSample, scriptIds, scripts, type ScriptId } from "@typeset/corpus";
import { afterAll, describe, expect, it } from "vitest";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. The restore command of `@typeset/pinned` gets them. A script with no file is skipped.
// The path `TYPESET_BOUND_RECORD` gets the JSON record of the run.
const folder = process.env["TYPESET_FONTS"];
const recordPath = process.env["TYPESET_BOUND_RECORD"];
const seed = 2026;
const lineSamples = 40;
const adversarialTexts = 200;
const sizes = [8, 10, 12, 13.5, 14, 15.333, 16, 24, 48, 72, 96];
const tightSize = 16;
const names = Object.keys(engines) as EngineName[];
const widest = 16;
const pairCandidates = 512;
const widestPairs = 32;

/**
 * The result of one font of a script. The field `samples` counts the comparisons, `worst` is the largest width / limit, and
 * `overTexts` has the first texts over the limit. The field `medianRatio` is the median of limit / width over the line samples
 * at 16 px, with the freetype font and no pixel rounding. The field `medianRatioPixel` is the same median with the pixel rounding.
 */
interface FontRecord {
  readonly font: string;
  readonly weight: number;
  readonly samples: number;
  readonly over: number;
  readonly overTexts: readonly { engine: EngineName; size: number; width: number; bound: number; text: string }[];
  readonly worst: number;
  readonly medianRatio: number;
  readonly medianRatioPixel: number;
  readonly advance: number;
  readonly kerning: number;
  readonly glyphs: number;
  readonly milliseconds: number;
}

const records: { script: string; fonts: FontRecord[]; ratios: number[]; pixelRatios: number[] }[] = [];

function present(id: string): boolean {
  return folder !== undefined && existsSync(join(folder, fileName(id)));
}

/** This function gives all the characters that the corpus can put in a text of a script, as one string. */
function charactersOf(script: ScriptId): string {
  const spec = scripts[script];
  const characters = new Set<string>();
  for (const [first, last] of [...spec.letters, ...spec.marks]) for (let codePoint = first; codePoint <= last; codePoint++) characters.add(String.fromCodePoint(codePoint));
  for (const text of [spec.separator, "0123456789", ...spec.punctuation]) for (const character of text) characters.add(character);
  return [...characters].join("");
}

/** This function gives the pairs of the first and second characters with the largest positive kerning of `candidates`. */
function kerningPairs(font: Font, tag: string, candidates: readonly string[]): (readonly [string, string])[] {
  const lookups = font.kerning(tag);
  const glyphs = candidates.map((character) => font.glyph(character.codePointAt(0)!));
  const found: { first: number; second: number; value: number }[] = [];
  for (let first = 0; first < glyphs.length; first++) {
    for (let second = 0; second < glyphs.length; second++) {
      let value = 0;
      for (const lookup of lookups) {
        const pair = lookup.pair(glyphs[first]!, glyphs[second]!);
        if (pair !== undefined) value += pair.first + pair.second;
      }
      if (value > 0) found.push({ first, second, value });
    }
  }
  found.sort((a, b) => b.value - a.value || a.first - b.first || a.second - b.second);
  return found.slice(0, widestPairs).map(({ first, second }) => [candidates[first]!, candidates[second]!]);
}

/** This function gives one text of the adversarial set: `length` draws of `pieces`, or one piece again and again. */
function repeated(random: Random, pieces: readonly string[], length: number, mix: boolean): string {
  const one = random.pick(pieces);
  let text = "";
  while ([...text].length < length) text += mix ? random.pick(pieces) : one;
  return text;
}

/** This function gives the seeded adversarial texts of a font: repeats of the widest characters and of the pairs with the most kerning. */
function adversarialSet(font: Font, script: ScriptId, label: string, characters: string): string[] {
  const tag = scriptTags[script];
  const ranked = Array.from(characters, (character) => ({ character, width: measureWidth(font, character, 1000, { script: tag, shaping: "canvas", kerning: false }) }));
  ranked.sort((a, b) => b.width - a.width || a.character.codePointAt(0)! - b.character.codePointAt(0)!);
  const order = ranked.map((entry) => entry.character);
  const wide = order.slice(0, widest);
  const pairs = kerningPairs(font, tag, order.slice(0, pairCandidates)).map(([first, second]) => first + second);
  const kerned = pairs.length > 0 ? pairs : wide.map((character) => character + wide[0]!);
  const random = createRandom(deriveSeed(seed, `${script}/${label}`));
  return Array.from({ length: adversarialTexts }, (_, index) => {
    const length = random.int(20, 80);
    if (index % 4 === 0) return repeated(random, wide, length, false);
    if (index % 4 === 1) return repeated(random, wide, length, true);
    if (index % 4 === 2) return repeated(random, kerned, length, false);
    return repeated(random, [...kerned, ...wide], length, true);
  });
}

/** This function compares the limit of one font with each text, for each engine row and each size. */
function examine(script: ScriptId, id: string, weight: number, characters: string): { record: FontRecord; ratios: number[]; pixelRatios: number[] } {
  const started = performance.now();
  const bytes = readFileSync(join(folder ?? "", fileName(id)));
  const tag = scriptTags[script];
  const lines = Array.from({ length: lineSamples }, (_, index) => generateSample(seed, script, "line", index).text);
  const allowed = new Set(characters);
  for (const line of lines) for (const character of line) expect(allowed.has(character), `U+${character.codePointAt(0)!.toString(16)} of ${script}`).toBe(true);
  const freetype = engines.freetype;
  const reference = readFont(bytes, { instance: cssInstance(weight), deltas: freetype.deltas, metrics: freetype.metrics });
  const texts = [...lines, ...adversarialSet(reference, script, `${id}/${weight}`, characters)];

  let samples = 0;
  let worst = 0;
  const overTexts: FontRecord["overTexts"][number][] = [];
  let over = 0;
  for (const engine of names) {
    const rules = engines[engine];
    const font = readFont(bytes, { instance: cssInstance(weight), deltas: rules.deltas, metrics: rules.metrics });
    const options: MeasureOptions = { script: tag, shaping: "canvas", rounding: rules.rounding, sum: rules.sum };
    const bound = widthBound(font, characters, options);
    for (const text of texts) {
      for (const size of sizes) {
        const width = measureWidth(font, text, size, options);
        const limit = bound.width(text.length, size);
        samples++;
        worst = Math.max(worst, width / limit);
        if (width > limit) {
          over++;
          if (overTexts.length < 5) overTexts.push({ engine, size, width, bound: limit, text });
        }
      }
    }
  }

  const ratiosOf = (options: MeasureOptions): number[] => {
    const bound = widthBound(reference, characters, options);
    return lines.map((text) => bound.width(text.length, tightSize) / measureWidth(reference, text, tightSize, options));
  };
  const ratios = ratiosOf({ script: tag, shaping: "canvas", rounding: "exact", sum: "exact" });
  const pixelRatios = ratiosOf({ script: tag, shaping: "canvas", rounding: freetype.rounding, sum: freetype.sum });
  const { advance, kerning, glyphs } = widthBound(reference, characters, { script: tag, shaping: "canvas", rounding: "exact", sum: "exact" });
  const record: FontRecord = { font: id, weight, samples, over, overTexts, worst, medianRatio: median(ratios), medianRatioPixel: median(pixelRatios), advance, kerning, glyphs, milliseconds: Math.round(performance.now() - started) };
  return { record, ratios, pixelRatios };
}

function run(script: ScriptId, name: string, fonts: readonly (readonly [id: string, weight: number])[]): void {
  const characters = charactersOf(script);
  const entry = { script: name, fonts: [] as FontRecord[], ratios: [] as number[], pixelRatios: [] as number[] };
  records.push(entry);
  for (const [id, weight] of fonts) {
    const { record, ratios, pixelRatios } = examine(script, id, weight, characters);
    entry.fonts.push(record);
    entry.ratios.push(...ratios);
    entry.pixelRatios.push(...pixelRatios);
    process.stderr.write(`${name} ${id} ${weight}: ${record.over} of ${record.samples} over, median ${record.medianRatio.toFixed(3)} (pixel ${record.medianRatioPixel.toFixed(3)}), worst ${record.worst.toFixed(4)}, ${record.milliseconds} ms\n`);
    expect(record.overTexts, `${name} ${id} ${weight}`).toEqual([]);
  }
}

afterAll(() => {
  if (recordPath === undefined) return;
  const results = records.map(({ script, fonts, ratios, pixelRatios }) => ({
    script,
    samples: fonts.reduce((total, font) => total + font.samples, 0),
    over: fonts.reduce((total, font) => total + font.over, 0),
    medianRatio: ratios.length === 0 ? null : median(ratios),
    medianRatioPixel: pixelRatios.length === 0 ? null : median(pixelRatios),
    fonts,
  }));
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify({ schema: "typeset-width-bound/1", seed, sizes, tightSize, lineSamples, adversarialTexts, engines: names, arm: process.env["ARM"] ?? null, scripts: results }, null, 2)}\n`);
});

describe.skipIf(folder === undefined)("the limit of widthBound on the real fonts", () => {
  for (const script of scriptIds) {
    const ids = fontsFor(script).map((font) => font.id);
    it.skipIf(!ids.every(present))(`holds for ${script}`, { timeout: 900_000 }, () => {
      run(script, script, ids.map((id) => [id, 400]));
    });
  }

  it.skipIf(!present(extraSource.id))("holds for Source Sans 3 on the Latin corpus", { timeout: 900_000 }, () => {
    run("latin", extraSource.id, extraWeights.map((weight) => [extraSource.id, weight]));
  });
});
