import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { wilson } from "@mark1russell7/rigor-statistics";
import { engines, measureWidth, readFont, type EngineName, type Font } from "@mark1russell7/typeset/fonts";
import { canvasWords, glyphAdvances, readTables } from "@mark1russell7/typeset/fonts/inspect";
import { fingerprint, fonts as corpusFonts, fontsFor, generateCorpus, scriptIds, type Sample, type ScriptId } from "@typeset/corpus";
import { afterAll, describe, expect, it } from "vitest";
import { boundSizes, boundsTable, tableMarks, withTable, type RecordCell, ruledWidth, type RuledWord, type WidthRule, bootstrapRuns, boundStatistics, hmtxAdvances, knownOpen, tierNames, tiers, worstSigned, type BoundStatistics, type TierName } from "./bounds.ts";
import { missingGlyphs } from "./compare.ts";
import { harfbuzzScript, harfbuzzVersion, openReferenceFont } from "./harfbuzz.ts";
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
  /** The rounding effect: HarfBuzz under the rule of the row minus HarfBuzz with no rounding. */
  readonly rounding: BoundStatistics;
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
/** The largest difference between ruledWidth on the advances of the model and measureWidth, for each engine row, in 1/64 px. */
const replicaDifference: Partial<Record<EngineName, number>> = {};
const noteReplica = (engine: EngineName, difference: number): void => {
  replicaDifference[engine] = Math.max(replicaDifference[engine] ?? 0, difference);
};
const disagreements: { rule: string; sample: string; font: string; word: string; model: readonly number[]; harfbuzz: readonly number[] }[] = [];

/** This function measures the line samples of one script with one font at one weight, and adds the cells and the glyph match. */
function measure(script: ScriptId, id: string, weight: number, samples: readonly Sample[]): number {
  const tag = scriptTags[script];
  const bytes = bytesOf(id);
  const reference = openReferenceFont(bytes, cssInstance(weight));
  const models = Object.fromEntries(engineNames.map((engine) => [engine, readFont(bytes, { instance: cssInstance(weight), deltas: engines[engine].deltas, metrics: engines[engine].metrics })])) as Record<EngineName, Font>;
  const missing = samples.filter((sample) => missingGlyphs(models.freetype, sample.text) > 0).length;
  // The shaping of HarfBuzz in font units does not depend on the size, so one shaping serves the sweep
  const baseOf = new Map<number, number>();
  const base = (glyph: number): number => {
    if (!baseOf.has(glyph)) baseOf.set(glyph, reference.glyphAdvance(glyph, reference.unitsPerEm));
    return baseOf.get(glyph)!;
  };
  const referenceWords: RuledWord[][] = samples.map((sample) =>
    reference.shapeWords(sample.text, tag).map(({ shaped }) => ({ advances: shaped.advances, bases: shaped.glyphs.map(base) })),
  );
  const exactRule: WidthRule = { rounding: "exact", sum: "exact" };
  for (const tier of tierNames) {
    for (const engine of engineNames) {
      const { rounding, sum } = engines[engine];
      const options = { ...tiers[tier], script: tag, shaping: "canvas", rounding, sum } as const;
      // The advances of the model for each word, so the replica check applies ruledWidth to the model too
      const modelWords: RuledWord[][] = samples.map((sample) =>
        canvasWords(sample.text).map((word) => {
          const { glyphs, advances } = glyphAdvances(models[engine], word, options);
          return { advances, bases: glyphs.map((glyph) => models[engine].advance(glyph)) };
        }),
      );
      for (const size of boundSizes) {
        const ruled = samples.map((_, i) => ruledWidth(referenceWords[i]!, size, reference.unitsPerEm, { rounding, sum }));
        const errors = samples.map((sample, i) => {
          const model = measureWidth(models[engine], sample.text, size, options);
          const replica = ruledWidth(modelWords[i]!, size, models[engine].unitsPerEm, { rounding, sum });
          noteReplica(engine, Math.abs(replica - model) * 64);
          return (model - ruled[i]!) * 64;
        });
        const effects = samples.map((_, i) => (ruled[i]! - ruledWidth(referenceWords[i]!, size, reference.unitsPerEm, exactRule)) * 64);
        const label = `${script}/${id}/${weight}/${size}/${tier}/${engine}`;
        const statistics = boundStatistics(errors, label);
        cells.push({ script, font: id, weight, size, tier, engine, missing, ...statistics, rounding: boundStatistics(effects, `${script}/${id}/${weight}/${size}/${engine}/rounding`) });
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
  });

  it("gives the worst model error of each script and tier, and the worst rounding effect, each with its place", () => {
    const table = boundsTable([cell("latin", "advances", 16, "freetype", 3), cell("latin", "advances", 96, "coretext", -40.04), cell("latin", "model", 8, "freetype", 0)]);
    expect(table.split("\n")[0]).toBe("| Script | Model error, `advances` | Model error, `kerned` | Model error, `model` | Rounding effect |");
    expect(table).toContain("| latin | -40.0 [-41.0, -39.0] (f 400, 96 px, coretext) | no data | 0.0 [-1.0, 1.0] (f 400, 8 px, freetype) | -20.0 [-20.0, -20.0] (f 400, 96 px, coretext) |");
    expect(boundsTable([cell("latin-extended", "model", 8, "freetype", 1)])).toContain("| latin-extended (open: T1e) |");
  });

  it("puts the table between the marks, and refuses a document with no marks", () => {
    const document = `a\n${tableMarks.start}\nold\n${tableMarks.end}\nb\n`;
    expect(withTable(document, "new")).toBe(`a\n${tableMarks.start}\nnew\n${tableMarks.end}\nb\n`);
    expect(() => withTable("a", "new")).toThrow();
  });
});

describe("ruledWidth", () => {
  const words = [{ advances: [600, 550], bases: [600, 580] }, { advances: [250], bases: [250] }];

  it("adds the advances with no rounding under the exact rule", () => {
    expect(ruledWidth(words, 16, 1000, { rounding: "exact", sum: "exact" })).toBeCloseTo((1400 * 16) / 1000, 12);
  });

  it("rounds the advance and the kerning of each glyph to whole px under the rule pixel", () => {
    // 9.6 px to 10, 9.28 px to 9 with the kerning -0.48 px to 0, and 4 px
    expect(ruledWidth(words, 16, 1000, { rounding: "pixel", sum: "exact" })).toBe(23);
    expect(ruledWidth(words, 16, 1000, { rounding: "pixel", sum: "float32" })).toBe(23);
  });

  it("adds each word in 1/65536 px and the words in single precision under the sum float32", () => {
    const width = ruledWidth(words, 15.333, 1000, { rounding: "exact", sum: "float32" });
    expect(Math.fround(width)).toBe(width);
    expect(Math.abs(width - (1400 * 15.333) / 1000)).toBeLessThan(0.001);
  });
});
