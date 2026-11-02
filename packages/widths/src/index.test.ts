import { fonts, generateCorpus, scriptIds, type Sample } from "@typeset/corpus";
import type { Font } from "@typeset/fonts";
import { describe, expect, it } from "vitest";
import {
  checkBounds,
  cssInstance,
  extraSource,
  fontSources,
  fractionsOf,
  missingGlyphs,
  probeCharacters,
  probeInstance,
  recordsOf,
  score,
  sourceUrl,
  summarize,
  tasksOf,
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
    at: (instance) => weighted(instance["wght"] ?? 400),
    glyph: (codePoint) => (codePoint < 128 ? codePoint : 0),
    advance: () => 500 + wght - 400,
    glyphClass: () => 0,
    kerning: () => [],
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
