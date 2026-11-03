import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { wilson } from "@mark1russell7/rigor-statistics";
import { engines, measureWidth, readFont, type EngineName, type Font } from "@mark1russell7/typeset/fonts";
import { glyphAdvances, readTables } from "@mark1russell7/typeset/fonts/inspect";
import { fingerprint, fonts as corpusFonts, fontsFor, generateCorpus, scriptIds, type Sample, type ScriptId } from "@typeset/corpus";
import { afterAll, describe, expect, it } from "vitest";
import { boundSizes, bootstrapRuns, boundStatistics, hmtxAdvances, knownOpen, tierNames, tiers, worstSigned, type BoundStatistics, type TierName } from "./bounds.ts";
import { missingGlyphs } from "./compare.ts";
import { harfbuzzScript, harfbuzzVersion, openReferenceFont, referenceUnits } from "./harfbuzz.ts";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. `fetch.ts` downloads them. A font with no file is skipped.
// When `TYPESET_BOUNDS_OUT` is set, the test writes the record `harfbuzz-bounds.json` to that path.
const folder = process.env["TYPESET_FONTS"];
const out = process.env["TYPESET_BOUNDS_OUT"];
const corpus = generateCorpus({ seed: 1, perCell: 40 });
const lines = corpus.filter((sample) => sample.lengthClass === "line");
const engineNames = Object.keys(engines) as EngineName[];
const files = new Map<string, Uint8Array>();

// The font of the reference check: a font of the set with no GPOS table and no kern table
const referenceId = "noto-emoji";

function present(id: string): boolean {
  return folder !== undefined && existsSync(join(folder, fileName(id)));
}

function bytesOf(id: string): Uint8Array {
  let bytes = files.get(id);
  if (bytes === undefined) {
    bytes = readFileSync(join(folder ?? "", fileName(id)));
    files.set(id, bytes);
  }
  return bytes;
}

/** This function gives the distinct code points of the corpus samples of the scripts `scripts`. */
function codePointsOf(scripts: readonly ScriptId[]): number[] {
  const found = new Set<number>();
  for (const sample of corpus) if (scripts.includes(sample.script)) for (const character of sample.text) found.add(character.codePointAt(0)!);
  return [...found];
}

/** One cell of the record: a script, a font, a weight, a size, a tier and an engine row. */
interface BoundCell extends BoundStatistics {
  readonly script: ScriptId;
  readonly font: string;
  readonly weight: number;
  readonly size: number;
  readonly tier: TierName;
  readonly engine: EngineName;
  /** The count of the line samples with a missing glyph. The statistics keep them, because HarfBuzz and the model both use the glyph 0. */
  readonly missing: number;
}

/** The glyph match of the tier `model` for one script, font and weight: the canvas words with the glyphs of HarfBuzz. */
interface GlyphMatch {
  readonly script: ScriptId;
  readonly font: string;
  readonly weight: number;
  readonly words: number;
  readonly matched: number;
  /** The first words with other glyphs, in the logical order. */
  readonly examples: readonly { readonly sample: string; readonly word: string; readonly model: readonly number[]; readonly harfbuzz: readonly number[] }[];
}

const cells: BoundCell[] = [];
const matches: GlyphMatch[] = [];
const checks: Record<string, unknown> = {};

/**
 * Each rule names a cluster on which two references disagree. The model matched Chrome on it (T1d), and HarfBuzz of the
 * record gives other glyphs. The rule of the specification decides it in a separate item. Until then, no reference is the truth.
 */
const disagreementRules = [
  {
    id: "devanagari-vowel-sign-after-independent-vowel",
    script: "devanagari",
    cluster: "आै",
    model: "a dotted circle before the vowel sign",
    chrome: "Chromium 156.0.8078.4 gives the glyphs of the model (T1d, docs/FONTS.md). Its HarfBuzz version is not known yet.",
    harfbuzz: "no dotted circle",
  },
];
const disagreements: { rule: string; sample: string; font: string; word: string; model: readonly number[]; harfbuzz: readonly number[] }[] = [];

/** This function measures the line samples of one script with one font at one weight, and adds the cells and the glyph match. */
function measure(script: ScriptId, id: string, weight: number, samples: readonly Sample[]): number {
  const tag = scriptTags[script];
  const bytes = bytesOf(id);
  const reference = openReferenceFont(bytes, cssInstance(weight));
  const models = Object.fromEntries(engineNames.map((engine) => [engine, readFont(bytes, { instance: cssInstance(weight), deltas: engines[engine].deltas, metrics: engines[engine].metrics })])) as Record<EngineName, Font>;
  const missing = samples.filter((sample) => missingGlyphs(models.freetype, sample.text) > 0).length;
  // The width of HarfBuzz in font units does not depend on the size, so one shaping serves the sweep
  const units = samples.map((sample) => referenceUnits(reference, sample.text, tag));
  for (const size of boundSizes) {
    for (const tier of tierNames) {
      for (const engine of engineNames) {
        const { rounding, sum } = engines[engine];
        const errors = samples.map((sample, i) => {
          const model = measureWidth(models[engine], sample.text, size, { ...tiers[tier], script: tag, shaping: "canvas", rounding, sum });
          return (model - (units[i]! * size) / reference.unitsPerEm) * 64;
        });
        const statistics = boundStatistics(errors, `${script}/${id}/${weight}/${size}/${tier}/${engine}`);
        cells.push({ script, font: id, weight, size, tier, engine, missing, ...statistics });
      }
    }
  }
  let words = 0;
  let matched = 0;
  const examples: GlyphMatch["examples"][number][] = [];
  for (const sample of samples) {
    for (const { word, shaped } of reference.shapeWords(sample.text, tag)) {
      if (word.trim() === "") continue;
      const model = glyphAdvances(models.freetype, word, { script: tag, shaping: "canvas" }).glyphs;
      words++;
      if (model.length === shaped.glyphs.length && model.every((glyph, i) => glyph === shaped.glyphs[i])) matched++;
      else {
        if (examples.length < 5) examples.push({ sample: sample.id, word, model, harfbuzz: shaped.glyphs });
        // The word stays in the counts above. The record also lists it when the two references disagree on its cluster.
        const rule = disagreementRules.find((candidate) => candidate.script === script && word.includes(candidate.cluster));
        if (rule !== undefined) disagreements.push({ rule: rule.id, sample: sample.id, font: id, word, model, harfbuzz: shaped.glyphs });
      }
    }
  }
  matches.push({ script, font: id, weight, words, matched, examples });
  return samples.length;
}

describe("the statistics of a cell", () => {
  it("keeps the sign of the worst error", () => {
    expect(worstSigned([0.5, -2, 1.5])).toBe(-2);
    expect(worstSigned([2, -2])).toBe(2);
  });

  it("gives no statistic for no error, and a point interval for equal errors", () => {
    expect(boundStatistics([], "empty")).toEqual({ n: 0, worst: null, p99: null });
    const flat = boundStatistics([-3, -3, -3], "flat", 200);
    expect(flat.worst).toEqual({ estimate: -3, low: -3, high: -3 });
    expect(flat.p99).toEqual({ estimate: 3, low: 3, high: 3 });
  });

  it("gives the HarfBuzz script of an OpenType tag", () => {
    expect(harfbuzzScript("deva")).toBe("Deva");
    expect(harfbuzzScript("DFLT")).toBe("Zyyy");
    expect(harfbuzzVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe.skipIf(folder === undefined)("HarfBuzz as the reference", () => {
  it.skipIf(!present(referenceId))(`gives the hmtx advance of each glyph of the corpus: ${referenceId}, with no GPOS and no kern`, { timeout: 120_000 }, () => {
    const bytes = bytesOf(referenceId);
    const tables = readTables(bytes);
    expect(tables.has("GPOS")).toBe(false);
    expect(tables.has("kern")).toBe(false);
    const hmtx = hmtxAdvances(tables);
    // The default instance: the scale is the units per em, and no variation applies
    const reference = openReferenceFont(bytes);
    const scripts = corpusFonts.find((font) => font.id === referenceId)!.scripts;
    let glyphs = 0;
    let mismatches = 0;
    for (const sample of corpus.filter((s) => scripts.includes(s.script))) {
      for (const { shaped } of reference.shapeWords(sample.text, scriptTags[sample.script])) {
        shaped.glyphs.forEach((glyph, i) => {
          glyphs++;
          if (shaped.advances[i] !== hmtx(glyph)) mismatches++;
        });
      }
    }
    checks["reference"] = { font: referenceId, scale: "unitsPerEm", instance: "default", glyphs, mismatches };
    expect(glyphs).toBeGreaterThan(0);
    expect(mismatches).toBe(0);
  });

  // Each font of the set at the default instance: the advance at the scale round(size × 64) is hmtx × size × 64 / unitsPerEm
  const scaling: Record<string, { glyphs: number; sizes: number; worst: number }> = {};
  checks["scaling"] = scaling;
  for (const source of [...corpusFonts.map((font) => ({ id: font.id as string, scripts: font.scripts })), { id: extraSource.id as string, scripts: ["latin"] as ScriptId[] }]) {
    it.skipIf(!present(source.id))(`scales each advance linearly with the size: ${source.id}`, { timeout: 120_000 }, () => {
      const bytes = bytesOf(source.id);
      const hmtx = hmtxAdvances(readTables(bytes));
      const model = readFont(bytes);
      const glyphs = [...new Set([0, ...codePointsOf(source.scripts).map((codePoint) => model.glyph(codePoint))])];
      const reference = openReferenceFont(bytes);
      let worst = 0;
      for (const size of boundSizes) {
        const scale = Math.round(size * 64);
        for (const glyph of glyphs) {
          const exact = (hmtx(glyph) * size * 64) / reference.unitsPerEm;
          // HarfBuzz rounds each advance to a whole unit of the scale, and the scale rounds size × 64 to a whole number
          const tolerance = 1 + (Math.abs(scale - size * 64) * hmtx(glyph)) / reference.unitsPerEm;
          const error = Math.abs(reference.glyphAdvance(glyph, scale) - exact);
          worst = Math.max(worst, error);
          expect(error, `${source.id} glyph ${glyph} at ${size} px`).toBeLessThanOrEqual(tolerance);
        }
      }
      scaling[source.id] = { glyphs: glyphs.length, sizes: boundSizes.length, worst };
    });
  }
});

describe.skipIf(folder === undefined)("the error of the fast path against HarfBuzz", () => {
  for (const script of scriptIds) {
    const ids = fontsFor(script).map((font) => font.id as string);
    const samples = lines.filter((sample) => sample.script === script);
    for (const id of ids) {
      it.skipIf(!present(id))(`measures each tier and engine: ${script} with ${id}`, { timeout: 600_000 }, () => {
        expect(measure(script, id, 400, samples)).toBeGreaterThan(0);
      });
    }
  }
  for (const weight of extraWeights) {
    it.skipIf(!present(extraSource.id))(`measures each tier and engine: Source Sans 3 at ${weight}`, { timeout: 600_000 }, () => {
      expect(measure("latin", extraSource.id, weight, lines.filter((sample) => sample.script === "latin"))).toBeGreaterThan(0);
    });
  }

  afterAll(() => {
    if (out === undefined || cells.length === 0) return;
    const scripts: Record<string, { words: number; matched: number; rate: number; low: number; high: number }> = {};
    for (const script of new Set(matches.map((match) => match.script))) {
      const rows = matches.filter((match) => match.script === script);
      const words = rows.reduce((total, row) => total + row.words, 0);
      const matched = rows.reduce((total, row) => total + row.matched, 0);
      const interval = wilson(matched, words);
      scripts[script] = { words, matched, rate: words === 0 ? 0 : matched / words, low: interval.low, high: interval.high };
    }
    const widths = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { devDependencies: Record<string, string> };
    const record = {
      schema: "typeset-harfbuzz-bounds/1",
      prediction: "typeset-t4-harfbuzz-bounds",
      runId: process.env["GITHUB_RUN_ID"] ?? null,
      platform: `${process.platform} ${release()} ${process.arch}`,
      harfbuzz: { version: harfbuzzVersion, harfbuzzjs: widths.devDependencies["harfbuzzjs"] },
      units: "1/64 px",
      error: "model width - HarfBuzz width",
      reference: { scale: "unitsPerEm", shaping: "each word of canvasWords alone", instance: "cssInstance(weight)" },
      corpus: { seed: 1, perCell: 40, lengthClass: "line", samples: lines.length, fingerprint: fingerprint(lines) },
      sizes: boundSizes,
      tiers,
      engines,
      bootstrap: { runs: bootstrapRuns, level: 0.95, worst: "the error with the largest absolute value", p99: "the 0.99 quantile of the absolute errors, linear" },
      knownOpen,
      checks,
      glyphMatch: { scripts, fonts: matches },
      referencesDisagree: { rules: disagreementRules, words: disagreements },
      cells,
    };
    // Each fraction keeps 4 decimals: 1/10 000 of 1/64 px is far below each error of the record
    const rounded = (_: string, value: unknown) => (typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 1e4) / 1e4 : value);
    writeFileSync(out, JSON.stringify(record, rounded) + "\n");
  });
});
