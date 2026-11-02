import { fonts, generateCorpus, scriptIds, type Sample } from "@typeset/corpus";
import type { Font } from "@typeset/fonts";
import { describe, expect, it } from "vitest";
import { checkBounds, fontSources, missingGlyphs, recordsOf, sourceUrl, summarize, tasksOf, type WidthRecord } from "./index.ts";

/** A font with the advance 500 for each ASCII character and no glyph for the other characters. */
const ascii: Font = {
  epoch: "test",
  unitsPerEm: 1000,
  numGlyphs: 128,
  glyph: (codePoint) => (codePoint < 128 ? codePoint : 0),
  advance: () => 500,
  glyphClass: () => 0,
  kerning: () => [],
};

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
    expect(records.map((r) => [r.sample, r.size, r.tables, r.error, r.missing])).toEqual([
      ["a", 10, 20, -0.5, 0],
      ["a", 20, 40, 0, 0],
      ["b", 10, 10, 1, 1],
      ["b", 20, 20, 1, 1],
    ]);
    expect(missingGlyphs(ascii, "aéé")).toBe(2);
  });
});

describe("summarize and checkBounds", () => {
  const record = (script: WidthRecord["script"], error: number, missing = 0): WidthRecord => ({
    sample: `${script}-${error}`, script, lengthClass: "line", font: "noto-sans", size: 16, codePoints: 40, missing, canvas: 100, tables: 100 + error, error,
  });

  it("leaves out the records with a missing glyph and keeps the worst absolute error", () => {
    const summary = summarize([record("latin", 0.1), record("latin", -0.4), record("latin", 9, 1)]);
    expect(summary.latin?.line).toMatchObject({ n: 2, excluded: 1, worstPx: 0.4, worstRelative: 0.004, worst: { error: -0.4 } });
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
