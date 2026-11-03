import { describe, expect, it } from "vitest";
import { Bytes, advances, assembleTtf, buildTtf, characters, lookup, substitutionTable, tableSet, variationStore } from "../../test/fonts.ts";
import { measureWidth, readFont, widthBound, type Font, type MeasureOptions } from "./index.ts";

/** This function builds a test font from the fixture. The value `null` of `gpos` removes the table. */
function fontOf({ gsub, gpos, kern, map = characters, widths = advances }: { gsub?: Bytes; gpos?: Bytes | null; kern?: Bytes; map?: readonly (readonly [number, number])[]; widths?: readonly number[] }): Font {
  const hmtx = new Bytes();
  for (const width of widths) hmtx.u16(width, 0);
  const replaced: Record<string, Bytes | undefined> = { hmtx, maxp: new Bytes().u32(0x00005000).u16(widths.length), GSUB: gsub, GPOS: gpos ?? undefined };
  const tables = tableSet(false, gsub !== undefined, "hvar", [...map].sort((a, b) => a[0] - b[0]))
    .filter(([tag]) => tag !== "GPOS" || gpos !== null)
    .map(([tag, body]): [string, Bytes] => [tag, replaced[tag] ?? body]);
  return readFont(assembleTtf(kern === undefined ? tables : [...tables, ["kern", kern]]));
}

const coverage = (...glyphs: number[]): Bytes => new Bytes().u16(1, glyphs.length, ...glyphs);
const single = (from: number, to: number): Bytes => new Bytes().u16(2, 8, 1, to).bytes(coverage(from));
/** This function builds a multiple substitution or an alternate substitution of one glyph. */
const multiple = (from: number, ...to: number[]): Bytes => new Bytes().u16(1, 8, 1, 14).bytes(coverage(from)).u16(to.length, ...to);
const ligature = (first: number, component: number, to: number): Bytes => new Bytes().u16(1, 8, 1, 14).bytes(coverage(first)).u16(1, 4).u16(to, 2, component);
const string = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);

/** This function builds a GPOS table of one PairPos subtable of format 1, with the value of the first glyph. */
function pairs(entries: readonly (readonly [first: number, second: number, value: number])[]): Bytes {
  const firsts = [...new Set(entries.map(([first]) => first))].sort((a, b) => a - b);
  const sets = firsts.map((first) => {
    const records = entries.filter((entry) => entry[0] === first).sort((a, b) => a[1] - b[1]);
    return new Bytes().u16(records.length, ...records.flatMap(([, second, value]) => [second, value & 0xffff]));
  });
  const cover = coverage(...firsts);
  let at = 10 + firsts.length * 2 + cover.length;
  const offsets = sets.map((set) => (at += set.length) - set.length);
  const pair = new Bytes().u16(1, 10 + firsts.length * 2, 0x4, 0, firsts.length, ...offsets).bytes(cover);
  for (const set of sets) pair.bytes(set);
  const lookupList = new Bytes().u16(1, 4).bytes(lookup(2, 0, pair));
  const featureList = new Bytes().u16(1).tag("kern").u16(8).u16(0, 1, 0);
  const scriptList = new Bytes().u16(1).tag("latn").u16(8).u16(4, 0).u16(0, 0xffff, 1, 0);
  return new Bytes().u32(0x00010000).u16(10, 10 + scriptList.length, 10 + scriptList.length + featureList.length).bytes(scriptList).bytes(featureList).bytes(lookupList);
}

const latin: MeasureOptions = { script: "latn" };
const plain: MeasureOptions = { ...latin, features: [] };
const rows: readonly MeasureOptions[] = [
  { script: "latn", shaping: "canvas", rounding: "pixel" },
  { script: "latn", shaping: "canvas", rounding: "exact", sum: "float32" },
  { script: "latn", shaping: "canvas", rounding: "exact" },
  { script: "latn" },
  { script: "latn", rounding: "pixel", kerning: false },
];
const sizes = [0.01, 1, 8, 10, 12, 13.5, 14, 14.16, 15.333, 16, 24, 48, 50, 72, 96, 1000];

/** This function examines the limit for each size and row, on each text of `length` characters of `set`. */
function expectHolds(font: Font, set: string, length: number, options: readonly MeasureOptions[] = rows): void {
  let texts = [""];
  for (let k = 0; k < length; k++) texts = texts.flatMap((text) => [...set].map((character) => text + character));
  for (const row of options) {
    const bound = widthBound(font, set, row);
    for (const text of texts) {
      for (const size of sizes) {
        const width = measureWidth(font, text, size, row);
        if (width > bound.width(text.length, size)) expect.fail(`${JSON.stringify(row)} at ${size} px: ${JSON.stringify(text)} has ${width}, over ${bound.width(text.length, size)}`);
      }
    }
  }
}

describe("the GSUB closure", () => {
  const fixture = readFont(buildTtf(false, true));

  it("takes the widest character, and the glyph 0 for a character with no glyph", () => {
    expect(widthBound(fixture, "Vo", plain)).toMatchObject({ advance: 580, glyphs: 1 });
    expect(widthBound(fixture, string(0x4e00), plain).advance).toBe(500);
  });

  it("gives 0 for an empty set and for an empty text", () => {
    expect(widthBound(fixture, "", latin)).toMatchObject({ advance: 0, kerning: 0, glyphs: 0 });
    expect(widthBound(fixture, "A", latin).width(0, 16)).toBe(0);
  });

  it("adds each glyph of a multiple substitution, behind an extension", () => {
    expect(widthBound(fixture, " ", { ...latin, features: ["ccmp"] })).toMatchObject({ advance: 500, glyphs: 2 });
    expect(fixture.substitutions("latn", ["ccmp"])[0]!.rules()).toEqual([[{ from: 5, to: [5, 5] }]]);
    expect(widthBound(fixture, " ", plain).glyphs).toBe(1);
  });

  it("charges a ligature to its first glyph, when the set has its components", () => {
    const font = fontOf({ gsub: substitutionTable([["liga", 0]], [lookup(4, 0, ligature(1, 2, 3))]), widths: [500, 600, 580, 2000, 300, 250, 560] });
    expect(widthBound(font, "AV", latin).advance).toBe(2000);
    expect(widthBound(font, "A", latin).advance).toBe(600);
    expect(measureWidth(font, "AV", 1000, { ...latin, kerning: false })).toBe(2000);
  });

  it("takes each alternate", () => {
    const font = fontOf({ gsub: substitutionTable([["aalt", 0]], [lookup(3, 0, multiple(1, 2, 6))]), widths: [500, 100, 580, 520, 300, 250, 560] });
    expect(widthBound(font, "A", { ...latin, features: ["aalt"] }).advance).toBe(580);
    expect(font.substitutions("latn", ["aalt"])[0]!.rules()).toEqual([[{ from: 1, to: [2] }, { from: 1, to: [6] }]]);
  });

  it("follows one lookup after another", () => {
    const gsub = substitutionTable([["ccmp", 0], ["liga", 1]], [lookup(2, 0, multiple(1, 2, 2)), lookup(2, 0, multiple(2, 6, 6))]);
    expect(widthBound(fontOf({ gsub }), "A", latin)).toMatchObject({ advance: 560 * 4, glyphs: 4 });
  });

  it("follows the lookups in each order only for the stages of a shaper", () => {
    const gsub = substitutionTable([["ccmp", 0], ["liga", 1]], [lookup(2, 0, multiple(2, 6, 6)), lookup(2, 0, multiple(1, 2, 2))]);
    const font = fontOf({ gsub });
    // One pass applies the lookup of V before the lookup that gives V
    expect(widthBound(font, "A", latin).advance).toBe(580 * 2);
    expect(measureWidth(font, "A", 1000, { ...latin, kerning: false })).toBe(580 * 2);
    expect(widthBound(font, "A", { script: "arab" }).advance).toBe(560 * 4);
  });

  it("stops a rule that expands its own glyph, after one pass or at the limit of the stages", () => {
    const font = fontOf({ gsub: substitutionTable([["ccmp", 0]], [lookup(2, 0, multiple(1, 1, 1))]) });
    expect(widthBound(font, "A", latin)).toMatchObject({ advance: 1200, glyphs: 2 });
    expect(widthBound(font, "A", { script: "arab" })).toMatchObject({ advance: 600 * 2 ** 16, glyphs: 2 ** 16 });
  });

  it("reads a reverse chaining substitution, and a coverage table of ranges", () => {
    const reverse = new Bytes().u16(1, 12, 0, 0, 1, 6).bytes(coverage(1));
    const ranges = new Bytes().u16(2, 10, 2, 3, 2).bytes(new Bytes().u16(2, 1, 1, 2, 0));
    const font = fontOf({ gsub: substitutionTable([["rclt", 0], ["smcp", 1]], [lookup(8, 0, reverse), lookup(1, 0, ranges)]) });
    expect(font.substitutions("latn", ["rclt"])[0]!.rules()).toEqual([[{ from: 1, to: [6] }]]);
    expect(font.substitutions("latn", ["smcp"])[0]!.rules()).toEqual([[{ from: 1, to: [3] }, { from: 2, to: [2] }]]);
  });

  describe("a context rule", () => {
    const nested = lookup(2, 0, multiple(1, 6, 6));
    const records = [0, 1];
    const classes = new Bytes().u16(1, 1, 1, 1);
    const cases: [string, number, Bytes][] = [
      ["a context of format 1", 5, new Bytes().u16(1, 8, 1, 14).bytes(coverage(1)).u16(1, 4).u16(1, 1, ...records)],
      ["a context of format 2", 5, new Bytes().u16(2, 12, 18, 2, 0, 26).bytes(coverage(1)).bytes(classes).u16(1, 4).u16(1, 1, ...records)],
      ["a context of format 3", 5, new Bytes().u16(3, 1, 1, 12, ...records).bytes(coverage(1))],
      ["a chained context of format 1", 6, new Bytes().u16(1, 8, 1, 14).bytes(coverage(1)).u16(1, 4).u16(1, 1, 1, 1, 1, 1, ...records)],
      ["a chained context of format 2", 6, new Bytes().u16(2, 16, 22, 22, 22, 2, 0, 30).bytes(coverage(1)).bytes(classes).u16(1, 4).u16(0, 1, 0, 1, ...records)],
      ["a chained context of format 3", 6, new Bytes().u16(3, 0, 1, 16, 0, 1, ...records).bytes(coverage(1))],
    ];

    for (const [name, type, body] of cases) {
      it(`reads the nested lookup of ${name}`, () => {
        const font = fontOf({ gsub: substitutionTable([["calt", 0]], [lookup(type, 0, body), nested]) });
        expect(font.substitutions("latn", ["calt"])[0]!.rules()).toEqual([[], [{ from: 1, to: [6, 6] }]]);
        expect(widthBound(font, "A", latin).advance).toBe(1120);
      });
    }

    it("follows two nested lookups in each order", () => {
      const body = new Bytes().u16(3, 1, 2, 16, 0, 2, 0, 1).bytes(coverage(1));
      const gsub = substitutionTable([["calt", 0]], [lookup(5, 0, body), lookup(2, 0, multiple(2, 6, 6)), lookup(2, 0, multiple(1, 2, 2))]);
      expect(widthBound(fontOf({ gsub }), "A", latin).advance).toBe(560 * 4);
    });

    it("stops at a lookup that nests itself", () => {
      const body = new Bytes().u16(3, 1, 2, 16, 0, 0, 0, 1).bytes(coverage(1));
      expect(widthBound(fontOf({ gsub: substitutionTable([["calt", 0]], [lookup(5, 0, body), nested]) }), "A", latin).advance).toBe(1120);
    });
  });

  it("includes the features of the joining stages", () => {
    const font = fontOf({ gsub: substitutionTable([["init", 0]], [lookup(1, 0, single(1, 6))]), widths: [500, 100, 580, 520, 300, 250, 900], map: [[0x628, 1], [0x20, 5]] });
    const set = string(0x628, 0x20);
    expect(widthBound(font, set, { script: "arab" }).advance).toBe(900);
    expect(widthBound(font, set, { script: "arab", joining: false }).advance).toBe(250);
    expectHolds(font, set, 3, [{ script: "arab" }, { script: "arab", shaping: "canvas", rounding: "pixel" }]);
  });
});

describe("the Indic shaper", () => {
  const deva: MeasureOptions = { script: "deva" };
  const circle = 900;
  const widths = [500, 600, 580, 3000, 300, 250, circle];
  const small = [100, 600, 580, 520, 50, 250, 560];

  it("charges a dotted circle to each character", () => {
    const font = fontOf({ gpos: null, widths, map: [[0x93f, 1], [0x25cc, 6]] });
    expect(widthBound(font, string(0x93f), deva)).toMatchObject({ advance: 600 + circle, glyphs: 2 });
    expect(measureWidth(font, string(0x93f), 1000, deva)).toBe(600 + circle);
    expect(widthBound(font, string(0x93f), { ...deva, indic: false }).advance).toBe(600);
  });

  it("charges the glyph 0 for the circle of a vowel constraint in a font with no circle", () => {
    const font = fontOf({ gpos: null, widths: [2000, 600, 580, 520, 300, 250, 560], map: [[0x905, 1], [0x93e, 2]] });
    expect(measureWidth(font, string(0x905, 0x93e), 1000, deva)).toBe(600 + 2000 + 580);
    expect(widthBound(font, string(0x905, 0x93e), deva).advance).toBe(600 + 2000);
  });

  it("charges the parts of a decomposition, and keeps U+0931 whole", () => {
    const font = fontOf({ gpos: null, widths: small, map: [[0x915, 1], [0x93c, 2], [0x958, 3], [0x930, 5], [0x931, 6]] });
    expect(measureWidth(font, string(0x958), 1000, deva)).toBe(1180);
    expect(widthBound(font, string(0x958), deva)).toMatchObject({ advance: 1180 + 200, glyphs: 4 });
    expect(widthBound(font, string(0x931), deva).advance).toBe(560 + 100);
  });

  it("charges a composite that is not in the set to its starter", () => {
    const font = fontOf({ gpos: null, widths, map: [[0x928, 1], [0x93c, 4], [0x929, 3], [0x25cc, 6]] });
    expect(measureWidth(font, string(0x928, 0x93c), 1000, deva)).toBe(3000);
    expect(widthBound(font, string(0x928, 0x93c), deva).advance).toBe(3000 + circle);
    expect(widthBound(font, string(0x928), deva).advance).toBe(600 + circle);
  });

  it("composes again after a composite", () => {
    const font = fontOf({ gpos: null, widths: [100, 600, 580, 520, 50, 250, 4000], map: [[0x75, 1], [0x308, 2], [0x304, 3], [0xfc, 5], [0x1d6, 6]] });
    expect(widthBound(font, string(0x75, 0x308, 0x304), deva).advance).toBe(4000 + 100);
  });

  it("includes each feature of the shaper", () => {
    const font = fontOf({ gsub: substitutionTable([["blwf", 0]], [lookup(1, 0, single(1, 6))]), gpos: null, map: [[0x915, 1]], widths: [100, 600, 580, 520, 50, 250, 900] });
    expect(widthBound(font, string(0x915), { ...deva, features: [] }).advance).toBe(900 + 100);
  });

  it("holds for each short text", () => {
    const font = fontOf({ gpos: null, widths, map: [[0x915, 1], [0x93f, 2], [0x94d, 4], [0x93c, 3], [0x25cc, 6]] });
    expectHolds(font, string(0x915, 0x93f, 0x94d, 0x93c), 4, [deva, { ...deva, rounding: "pixel" }]);
  });
});

describe("the kerning", () => {
  it("takes only the positive values of the pairs of the closure", () => {
    const font = readFont(buildTtf(false, true));
    expect(widthBound(font, "AV", plain).kerning).toBe(10);
    expect(widthBound(font, "To", plain).kerning).toBe(0);
    expect(font.kerning("latn").map((table) => table.largest(new Set([1, 2])))).toEqual([{ first: 0, second: 0 }, { first: 0, second: 10 }]);
  });

  it("is 0 with the option kerning false, and with no pair in the set", () => {
    const font = fontOf({ gpos: pairs([[1, 2, 70]]) });
    expect(widthBound(font, "AV", latin).kerning).toBe(70);
    expect(widthBound(font, "AV", { ...latin, kerning: false }).kerning).toBe(0);
    expect(widthBound(font, "A", latin).kerning).toBe(0);
  });

  it("reads the pairs of the kern table", () => {
    const kern = new Bytes().u16(0, 1).u16(0, 14 + 12, 0x0001, 2, 0, 0, 0).u16(1, 2, 90).u16(2, 1, (-40) & 0xffff);
    const font = fontOf({ gpos: null, kern });
    expect(widthBound(font, "AV", latin).kerning).toBe(90);
    expect(widthBound(font, "Vo", latin).kerning).toBe(0);
  });

  it("uses the values of the instance", () => {
    const classes = new Bytes().u16(2, 1).u16(4, 4, 3);
    const gdef = new Bytes().u32(0x00010003).u16(18, 0, 0, 0, 0).u32(18 + classes.length).bytes(classes).bytes(variationStore([100]));
    const font = readFont(assembleTtf(tableSet(true).map(([tag, body]): [string, Bytes] => [tag, tag === "GDEF" ? gdef : body])));
    expect(widthBound(font, "AV", plain).kerning).toBe(10);
    // The delta at wght 900 is 100, so the pair A V has the value -80 + 100
    expect(widthBound(font.at({ wght: 900 }), "AV", plain).kerning).toBe(30);
  });
});

describe("the normalization", () => {
  // The fixture makes the glyph 4 a mark, so it has no advance
  const map: [number, number][] = [[0x55, 1], [0x31b, 4], [0x1af, 3], [0xe9, 5], [0x65, 2], [0x301, 6]];
  const widths = [500, 100, 100, 1000, 0, 1200, 0];

  it("composes a base and a mark in the model", () => {
    expect(measureWidth(fontOf({ map, widths, gpos: null }), string(0x55, 0x31b), 1000)).toBe(1000);
  });

  it("counts a composite that only a mark of the set can give", () => {
    const font = fontOf({ map, widths, gpos: null });
    const bound = widthBound(font, string(0x55, 0x31b));
    expect(bound.advance).toBe(1000);
    expect(measureWidth(font, string(0x55, 0x31b), 1000)).toBeLessThanOrEqual(bound.width(2, 1000));
  });

  it("counts a character that keeps its form when its parts are narrower", () => {
    expect(widthBound(fontOf({ map, widths, gpos: null }), string(0xe9)).advance).toBe(1200);
  });

  it("counts the parts of a character that decomposes when they are wider", () => {
    const wide = [500, 100, 400, 1000, 0, 150, 300];
    expect(widthBound(fontOf({ map, widths: wide, gpos: null }), string(0xe9)).advance).toBe(700);
  });
});

describe("the margins", () => {
  const font = fontOf({ gpos: pairs([[1, 2, 70]]) });
  const noKerning = readFont(buildTtf());
  const options: MeasureOptions = { ...latin, kerning: false };
  const float32: MeasureOptions = { ...latin, shaping: "canvas", rounding: "exact", sum: "float32" };

  it("adds only a small relative part with no rounding", () => {
    const bound = widthBound(noKerning, "A", options);
    expect(bound.width(3, 16)).toBeGreaterThan(28.8);
    expect(bound.width(3, 16) / 28.8 - 1).toBeLessThan(2 ** -39);
  });

  it("adds 0.5 + 1/128 px to a pixel advance", () => {
    const bound = widthBound(noKerning, "A", { ...options, rounding: "pixel" });
    expect(bound.width(1, 14.16)).toBeCloseTo(8.496 + 0.5 + 1 / 128, 9);
    // The grid of 26.6 gives 8.5 px, and the rounding gives 9 px: this is more than 0.5 px over the advance
    expect(measureWidth(noKerning, "A", 14.16, { ...options, rounding: "pixel" })).toBe(9);
    expect(bound.width(1, 14.16)).toBeGreaterThanOrEqual(9);
    expect(widthBound(noKerning, "A", { ...options, rounding: "pixel", sum: "float32" }).width(1, 14.16)).toBe(bound.width(1, 14.16));
  });

  it("adds 0.5 px for the kerning of a pixel glyph, and counts each glyph", () => {
    const rounding = { ...latin, rounding: "pixel" } as const;
    expect(widthBound(font, "AV", rounding).width(1, 10)).toBeCloseTo(6.7 + 1 + 1 / 128, 9);
    expectHolds(font, "AV", 4, [rounding]);
    const gsub = substitutionTable([["ccmp", 0]], [lookup(2, 0, multiple(1, 2, 2))]);
    expect(widthBound(fontOf({ gsub, gpos: null }), "A", { ...latin, rounding: "pixel" }).width(1, 10)).toBeCloseTo(11.6 + 2 * (0.5 + 1 / 128), 9);
  });

  it("gives the float32 sum one rounding for each UTF-16 unit, with a margin for each position", () => {
    const units = 600 + 70 + 2 * 5 * 2 ** -24 * 2 ** 15;
    const position = (2 * (1.5 + 2 ** 16 / 1000)) / 65536;
    const expected = 1000 * ((units * 16) / 1000 + position) * (1 + 2 ** -24) ** 1006;
    expect(widthBound(font, "AV", float32).width(1000, 16)).toBeCloseTo(expected * (1 + (2 ** 13 + 1000) * 2 ** -53), 6);
  });

  it("holds for each short text at each size", () => {
    expectHolds(readFont(buildTtf(false, true)), "AVTo " + string(0x301), 3);
    const gsub = substitutionTable([["ccmp", 0]], [lookup(2, 0, multiple(1, 2, 2))]);
    expectHolds(fontOf({ gsub, gpos: pairs([[1, 2, 70], [2, 1, -3], [2, 2, 40]]) }), "AV ", 4);
  });

  it("holds for a negative kerning near 0, with an advance of 0", () => {
    expectHolds(fontOf({ gpos: pairs([[1, 2, -1], [2, 1, -1]]), widths: [0, 0, 0, 0, 0, 0, 0] }), "AV", 4);
  });

  it("holds for a long text", () => {
    const set = "AV " + string(0x301);
    const text = set.repeat(5000);
    const bound = widthBound(font, set, float32);
    for (const size of [8, 13.5, 15.333, 96]) expect(measureWidth(font, text, size, float32)).toBeLessThanOrEqual(bound.width(text.length, size));
    const variable = readFont(buildTtf(true), { instance: { wght: 533 } });
    const fractions = "AVo ".repeat(20000);
    const limit = widthBound(variable, "AVo ", plain);
    for (const size of [8, 15.333, 96]) expect(measureWidth(variable, fractions, size, plain)).toBeLessThanOrEqual(limit.width(fractions.length, size));
  });

  it("counts a surrogate pair as one character and two units", () => {
    const emoji = fontOf({ gpos: null, map: [[0x1f600, 1]] });
    const bound = widthBound(emoji, string(0x1f600), latin);
    expect(measureWidth(emoji, string(0x1f600, 0x1f600), 16, latin)).toBeLessThanOrEqual(bound.width(4, 16));
  });
});
