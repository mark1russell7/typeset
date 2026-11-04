import { createMeasurer, layoutText, TEXT_UNITS } from "@mark1russell7/layout-contract/text";
import { describe, expect, it } from "vitest";
import { buildTtf, characters } from "../../test/fonts.ts";
import { engines, measureWidth, readFont, type EngineName, type Font } from "../fonts.ts";
import { fontAdvance, parseFont, scriptTag } from "../measurer.ts";

// The test fonts: a static font, and a variable font with the axis wght from 100 to 900
const fixed = buildTtf();
const variable = buildTtf(true);
// The static font with no glyph for "o"
const noO = buildTtf(false, false, "hvar", characters.filter(([code]) => code !== 0x6f));
const names = Object.keys(engines) as EngineName[];

function expected(bytes: Uint8Array, engine: EngineName, text: string, size: number, instance?: Record<string, number>): number {
  const rules = engines[engine];
  const read = readFont(bytes, { deltas: rules.deltas, metrics: rules.metrics });
  const font: Font = instance === undefined ? read : read.at(instance);
  return measureWidth(font, text, size, { script: "latn", shaping: "canvas", rounding: rules.rounding, sum: rules.sum });
}

describe("parseFont", () => {
  it("reads the parts of a CSS font shorthand", () => {
    expect(parseFont("16px Noto Sans")).toEqual({ style: "normal", angle: 14, weight: 400, stretch: 100, size: 16, families: ["Noto Sans"] });
    expect(parseFont(`italic bold condensed 12pt/1.5 "Noto Serif", 'A B' ,serif`)).toEqual({
      style: "italic",
      angle: 14,
      weight: 700,
      stretch: 75,
      size: 16,
      families: ["Noto Serif", "A B", "serif"],
    });
    expect(parseFont("  oblique 10deg normal 300 20.5px / 2 A ")).toMatchObject({ style: "oblique", angle: 10, weight: 300, size: 20.5, families: ["A"] });
    expect(parseFont("lighter 1e1px A")).toMatchObject({ weight: 100, size: 10 });
    expect(parseFont("oblique .5deg .5px A")).toMatchObject({ angle: 0.5, size: 0.5 });
  });

  it("refuses the parts that it does not know", () => {
    for (const font of ["small-caps 16px A", "1em A", "16px", "caption", "16 A", "1001 16px A", "16px ,", "16.px A", "oblique 1.deg 16px A"]) {
      expect(() => parseFont(font), font).toThrow(RangeError);
    }
  });

  it("refuses a long run of digits in linear time", () => {
    const digits = "9".repeat(100_000);
    for (const font of [digits, `${digits}x 16px A`, `oblique ${digits}xdeg 16px A`, `${digits}.`, `16px ${digits}`]) {
      const start = performance.now();
      try {
        parseFont(font);
      } catch (error) {
        expect(error, "a refusal").toBeInstanceOf(RangeError);
      }
      expect(performance.now() - start, font.slice(0, 20)).toBeLessThan(50);
    }
  });
});

describe("scriptTag", () => {
  it("gives the tag of the first character of a script", () => {
    const cases: [string, string][] = [
      ["Hello", "latn"],
      ["12 مرحبا", "arab"],
      ["(שלום)", "hebr"],
      ["नमस्ते", "deva"],
      ["Ελλάδα", "grek"],
      ["Привет", "cyrl"],
      ["ไทย", "thai"],
      ["カタカナ", "kana"],
      ["漢字かな", "hani"],
      ["한국어", "hang"],
      ["😀👍🏽 1", "DFLT"],
      ["́", "DFLT"],
      ["", "DFLT"],
      ["ꦲꦏ꧀ꦱꦫ", "DFLT"],
    ];
    for (const [text, tag] of cases) expect(scriptTag(text), text).toBe(tag);
  });
});

describe("fontAdvance", () => {
  it("gives the width of measureWidth with the rules of each engine", () => {
    for (const engine of names) {
      const advance = fontAdvance({ faces: [{ family: "Test", data: fixed }], engine });
      for (const text of ["AVoT", "To AV", "ÁV", ""]) {
        for (const size of [13, 16.5]) expect(advance(text, `${size}px Test`), `${engine} ${text}`).toBe(expected(fixed, engine, text, size));
      }
    }
  });

  it("gives an instance of a variable face the weight of the font", () => {
    const advance = fontAdvance({ faces: [{ family: "Var", data: variable }], engine: "coretext" });
    for (const weight of [100, 400, 650, 900]) expect(advance("AVoT", `${weight} 13px Var`)).toBe(expected(variable, "coretext", "AVoT", 13, { wght: weight }));
    // A weight out of the range of the axis takes the end of the range
    expect(advance("AVoT", "1 13px Var")).toBe(expected(variable, "coretext", "AVoT", 13, { wght: 100 }));
    expect(fontAdvance({ faces: [{ family: "Var", data: variable }], engine: engines.coretext })("AVoT", "13px Var")).toBe(advance("AVoT", "13px Var"));
  });

  it("matches the weight and the style of a face as CSS does", () => {
    // Each face is the variable font at one weight. Thus the width tells which face the measurer took.
    const at = (weights: readonly number[], font: string): number => {
      const advance = fontAdvance({ faces: weights.map((weight) => ({ family: "W", data: variable, weight })), engine: "freetype" });
      return advance("AVoT", `${font} 13px W`);
    };
    const width = (weight: number): number => expected(variable, "freetype", "AVoT", 13, { wght: weight });
    const cases: [readonly number[], number, number][] = [
      [[300, 400, 700], 500, 400],
      [[300, 400], 600, 400],
      [[300, 400, 700], 350, 300],
      [[300, 500, 700], 450, 500],
      [[300, 600], 450, 300],
      [[500, 700], 300, 500],
      [[300, 900], 800, 900],
      [[200, 400], 700, 400],
    ];
    for (const [weights, weight, chosen] of cases) expect(at(weights, String(weight)), `${weights} ${weight}`).toBe(width(chosen));
    // A range holds the weight: the instance takes the weight
    expect(fontAdvance({ faces: [{ family: "W", data: variable, weight: [200, 800] }] })("AVoT", "650 13px W")).toBe(width(650));
    expect(fontAdvance({ faces: [{ family: "W", data: variable, weight: [200, 800] }] })("AVoT", "900 13px W")).toBe(width(800));

    const styled = fontAdvance({
      faces: [
        { family: "S", data: variable, weight: 300 },
        { family: "S", data: variable, weight: 700, style: "italic" },
      ],
    });
    expect(styled("AVoT", "italic 13px S")).toBe(width(700));
    expect(styled("AVoT", "oblique 13px S")).toBe(width(700));
    expect(styled("AVoT", "13px s")).toBe(width(300));
  });

  it("gives a cluster to the first family that holds each of its code points", () => {
    const noMark = buildTtf(false, false, "hvar", characters.filter(([code]) => code !== 0x301));
    const advance = fontAdvance({
      faces: [
        { family: "Base", data: noMark },
        { family: "Full", data: fixed },
      ],
      engine: "directwrite",
    });
    const base = (text: string): number => expected(noMark, "directwrite", text, 13);
    const full = (text: string): number => expected(fixed, "directwrite", text, 13);
    // The first family has the base and not the mark, so the later family takes both, as in the second pass of Blink
    expect(advance("A\u0301T", "13px Base, Full")).toBe(full("A\u0301") + base("T"));
    // A character with no ink needs no glyph, so the cluster stays on the first family
    expect(advance("A\u200dT", "13px Base, Full")).toBe(base("A\u200dT"));
  });

  it("measures each word alone at a change of family", () => {
    const advance = fontAdvance({
      faces: [
        { family: "Base", data: noO },
        { family: "Full", data: fixed },
      ],
      engine: "directwrite",
    });
    const base = (text: string): number => expected(noO, "directwrite", text, 13);
    const full = (text: string): number => expected(fixed, "directwrite", text, 13);
    expect(advance("AV Ao", "13px Base, Full")).toBeCloseTo(base("AV") + base(" ") + base("A") + full("o"), 9);
  });

  it("gives each run the first family with a glyph for its first character", () => {
    const advance = fontAdvance({
      faces: [
        { family: "Latin", data: noO },
        { family: "Other", data: variable, weight: 900 },
      ],
      engine: "directwrite",
    });
    const latin = (text: string): number => expected(noO, "directwrite", text, 13);
    const other = (text: string): number => expected(variable, "directwrite", text, 13, { wght: 900 });
    expect(advance("AoT", "13px Missing, Latin, Other")).toBe(latin("A") + other("o") + latin("T"));
    // The mark stays in the run of the character before it
    expect(advance("óA", "13px Latin, Other")).toBe(other("ó") + latin("A"));
    // No family has a glyph for "x": the run gets the first family
    expect(advance("AxV", "13px Latin, Other")).toBe(latin("AxV"));
    expect(advance("AoT", "13px Other, Latin")).toBe(other("AoT"));
  });

  it("gives the advance function of the measurer of layout-contract", () => {
    const measurer = createMeasurer(fontAdvance({ faces: [{ family: "Test", data: fixed }] }));
    const text = "AVoT To AV oo TA VoT AVo T";
    const layout = layoutText(text, { font: "16px Test", measurer, lineHeight: 20, wrapWidth: 60 });
    expect(layout.lineCount).toBeGreaterThan(1);
    expect(layout.lines.join(" ")).toBe(text);
    for (const width of layout.widths) expect(Number.isInteger(width * TEXT_UNITS)).toBe(true);
    expect(measurer.advance("AVoT", "16px Test")).toBe(Math.round(expected(fixed, "freetype", "AVoT", 16) * TEXT_UNITS));
  });

  it("refuses an engine that is not a row and a font with no face", () => {
    expect(() => fontAdvance({ faces: [], engine: "gdi" as EngineName })).toThrow(RangeError);
    const advance = fontAdvance({ faces: [{ family: "Test", data: fixed }] });
    expect(() => advance("A", "16px Other")).toThrow(RangeError);
    expect(() => advance("A", "16px")).toThrow(RangeError);
  });
});
