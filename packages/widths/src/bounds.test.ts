import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { wilson } from "@mark1russell7/rigor-statistics";
import { engines, measureWidth, readFont, type EngineName, type Font } from "@mark1russell7/typeset/fonts";
import { canvasSegments, canvasWords, glyphAdvances, readTables } from "@mark1russell7/typeset/fonts/inspect";
import { fingerprint, fonts as corpusFonts, fontsFor, generateCorpus, scriptIds, type Sample, type ScriptId } from "@typeset/corpus";
import { afterAll, describe, expect, it } from "vitest";
import { boundSizes, boundsTable, tableMarks, withTable, type RecordCell, blinkScale, ruledWidth, type RuledWord, type WidthRule, bootstrapRuns, boundStatistics, hmtxAdvances, knownOpen, tierNames, tiers, worstSigned, type BoundStatistics, type TierName } from "./bounds.ts";
import { missingGlyphs } from "./compare.ts";
import { harfbuzzScript, harfbuzzVersion, openReferenceFont, type Shaped } from "./harfbuzz.ts";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. The restore command of `@typeset/pinned` gets them. A font with no file is skipped.
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
  /** The rounding effect: HarfBuzz under the rule of the row minus HarfBuzz with no rounding. */
  readonly rounding: BoundStatistics;
  /** The reference of the cell: HarfBuzz at the scale of Blink for the size. */
  readonly reference: "size-scale";
  /** The largest difference of the upem reference and the size-scale reference in font units, and the count of samples over the bound. */
  readonly referencePrecision: { readonly largest: number; readonly overBound: number };
  /** The model under the rule of the row minus the model with the read rules of HarfBuzz. No reference checks it yet (T4b). */
  readonly readEffect: BoundStatistics;
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
 * record gives other glyphs. T1f decided the rule below: Chrome is correct, and the build of harfbuzzjs leaves out the rule.
 */
const disagreementRules = [
  {
    id: "devanagari-vowel-sign-after-independent-vowel",
    script: "devanagari",
    cluster: "आै",
    model: "a dotted circle before the vowel sign",
    chrome: "Chromium 156.0.8078.4 gives the glyphs of the model (T1d, docs/FONTS.md). It uses HarfBuzz f5efbbef, a full build of the rule.",
    harfbuzz: "no dotted circle: HB_TINY of harfbuzzjs sets HB_NO_OT_SHAPER_VOWEL_CONSTRAINTS (T1f)",
  },
];
/** The largest difference between ruledWidth on the advances of the model and measureWidth, for each engine row, in 1/64 px. */
const replicaDifference: Partial<Record<EngineName, number>> = {};
const noteReplica = (engine: EngineName, difference: number): void => {
  replicaDifference[engine] = Math.max(replicaDifference[engine] ?? 0, difference);
};
/** The size-scale reference of one sample: its words in px, and the check of the upem reference against it. */
interface SizeReference {
  readonly words: readonly RuledWord[];
  /** The upem width minus the size-scale width, in font units. */
  readonly difference: number;
  /** The bound of the difference: 0.5 unit for each kerned glyph, and the rounding of the size scale for each glyph. */
  readonly bound: number;
}
const exactRule: WidthRule = { rounding: "exact", sum: "exact" };
/** The largest difference of the model error plus readEffect and the total error, in 1/64 px. */
let largestSumDifference = 0;
const noteSum = (difference: number): void => {
  largestSumDifference = Math.max(largestSumDifference, difference);
};
const disagreements: { rule: string; sample: string; font: string; word: string; model: readonly number[]; harfbuzz: readonly number[] }[] = [];

/** This function measures the line samples of one script with one font at one weight, and adds the cells and the glyph match. */
function measure(script: ScriptId, id: string, weight: number, samples: readonly Sample[]): number {
  const tag = scriptTags[script];
  const bytes = bytesOf(id);
  const reference = openReferenceFont(bytes, cssInstance(weight));
  const models = Object.fromEntries(engineNames.map((engine) => [engine, readFont(bytes, { instance: cssInstance(weight), deltas: engines[engine].deltas, metrics: engines[engine].metrics })])) as Record<EngineName, Font>;
  // HarfBuzz rounds each variation delta of an advance and keeps the metrics of each glyph, so the model error reads the font in that way
  const harfbuzzRead = readFont(bytes, { instance: cssInstance(weight), deltas: "round", metrics: "own" });
  const missing = samples.filter((sample) => missingGlyphs(models.freetype, sample.text) > 0).length;
  // measureWidth shapes each bidi segment alone under the sum float32, as Blink does, and each canvas word under the other rules
  const bySegment = (rule: WidthRule): boolean => rule.sum === "float32" && rule.rounding !== "pixel";
  const upem = reference.unitsPerEm;
  // The reference of each size: HarfBuzz at the scale of Blink, so each position is in 1/65536 px
  const references = new Map<number, { words: SizeReference[]; segments: SizeReference[] }>();
  for (const size of boundSizes) {
    const scale = blinkScale(size);
    const baseOf = new Map<number, number>();
    const base = (glyph: number): number => {
      if (!baseOf.has(glyph)) baseOf.set(glyph, reference.glyphAdvance(glyph, scale));
      return baseOf.get(glyph)!;
    };
    const atSize = (shaped: readonly Shaped[], atUpem: readonly Shaped[]): SizeReference => {
      const words = shaped.map(({ glyphs, advances }) => ({ bases: glyphs.map((glyph) => base(glyph) / 65536), kernings: advances.map((advance, i) => (advance - base(glyphs[i]!)) / 65536) }));
      const glyphs = shaped.reduce((total, { glyphs }) => total + glyphs.length, 0);
      const kerned = words.reduce((total, { kernings }) => total + kernings.filter((kerning) => kerning !== 0).length, 0);
      const upemUnits = atUpem.reduce((total, { advances }) => total + advances.reduce((sum, advance) => sum + advance, 0), 0);
      const sizeUnits = (ruledWidth(words, exactRule) * upem) / size;
      // Each position of the size scale is rounded to 1/65536 px, so the bound also has that rounding for each glyph
      return { words, difference: upemUnits - sizeUnits, bound: 0.5 * kerned + (glyphs * upem) / scale };
    };
    references.set(size, {
      words: samples.map((sample) => atSize(reference.shapeWords(sample.text, tag, scale).map(({ shaped }) => shaped), reference.shapeWords(sample.text, tag).map(({ shaped }) => shaped))),
      segments: samples.map((sample) => atSize(reference.shapeSegments(sample.text, tag, scale), reference.shapeSegments(sample.text, tag))),
    });
  }
  for (const tier of tierNames) {
    for (const engine of engineNames) {
      const { rounding, sum } = engines[engine];
      const rule: WidthRule = { rounding, sum };
      const options = { ...tiers[tier], script: tag, shaping: "canvas", rounding, sum } as const;
      // The advances of the model for each word, in font units, so the replica check applies ruledWidth to the model too
      const modelWords = samples.map((sample) =>
        (bySegment(rule) ? canvasSegments(sample.text) : canvasWords(sample.text)).map((word) => {
          const { glyphs, advances } = glyphAdvances(models[engine], word, options);
          return { glyphs, advances };
        }),
      );
      for (const size of boundSizes) {
        const shaped = bySegment(rule) ? references.get(size)!.segments : references.get(size)!.words;
        const pxPerUnit = size / models[engine].unitsPerEm;
        const widths = shaped.map(({ words }) => ruledWidth(words, rule));
        const readEffects: number[] = [];
        let sumDifference = 0;
        const errors = samples.map((sample, i) => {
          const model = measureWidth(models[engine], sample.text, size, options);
          const modelRead = measureWidth(harfbuzzRead, sample.text, size, options);
          const error = (modelRead - widths[i]!) * 64;
          readEffects.push((model - modelRead) * 64);
          sumDifference = Math.max(sumDifference, Math.abs(error + readEffects[i]! - (model - widths[i]!) * 64));
          const own = modelWords[i]!.map(({ glyphs, advances }) => ({
            bases: glyphs.map((glyph) => models[engine].advance(glyph) * pxPerUnit),
            kernings: glyphs.map((glyph, j) => (advances[j]! - models[engine].advance(glyph)) * pxPerUnit),
          }));
          noteReplica(engine, Math.abs(ruledWidth(own, rule) - model) * 64);
          return error;
        });
        noteSum(sumDifference);
        const effects = shaped.map(({ words }, i) => (widths[i]! - ruledWidth(words, exactRule)) * 64);
        const label = `${script}/${id}/${weight}/${size}/${tier}/${engine}`;
        const statistics = boundStatistics(errors, label);
        const precision = {
          largest: Math.max(...shaped.map(({ difference }) => Math.abs(difference))),
          overBound: shaped.filter(({ difference, bound }) => Math.abs(difference) > bound).length,
        };
        cells.push({
          script,
          font: id,
          weight,
          size,
          tier,
          engine,
          reference: "size-scale",
          missing,
          ...statistics,
          rounding: boundStatistics(effects, `${script}/${id}/${weight}/${size}/${engine}/rounding`),
          referencePrecision: precision,
          readEffect: boundStatistics(readEffects, `${label}/read`),
        });
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

  // The model error compares the two references under one rule only if ruledWidth applies the rule as measureWidth does
  it("applies the rule of each engine row as measureWidth does, on the advances of the model", () => {
    for (const engine of engineNames) expect(replicaDifference[engine] ?? 0, engine).toBeLessThan(1);
  });

  it("gives the total error as the model error plus readEffect in each cell", () => {
    expect(largestSumDifference).toBeLessThan(1e-6);
  });

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
    // A dimension stays in the record. This check shows when the engine rows carry no information, and a later change shows.
    const byCase = new Map<string, string[]>();
    for (const cell of cells) {
      const key = [cell.script, cell.font, cell.weight, cell.size, cell.tier].join("|");
      const statistics = JSON.stringify({ ...cell, engine: undefined });
      byCase.set(key, [...(byCase.get(key) ?? []), statistics]);
    }
    const unequal = [...byCase.entries()].filter(([, rows]) => new Set(rows).size > 1).map(([key]) => key);
    checks["engineRowsEqual"] = { equal: unequal.length === 0, cases: byCase.size, unequal: unequal.length, examples: unequal.slice(0, 5) };
    checks["readSum"] = { unit: "1/64 px", largestDifference: largestSumDifference };
    checks["ruleReplica"] = { unit: "1/64 px", largestDifference: replicaDifference };
    // HarfBuzz has no tiers, so the rounding effect of a cell does not depend on its tier
    const effects = new Map<string, Set<string>>();
    for (const cell of cells) {
      const key = [cell.script, cell.font, cell.weight, cell.size, cell.engine].join("|");
      effects.set(key, (effects.get(key) ?? new Set()).add(JSON.stringify(cell.rounding)));
    }
    checks["roundingSameForEachTier"] = [...effects.values()].every((values) => values.size === 1);
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
    // Each cell gets its own line, so a diff of the committed record shows each cell that changes
    const cellLines = cells.map((cell) => JSON.stringify(cell, rounded)).join(",\n");
    writeFileSync(out, JSON.stringify({ ...record, cells: "CELLS" }, rounded).replace('"cells":"CELLS"', () => `"cells":[\n${cellLines}\n]`) + "\n");
  });
});

describe("the table of the record", () => {
  const cell = (script: string, tier: RecordCell["tier"], size: number, engine: string, estimate: number): RecordCell => ({
    script,
    font: "f",
    weight: 400,
    size,
    tier,
    engine,
    n: 40,
    worst: { estimate, low: estimate - 1, high: estimate + 1 },
    p99: { estimate: Math.abs(estimate), low: 0, high: Math.abs(estimate) + 1 },
    rounding: { n: 40, worst: { estimate: estimate / 2, low: estimate / 2, high: estimate / 2 }, p99: null },
    readEffect: { n: 40, worst: { estimate: size === 96 ? 5 : 0, low: 0, high: 5 }, p99: null },
  });

  it("gives the worst model error of each script and tier, the worst rounding effect and the worst read effect, each with its place", () => {
    const table = boundsTable([cell("latin", "advances", 16, "freetype", 3), cell("latin", "advances", 96, "coretext", -40.04), cell("latin", "model", 8, "freetype", 0)]);
    expect(table.split("\n")[0]).toBe("| Script | Model error, `advances` | Model error, `kerned` | Model error, `model` | Rounding effect | Read effect |");
    expect(table).toContain("| latin | -40.0 [-41.0, -39.0] (f 400, 96 px, coretext) | no data | 0.0 [-1.0, 1.0] (f 400, 8 px, freetype) | -20.0 [-20.0, -20.0] (f 400, 96 px, coretext) | 5.0 [0.0, 5.0] (f 400, 96 px, coretext) |");
    expect(boundsTable([cell("latin-extended", "model", 8, "freetype", 1)])).toContain("| latin-extended |");
  });

  it("puts the table between the marks, and refuses a document with no marks", () => {
    const document = `a\n${tableMarks.start}\nold\n${tableMarks.end}\nb\n`;
    expect(withTable(document, "new")).toBe(`a\n${tableMarks.start}\nnew\n${tableMarks.end}\nb\n`);
    expect(() => withTable("a", "new")).toThrow();
  });
});

describe("ruledWidth", () => {
  // At 16 px and 1000 units per em: the advances 600, 580 and 250 units, and the kerning -30 units on the second glyph
  const words = [{ bases: [9.6, 9.28], kernings: [0, -0.48] }, { bases: [4], kernings: [0] }];

  it("adds the advances and the kerning with no rounding under the exact rule", () => {
    expect(ruledWidth(words, { rounding: "exact", sum: "exact" })).toBeCloseTo(22.4, 12);
  });

  it("rounds the advance and the kerning of each glyph to whole px under the rule pixel", () => {
    // 9.6 px to 10, 9.28 px to 9 with the kerning -0.48 px to 0, and 4 px
    expect(ruledWidth(words, { rounding: "pixel", sum: "exact" })).toBe(23);
    expect(ruledWidth(words, { rounding: "pixel", sum: "float32" })).toBe(23);
  });

  it("adds each word in 1/65536 px and the words in single precision under the sum float32", () => {
    const width = ruledWidth(words, { rounding: "exact", sum: "float32" });
    expect(Math.fround(width)).toBe(width);
    expect(Math.abs(width - 22.4)).toBeLessThan(0.0001);
  });

  it("gives the scale of HarfBuzz in Blink", () => {
    expect(blinkScale(16)).toBe(16 * 65536);
    expect(blinkScale(15.333)).toBe(Math.trunc(Math.fround(15.333) * 65536));
  });
});
