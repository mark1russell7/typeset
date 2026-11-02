import { fonts, generateCorpus, scriptIds, type Sample } from "@typeset/corpus";
import type { Font } from "@typeset/fonts";
import { describe, expect, it } from "vitest";
import {
  advanceModelRow,
  checkBounds,
  engineRecords,
  diagnosticWeights,
  cssInstance,
  extraSource,
  fontSources,
  fractionsOf,
  missingGlyphs,
  probeCharacters,
  probeInstance,
  recordsOf,
  breakdownOf,
  exactDeltaErrors,
  score,
  scoreAdvances,
  scoreCauses,
  scoreEngines,
  scoreGsub,
  substitutionTrace,
  sourceUrl,
  summarizeFeatures,
  type FeatureRecord,
  summarize,
  tasksOf,
  type AdvanceModelRow,
  type ArmFile,
  type WidthRecord,
} from "./index.ts";

/**
 * A font with no glyph outside ASCII. Each ASCII character has the advance 500 plus the weight minus 400, with a weight
 * axis from 100 to 900.
 */
function weighted(wght = 400): Font {
  return {
    epoch: `test-${wght}`,
    unitsPerEm: 1000,
    numGlyphs: 128,
    axes: [{ tag: "wght", min: 100, default: 400, max: 900 }],
    instance: { wght },
    coordinates: [],
    advanceSource: "hmtx",
    at: (instance) => weighted(instance["wght"] ?? 400),
    glyph: (codePoint) => (codePoint < 128 ? codePoint : 0),
    advance: () => 500 + wght - 400,
    glyphClass: () => 0,
    kerning: () => [],
    substitutions: () => [],
  };
}

const ascii = weighted();

function sample(id: string, text: string, lengthClass: Sample["lengthClass"] = "line"): Sample {
  return { id, script: "latin", lengthClass, font: "noto-sans", size: 16, seed: 1, text };
}

describe("sources", () => {
  it("has one source for each font of the corpus", () => {
    expect(fontSources.map((source) => source.id).sort()).toEqual(fonts.map((font) => font.id).sort());
    for (const source of fontSources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encodes the brackets of a variable font name in the URL", () => {
    expect(sourceUrl(fontSources[0]!)).toMatch(/\/ofl\/notosans\/NotoSans%5Bwdth%2Cwght%5D\.ttf$/);
  });

  it("pins the extra font, which is not a font of the corpus", () => {
    expect(extraSource.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fonts.map((font) => font.id as string)).not.toContain(extraSource.id);
    expect(cssInstance(700)).toEqual({ wght: 700, wdth: 100 });
  });
});

describe("tasksOf", () => {
  it("gives each sample to each font that covers its script", () => {
    const samples = generateCorpus({ seed: 1, perCell: 2 });
    const tasks = tasksOf(samples, fontSources.map((source) => source.id), [10, 48]);
    const count = tasks.reduce((sum, task) => sum + task.samples.length, 0);
    expect(count).toBe(samples.reduce((sum, s) => sum + fonts.filter((font) => font.scripts.includes(s.script)).length, 0));
    expect(new Set(tasks.flatMap((task) => task.samples.map((s) => s.script)))).toEqual(new Set(scriptIds));
  });
});

describe("recordsOf", () => {
  it("gives the error as the table width minus the canvas width, for each size", () => {
    const task = { font: "noto-sans" as const, sizes: [10, 20], samples: [sample("a", "abcd"), sample("b", "xé")] };
    const records = recordsOf(task, ascii, [[20.5, 9], [40, 19]]);
    expect(records.map((r) => [r.sample, r.size, r.tables, r.error, r.missing, r.weight])).toEqual([
      ["a", 10, 20, -0.5, 0, 400],
      ["a", 20, 40, 0, 0, 400],
      ["b", 10, 10, 1, 1, 400],
      ["b", 20, 20, 1, 1, 400],
    ]);
    expect(missingGlyphs(ascii, "aéé")).toBe(2);
  });
});

describe("summarize and checkBounds", () => {
  const record = (script: WidthRecord["script"], error: number, missing = 0): WidthRecord => ({
    sample: `${script}-${error}`, script, lengthClass: "line", font: "noto-sans", weight: 400, size: 16, codePoints: 40, missing, canvas: 100, tables: 100 + error, error, pixel: 100,
  });

  it("leaves out the records with a missing glyph and keeps the worst absolute error", () => {
    const summary = summarize([record("latin", 0.1), record("latin", -0.4), record("latin", 9, 1)]);
    expect(summary.latin?.line).toMatchObject({ n: 2, excluded: 1, worstPx: 0.4, worstRelative: 0.004, worst: { error: -0.4 }, pixelExact: 2, pixelWorstPx: 0 });
  });

  it("checks each bound of the prediction on the line class", () => {
    const records = [
      ...(["latin", "greek", "cyrillic", "hebrew"] as const).map((s) => record(s, 0.3)),
      record("latin-extended", 1.5),
      ...(["han", "kana", "hangul"] as const).map((s) => record(s, 0)),
      record("arabic", 12),
    ];
    const outcomes = Object.fromEntries(checkBounds(summarize(records)).map((o) => [o.outcome, o.holds]));
    // devanagari has no record, so its bound does not hold
    expect(outcomes).toEqual({ specificBoundEuropean: true, specificBoundMarks: false, specificBoundCjk: true, specificShapingGap: false });
  });
});

describe("fractionsOf", () => {
  it("counts the widths on each grid and makes a histogram in steps of 1/64 px", () => {
    const fractions = fractionsOf([10, 10.5, 10.25, 10 + 3 / 64, 10.3]);
    expect(fractions).toMatchObject({ n: 5, whole: 1, half: 2, quarter: 3, sixtyFourth: 4 });
    expect(fractions.histogram).toHaveLength(64);
    expect([fractions.histogram[0], fractions.histogram[32], fractions.histogram[16], fractions.histogram[3], fractions.histogram[19]]).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("the instance probe", () => {
  it("leaves out the characters with no glyph, the spaces and the repeats", () => {
    expect(probeCharacters(ascii, ["ab a", "\u00e9c"])).toEqual(["a", "b", "c"]);
  });

  it("finds the weight of the canvas and tells when the model has a different instance", () => {
    const characters = ["a", "b"];
    // At 100 px, the weight 700 gives the advance 800 units, so 80 px for each character
    const canvas = [80, 80];
    expect(probeInstance("f", weighted(700), 700, characters, canvas, 100, "exact")).toMatchObject({ found: 700, tied: 1, minimumError: 0, matches: true });
    const wrong = probeInstance("f", weighted(400), 400, characters, canvas, 100, "exact");
    expect(wrong).toMatchObject({ found: 700, errorAtRequested: 60, matches: false });
  });
});

describe("score", () => {
  const cell = (worstPx: number) => ({ line: { worstPx } as never });
  const arm = (name: string, worstPx: number, quarter = 10): ArmFile => ({
    arm: name,
    instances: [{ font: "f", requested: 400, model: { wght: 400 }, characters: 2, found: 400, tied: 1, errorAtRequested: 0, minimumError: 0, matches: true }],
    fractions: { line: { n: 100, whole: 0, half: 0, quarter, sixtyFourth: 0, histogram: [] } },
    woff2Mismatches: name === "linux-1" ? 0 : null,
    summary: Object.fromEntries(["latin", "greek", "cyrillic", "hebrew", "latin-extended", "han", "kana", "hangul"].map((script) => [script, cell(worstPx)])),
    extraSummary: { "400": cell(worstPx), "700": cell(worstPx) },
  });

  it("holds each outcome when each arm is in its bounds", () => {
    const files = new Map(["linux-1", "linux-2", "macos-2", "windows-1"].map((name) => [name, arm(name, 0.05)]));
    expect(score(files).every((outcome) => outcome.holds)).toBe(true);
  });

  it("fails the outcomes of an arm with no file, and does not average the platforms", () => {
    const files = new Map([["linux-1", arm("linux-1", 0)], ["linux-2", arm("linux-2", 0.05, 80)], ["windows-1", arm("windows-1", 0.6)]]);
    const outcomes = Object.fromEntries(score(files).map((o) => [o.outcome, o.holds]));
    expect(outcomes).toMatchObject({
      specificInstanceMatch: false,
      specificDpr2Unrounded: false,
      specificBoundEuropeanLinux2: true,
      specificBoundEuropeanMac: false,
      specificBoundEuropeanWindows: false,
      specificBoundMarks: false,
      specificWoff2SameTables: true,
    });
  });
});

describe("the DOM diagnostic", () => {
  const feature = (group: FeatureRecord["group"], domError: number, ligature: number, kerning: number): FeatureRecord => ({
    group,
    font: "f",
    weight: 400,
    sample: `${group}-${ligature}`,
    size: 16,
    canvas: 100,
    dom: { default: 100 + domError, noLigatures: 100 + ligature, noKerning: 90 + kerning, spaceAll: 90 },
    model: { kerning: 100, noKerning: 90, shaped: 100 + domError },
  });

  it("gives the worst error of each setting against the model with the same features", () => {
    const summary = summarizeFeatures([feature("latin", 0.25, 0.5, 0), feature("latin", 0, -2.5, 0.125), feature("kana", 0, 0, 3.84)]);
    expect(summary.latin).toMatchObject({ n: 2, domAgainstCanvas: 0.25, noLigatures: 2.5, noKerning: 0.125, spaceAll: 0, worstNoLigatures: { sample: "latin--2.5", error: -2.5 } });
    expect(summary.kana?.noKerning).toBeCloseTo(3.84, 10);
  });

  it("gives the errors of the model with exact deltas, and a breakdown by font, weight and script", () => {
    const base = { lengthClass: "line", font: "f", weight: 400, size: 16, codePoints: 40, missing: 0, canvas: 100, tables: 100, pixel: 100 } as const;
    const records: WidthRecord[] = [
      { ...base, sample: "a", script: "hebrew", error: 0.4, exactDeltas: 100.05 },
      { ...base, sample: "b", script: "hebrew", error: -0.1, exactDeltas: 99.98 },
      { ...base, sample: "c", script: "hangul", error: 0, missing: 1, exactDeltas: 120 },
    ];
    expect(exactDeltaErrors(records).hebrew).toBeCloseTo(0.05, 10);
    expect(exactDeltaErrors(records).hangul).toBeUndefined();
    const [row] = breakdownOf(records, new Map([["a", "text a"]]));
    expect(row).toMatchObject({ font: "f", script: "hebrew", n: 2, worstPx: 0.4, meanPx: 0.25, exactShare: 0, worst: [{ sample: "a", text: "text a" }, { sample: "b" }] });
  });

  it("scores the causes on macOS and Windows, and fails an arm with no diagnostic", () => {
    const summary = summarizeFeatures([feature("latin", 0, 0.2, 0), feature("kana", 0, 0, 0.05), feature("extra-400", 0, 0.3, 0), feature("extra-700", 0, 0.3, 0)]);
    const file = (arm: string): ArmFile => ({ arm, instances: [], fractions: { line: fractionsOf([]) }, woff2Mismatches: null, summary: {}, extraSummary: {}, features: { summary }, exactDeltaErrors: { hangul: 0.05, hebrew: 0.02 } });
    expect(scoreCauses(new Map([["macos-2", file("macos-2")], ["windows-1", file("windows-1")]])).every((outcome) => outcome.holds)).toBe(true);
    const outcomes = Object.fromEntries(scoreCauses(new Map([["windows-1", file("windows-1")]])).map((o) => [o.outcome, o.holds]));
    expect(outcomes).toEqual({ specificDomMatchesCanvas: false, specificLigatureLatin: false, specificLigatureExtraWindows: true, specificUnroundedDeltasMac: false, specificKanaKerning: false });
  });
});

describe("the score of the GSUB pass", () => {
  it("bounds the default DOM width against the GSUB model, and the canvas errors of six scripts on Windows", () => {
    const record = (group: FeatureRecord["group"], shapedError: number): FeatureRecord => ({
      group,
      font: "f",
      weight: 400,
      sample: group,
      size: 16,
      canvas: 100,
      dom: { default: 100, noLigatures: 100, noKerning: 100, spaceAll: 100 },
      model: { kerning: 100, noKerning: 100, shaped: 100 + shapedError },
    });
    const summary = summarizeFeatures([record("latin", 0.03), record("kana", 0.2), record("extra-400", 0.01), record("extra-700", 0.01)]);
    const cells = Object.fromEntries(["greek", "cyrillic", "latin-extended", "hebrew", "hangul", "han"].map((script) => [script, { line: { worstPx: 0.001 } as never }]));
    const file = (arm: string): ArmFile => ({ arm, instances: [], fractions: { line: fractionsOf([]) }, woff2Mismatches: null, summary: cells, extraSummary: {}, features: { summary } });
    const outcomes = Object.fromEntries(scoreGsub(new Map([["macos-2", file("macos-2")], ["windows-1", file("windows-1")]])).map((o) => [o.outcome, o.holds]));
    expect(outcomes).toEqual({ specificLatinGsub: true, specificExtraGsubWindows: true, specificKanaMacDom: false, specificNoRegression: true });
    expect(scoreGsub(new Map()).some((o) => o.holds)).toBe(false);
  });
});

describe("the diagnostic of the advances", () => {
  // Two models give 800 units for each character, and the exact gvar model gives 800.5. The canvas agrees with gvar
  const round: Font = { ...weighted(700), coordinates: [0.5] };
  const exact: Font = { ...round, advance: () => 800.5 };

  it("gives the error of each model in font units, the best model and the difference of gvar and HVAR", () => {
    const row = advanceModelRow("f", 700, { HVAR: true, gvar: true }, { hvarRound: round, hvarExact: round, gvarRound: round, gvarExact: exact }, ["a", "b"], [400.25, 400.25], 500);
    expect(row.canvas.hvarRound).toEqual({ worst: 0.5, mean: -0.5, exactShare: 0 });
    expect(row.canvas.gvarExact).toEqual({ worst: 0, mean: 0, exactShare: 1 });
    expect(row.best).toBe("gvarExact");
    expect(row.gvarAgainstHvar).toBe(0.5);
    expect(row.defaultInstance).toBe(false);
    expect(row.worst[0]).toEqual({ character: "a", canvas: 800.5, models: { hvarRound: 800, hvarExact: 800, gvarRound: 800, gvarExact: 800.5 } });
  });

  it("has no comparison of gvar and HVAR when the font has only one of the tables", () => {
    const row = advanceModelRow("f", 700, { HVAR: false, gvar: true }, { gvarRound: round, gvarExact: exact }, ["a"], [800], 1000);
    expect(row.gvarAgainstHvar).toBeNull();
    expect(Object.keys(row.canvas)).toEqual(["gvarRound", "gvarExact"]);
    expect(row.best).toBe("gvarRound");
  });

  it("keeps the weights that the axis covers", () => {
    expect(diagnosticWeights(ascii, [400, 700, 1000])).toEqual([400, 700]);
    expect(diagnosticWeights({ ...ascii, axes: [] }, [700])).toEqual([400]);
  });
});

describe("the score of the instance advances", () => {
  const row = (font: string, weight: number, gvarAgainstHvar: number | null, defaultInstance = false) => ({ font, weight, gvarAgainstHvar, defaultInstance }) as AdvanceModelRow;
  const cells = Object.fromEntries(["latin", "greek", "cyrillic", "latin-extended", "hebrew", "hangul", "han"].map((script) => [script, { line: { worstPx: 0.001 } as never }]));
  const file = (arm: string, extra: number, advanceModels: AdvanceModelRow[] = []): ArmFile => ({
    arm,
    instances: [],
    fractions: { line: fractionsOf([]) },
    woff2Mismatches: null,
    summary: cells,
    extraSummary: { "400": { line: { worstPx: extra } as never }, "700": { line: { worstPx: extra / 2 } as never } },
    advanceModels,
  });

  it("counts the fonts where gvar matches HVAR away from the default instance, and bounds the extra font on each desktop arm", () => {
    const rows = [row("a", 400, 0, true), row("a", 700, 0.2), row("b", 700, 0.4), row("c", 700, 3), row("d", 700, null), row("e", 400, 0, true)];
    const files = new Map([["linux-1", file("linux-1", 1, rows)], ["windows-1", file("windows-1", 0.04)], ["macos-2", file("macos-2", 0.2)]]);
    const outcomes = Object.fromEntries(scoreAdvances(files).map((o) => [o.outcome, o.holds]));
    expect(outcomes).toEqual({ specificGvarMatchesHvar: true, specificExtraWindows: true, specificExtraMac: false, specificNoRegression: true });
    const one = new Map([["linux-1", file("linux-1", 1, rows.slice(0, 3).filter((r) => r.font !== "b"))]]);
    expect(scoreAdvances(one).every((o) => !o.holds)).toBe(true);
  });
});

describe("the model of the engine of an arm", () => {
  const record = (tables: number, pixel: number, canvas: number) => ({ sample: "latin/line/0", script: "latin", lengthClass: "line", font: "a", weight: 400, size: 16, codePoints: 3, missing: 0, canvas, tables, error: tables - canvas, pixel }) as WidthRecord;

  it("uses the width of the mode pixel for an engine that rounds each advance", () => {
    const records = [record(30.4, 30, 30), record(12.2, 13, 13)];
    expect(engineRecords(records, "pixel").map((r) => [r.tables, r.error])).toEqual([[30, 0], [13, 0]]);
    expect(engineRecords(records, "exact")).toEqual(records);
  });

  it("bounds the scripts and the extra font of the engine model on each arm", () => {
    const cells = (worst: number) => Object.fromEntries(["latin", "latin-extended", "greek", "cyrillic", "hebrew", "thai", "han", "hangul"].map((script) => [script, { line: { worstPx: worst } as never }]));
    const extra = (worst: number) => ({ "400": { line: { worstPx: worst } as never }, "700": { line: { worstPx: worst } as never } });
    const file = (arm: string, worst: number, extraWorst = 0): ArmFile => ({ arm, instances: [], fractions: { line: fractionsOf([]) }, woff2Mismatches: null, summary: {}, extraSummary: {}, engineSummary: cells(worst), engineExtraSummary: extra(extraWorst) });
    const files = new Map([["linux-1", file("linux-1", 0)], ["linux-2", file("linux-2", 0.005)], ["macos-2", file("macos-2", 0.001)], ["windows-1", file("windows-1", 0.001, 0.2)]]);
    expect(Object.fromEntries(scoreEngines(files).map((o) => [o.outcome, o.holds]))).toEqual({ specificEngineLinux: true, specificEngineOthers: false });
    const { engineSummary: _, ...older } = file("linux-1", 0);
    const old = new Map<string, ArmFile>([["linux-1", older], ["linux-2", file("linux-2", 0)]]);
    expect(scoreEngines(old).every((o) => !o.holds)).toBe(true);
  });
});

describe("the GSUB trace", () => {
  it("gives each lookup that changes the glyphs, with the change of the advances", () => {
    // A fake font: the lookup 3 makes the ligature "fi" (glyph 1), the lookup 5 changes nothing
    const font = {
      ...ascii,
      advance: (glyph: number) => (glyph === 1 ? 700 : 500),
      substitutions: () => [
        { index: 3, type: 4, flags: 0, features: ["liga"], apply: (glyphs: number[]) => void glyphs.splice(0, glyphs.length, ...(glyphs.join() === "102,105" ? [1] : glyphs)) },
        { index: 5, type: 1, flags: 0, features: ["calt"], apply: () => {} },
      ],
    } as Font;
    expect(substitutionTrace(font, "fi", "latn")).toEqual([{ lookup: 3, type: 4, flags: 0, features: ["liga"], glyphs: [2, 1], advance: -300, first: { at: 0, before: [102, 105], after: [1] } }]);
    expect(substitutionTrace(font, "ab", "latn")).toEqual([]);
  });
});
