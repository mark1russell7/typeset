import { readFileSync } from "node:fs";
import { measureWidth, type Font } from "@mark1russell7/typeset/fonts";
import type { Cell } from "@typeset/widths";
import { fontsCommit, scriptTags } from "@typeset/widths";
import { describe, expect, it } from "vitest";
import {
  allLeftOut,
  armMatrix,
  armOrder,
  engineForAgent,
  fontChoices,
  formatPx,
  formatSigned,
  heatLevel,
  labResult,
  previewFit,
  readSnapshot,
  scriptOrder,
  snapshotOf,
  stackLimit64,
  stackMatrix,
  stackWorstPx,
  statOf,
  sweepTask,
} from "./index.ts";

function cell(worstPx: number, n = 10): Cell {
  return { n, excluded: 0, worstPx, meanPx: worstPx / 2, p90Px: worstPx * 0.9, worstRelative: 0.001, pixelExact: 3, pixelWorstPx: 1.23456789, worst: { sample: "latin/line/1", font: "noto-sans", size: 16, error: -worstPx } };
}

function armFile(arm: string, engine: string, latinLine: number): Record<string, unknown> {
  return {
    schema: "typeset-font-widths/3",
    arm,
    scale: arm.endsWith("2") ? 2 : 1,
    platform: "test",
    chromium: "156.0",
    models: { engine, rounding: engine === "freetype" ? "pixel" : "exact" },
    corpus: { seed: 1, perCell: 40, samples: 1920, fingerprint: "6613968b" },
    fonts: { commit: "abc" },
    summary: { latin: { line: cell(latinLine * 10) } },
    engineSummary: { latin: { line: cell(latinLine), word: cell(latinLine / 2) }, greek: { line: cell(0.5) } },
    extraSummary: { "400": { line: cell(2) } },
    engineExtraSummary: { "400": { line: cell(0.25) }, "700": { line: cell(0.75) } },
    records: [{ big: "the snapshot leaves the records out" }],
  };
}

const run = { id: 1, branch: "main", sha: "0123456789", date: "2026-11-02" };

describe("snapshotOf", () => {
  it("keeps the summaries of each arm, in the order of the arms, with 4 digits and no records", () => {
    const snapshot = snapshotOf([armFile("windows-1", "directwrite", 0.0014), armFile("linux-1", "freetype", 4.123456)], run);
    expect(snapshot.arms.map((arm) => arm.arm)).toEqual(["linux-1", "windows-1"]);
    expect(snapshot.arms[0]!.engine).toBe("freetype");
    expect(snapshot.arms[0]!.rounding).toBe("pixel");
    expect(snapshot.arms[0]!.engineSummary.latin?.line?.worstPx).toBe(4.123);
    expect(snapshot.arms[0]!.engineSummary.latin?.line?.pixelWorstPx).toBe(1.235);
    expect(snapshot.arms[0]!.engineSummary.latin?.line?.worst?.error).toBe(-4.123);
    expect(snapshot.corpus.samples).toBe(1920);
    expect(JSON.stringify(snapshot)).not.toContain("records");
  });

  it("refuses a file of another schema and two files of one arm", () => {
    expect(() => snapshotOf([{ schema: "other" }], run)).toThrow(/schema/);
    expect(() => snapshotOf([armFile("linux-1", "freetype", 1), armFile("linux-1", "freetype", 2)], run)).toThrow(/two files/);
  });
});

describe("readSnapshot", () => {
  it("accepts a snapshot and refuses other data", () => {
    const snapshot = snapshotOf([armFile("linux-1", "freetype", 1)], run);
    expect(readSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(() => readSnapshot({ schema: "typeset-site-snapshot/1", arms: [] })).toThrow(/no arms/);
    expect(() => readSnapshot([])).toThrow(/schema/);
  });

  it("reads the committed snapshot of the site, with the four arms of the fonts run", () => {
    const snapshot = readSnapshot(JSON.parse(readFileSync(new URL("../data/ci-snapshot.json", import.meta.url), "utf8")));
    expect(snapshot.arms.map((arm) => arm.arm)).toEqual(armOrder);
    expect(snapshot.fontsCommit).toBe(fontsCommit);
    for (const arm of snapshot.arms) expect(arm.engineSummary.latin?.line?.n).toBeGreaterThan(0);
  });
});

describe("armMatrix", () => {
  const snapshot = snapshotOf([armFile("linux-1", "freetype", 4), armFile("windows-1", "directwrite", 0.001)], run);

  it("gives one row for each script with data, then one row for each weight of the extra font", () => {
    const rows = armMatrix(snapshot, "engine", "line", scriptOrder, "Extra");
    expect(rows.map((row) => row.key)).toEqual(["latin", "greek", "extra-400", "extra-700"]);
    expect(rows[3]!.label).toBe("Extra 700");
    expect(rows[0]!.cells.map((c) => statOf(c, "worstPx"))).toEqual([4, 0.001]);
  });

  it("uses the summary with no rounding for the model plain", () => {
    const rows = armMatrix(snapshot, "plain", "line", scriptOrder, "Extra");
    expect(rows.map((row) => row.key)).toEqual(["latin", "extra-400"]);
    expect(statOf(rows[0]!.cells[0], "worstPx")).toBe(40);
  });

  it("gives NaN for a missing cell and for a cell with no texts", () => {
    expect(statOf(undefined, "meanPx")).toBeNaN();
    expect(statOf(cell(1, 0), "worstPx")).toBeNaN();
  });
});

describe("the heat scale and the numbers", () => {
  it("puts each error into its bin by size, not by sign", () => {
    expect([0, 0.001, -0.002, 0.003, 0.04, 0.2, -0.9, 3, 600].map(heatLevel)).toEqual([0, 0, 0, 1, 2, 3, 4, 5, 6]);
    expect(heatLevel(Number.NaN)).toBe(-1);
  });

  it("gives more digits to a small value", () => {
    expect(formatPx(31.6)).toBe("31.60");
    expect(formatPx(0.0014)).toBe("0.0014");
    expect(formatPx(0.25)).toBe("0.250");
    expect(formatPx(0.00001)).toBe("≈ 0");
    expect(formatPx(Number.NaN)).toBe("–");
    expect(formatSigned(0.5)).toBe("+0.500");
    expect(formatSigned(-0.5)).toBe("-0.500");
  });
});

describe("the catalog", () => {
  it("picks the engine of the platform from the user agent", () => {
    expect(engineForAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156.0")).toBe("directwrite");
    expect(engineForAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/156.0")).toBe("coretext");
    expect(engineForAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/156.0")).toBe("freetype");
  });

  it("has the 11 fonts of the corpus and the extra font, at the pinned commit", () => {
    expect(fontChoices).toHaveLength(12);
    for (const choice of fontChoices) expect(choice.url).toContain(`/google/fonts/${fontsCommit}/`);
    expect(fontChoices.find((choice) => choice.id === "noto-sans-jp")?.scripts).toEqual(["han", "kana"]);
  });

  it("makes the task of a sweep from the CI corpus, at the 6 sizes", () => {
    const task = sweepTask("noto-sans", 400, ["latin", "greek"], 2);
    expect(task.sizes).toEqual([10, 12, 14, 16, 24, 48]);
    expect(task.samples).toHaveLength(2 * 3 * 2);
    expect(new Set(task.samples.map((sample) => sample.script))).toEqual(new Set(["latin", "greek"]));
  });
});

/** This function gives a font of the test: each code point is its own glyph with the advance 500 of 1000 units. U+0416 has no glyph. */
function testFont(): Font {
  const font: Font = {
    epoch: "test",
    unitsPerEm: 1000,
    axes: [],
    instance: {},
    coordinates: [],
    advanceSource: "hmtx",
    numGlyphs: 0x10000,
    glyph: (codePoint) => (codePoint === 0x416 ? 0 : codePoint),
    advance: (glyph) => (glyph === 0x20 ? 250 : 500),
    glyphClass: () => 1,
    kerning: () => [],
    substitutions: () => [],
    at: () => font,
  };
  return font;
}

describe("labResult", () => {
  it("gives the model width, the error and the canvas words, and the words add up to the text", () => {
    const result = labResult({ font: testFont(), text: "ab cd", size: 10, script: "latin", rounding: "exact" }, (text) => [...text].length * 5 + 0.25);
    expect(result.model).toBe(4 * 5 + 2.5);
    expect(result.canvas).toBe(25.25);
    expect(result.error).toBeCloseTo(-2.75, 12);
    expect(result.words.map((word) => word.text)).toEqual(["ab", " ", "cd"]);
    expect(result.words.map((word) => word.space)).toEqual([false, true, false]);
    expect(result.words.reduce((sum, word) => sum + word.model, 0)).toBe(result.model);
    expect(result.words[0]!.glyphs.map((glyph) => [glyph.text, glyph.advance, glyph.px])).toEqual([["a", 500, 5], ["b", 500, 5]]);
    expect(result.missing).toBe(0);
  });

  it("counts the characters with no glyph, and each CJK character is a word alone", () => {
    expect(labResult({ font: testFont(), text: "aЖ", size: 10, script: "cyrillic", rounding: "exact" }, () => 0).missing).toBe(1);
    expect(labResult({ font: testFont(), text: "かな", size: 10, script: "kana", rounding: "pixel" }, () => 0).words.map((word) => word.text)).toEqual(["か", "な"]);
  });

  it("gives the model the sum of the engine", () => {
    const font = testFont();
    const options = { script: scriptTags.latin, shaping: "canvas", rounding: "exact", sum: "float32" } as const;
    const result = labResult({ font, text: "ab cd ab", size: 13.3, script: "latin", rounding: "exact", sum: "float32" }, () => 0);
    expect(result.model).toBe(measureWidth(font, "ab cd ab", 13.3, options));
  });
});

describe("previewFit", () => {
  it("keeps a drawing that fits at the scale 1", () => {
    expect(previewFit(300, 330)).toBe(1);
  });
  it("scales a wider drawing to the box", () => {
    expect(previewFit(440, 330)).toBeCloseTo(0.75, 12);
  });
  it("stops at the minimum scale", () => {
    expect(previewFit(3000, 330)).toBe(0.5);
  });
  it("gives 1 when a size is not known", () => {
    expect(previewFit(440, 0)).toBe(1);
  });
});

describe("allLeftOut", () => {
  it("is true when every text of the row was left out", () => {
    expect(allLeftOut([{ ...cell(0, 0), excluded: 240 }, undefined])).toBe(true);
  });
  it("is false when a cell has widths", () => {
    expect(allLeftOut([{ ...cell(0, 0), excluded: 240 }, cell(0.1)])).toBe(false);
  });
  it("is false when nothing was left out", () => {
    expect(allLeftOut([cell(0, 0), undefined])).toBe(false);
  });
});

describe("stackMatrix", () => {
  const stacks = {
    list: [{ id: "latin-han", fonts: ["noto-sans", "noto-sans-jp"] }, { id: "all-scripts", fonts: ["noto-sans", "noto-sans-arabic"] }],
    cells: [
      { stack: "latin-han", size: 10, n: 30, excluded: 0, worst64: 0.4, worstSample: "latin-han:mixed:0" },
      { stack: "latin-han", size: 48, n: 30, excluded: 0, worst64: 1.123456 },
      { stack: "all-scripts", size: 10, n: 0, excluded: 30, worst64: 0 },
    ],
    records: [{ big: "the snapshot leaves the records out" }],
  };
  const snapshot = snapshotOf([{ ...armFile("linux-1", "freetype", 1), stacks }, armFile("windows-1", "directwrite", 1)], run);

  it("keeps the stack cells with 4 digits and the font list of each stack, with no records", () => {
    expect(snapshot.arms[0]!.stacks?.[1]?.worst64).toBe(1.123);
    expect(snapshot.arms[0]!.stacks?.[0]?.worstSample).toBe("latin-han:mixed:0");
    expect(snapshot.arms[1]!.stacks).toBeUndefined();
    expect(snapshot.stackFonts?.["latin-han"]).toEqual(["noto-sans", "noto-sans-jp"]);
    expect(JSON.stringify(snapshot)).not.toContain("records");
  });

  it("gives one row for each stack, with the cells of each arm, and the worst error over the sizes", () => {
    const rows = stackMatrix(snapshot);
    expect(rows.map((row) => row.stack)).toEqual(["latin-han", "all-scripts"]);
    expect(rows[0]!.fonts).toEqual(["noto-sans", "noto-sans-jp"]);
    expect(rows[0]!.cells.map((cells) => cells.length)).toEqual([2, 0]);
    expect(stackWorstPx(rows[0]!.cells[0]!)).toBeCloseTo(1.123 / 64, 12);
    expect(stackWorstPx(rows[0]!.cells[0]!) * 64).toBeLessThanOrEqual(stackLimit64);
    expect(stackWorstPx(rows[1]!.cells[0]!)).toBeNaN();
    expect(stackWorstPx([])).toBeNaN();
  });

  it("gives no rows for a run before T11", () => {
    expect(stackMatrix(snapshotOf([armFile("linux-1", "freetype", 1)], run))).toEqual([]);
  });
});
