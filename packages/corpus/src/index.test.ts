import { random as createRandom } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import {
  applyEdits,
  fingerprint,
  fontsFor,
  generateCorpus,
  generateEdits,
  generateSample,
  generateText,
  inRanges,
  isBoundary,
  lengthClassIds,
  lengthClasses,
  scriptIds,
  scripts,
  type Sample,
} from "./index.ts";

/** The fingerprint of the corpus at seed 1 with one sample per cell. A change of it is a change of every bench input. */
const SEED_1_FINGERPRINT = "687b7e4b";

function codePoints(text: string): number[] {
  return Array.from(text, (c) => c.codePointAt(0)!);
}

function hasLoneSurrogate(text: string): boolean {
  return /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
}

describe("generateText", () => {
  for (const script of scriptIds) {
    it(`gives exactly n code points of the script ${script}`, () => {
      const spec = scripts[script];
      const random = createRandom(11);
      for (const n of [1, 2, 7, 50, 500]) {
        const text = generateText(random, script, n);
        const points = codePoints(text);
        expect(points).toHaveLength(n);
        expect(hasLoneSurrogate(text)).toBe(false);
        if (spec.separator !== "") {
          expect(text.startsWith(spec.separator)).toBe(false);
          expect(text.endsWith(spec.separator)).toBe(false);
        }
        const punctuation = new Set(spec.punctuation.map((p) => p.codePointAt(0)!));
        const separator = spec.separator === "" ? -1 : spec.separator.codePointAt(0)!;
        for (const p of points) {
          const known = inRanges(p, spec.letters) || inRanges(p, spec.marks) || punctuation.has(p) || p === separator || (p >= 0x30 && p <= 0x39);
          expect(known, `U+${p.toString(16)} in ${script}`).toBe(true);
        }
      }
    });
  }

  it("puts marks in the scripts that have them", () => {
    const text = generateText(createRandom(5), "devanagari", 400);
    expect(codePoints(text).some((p) => inRanges(p, scripts.devanagari.marks))).toBe(true);
  });

  it("refuses a count that is not a positive integer", () => {
    expect(() => generateText(createRandom(1), "latin", 0)).toThrow(RangeError);
  });
});

describe("generateCorpus", () => {
  it("has each cell of script and length class, with lengths in the class", () => {
    const corpus = generateCorpus({ seed: 1, perCell: 2 });
    expect(corpus).toHaveLength(scriptIds.length * lengthClassIds.length * 2);
    for (const sample of corpus) {
      const [min, max] = lengthClasses[sample.lengthClass];
      const n = codePoints(sample.text).length;
      expect(n).toBeGreaterThanOrEqual(min);
      expect(n).toBeLessThanOrEqual(max);
      expect(fontsFor(sample.script).map((f) => f.id)).toContain(sample.font);
    }
  });

  it("gives a subset of the full corpus for fewer scripts", () => {
    const full = generateCorpus({ seed: 9, perCell: 1 });
    const part = generateCorpus({ seed: 9, perCell: 1, scripts: ["greek", "han"], lengthClasses: ["line"] });
    const byId = new Map(full.map((s): [string, Sample] => [s.id, s]));
    for (const sample of part) expect(byId.get(sample.id)).toEqual(sample);
    expect(generateSample(9, "han", "line", 0)).toEqual(byId.get("han/line/0"));
  });

  it("gives a different corpus for a different seed", () => {
    expect(fingerprint(generateCorpus({ seed: 1, perCell: 1 }))).not.toBe(fingerprint(generateCorpus({ seed: 2, perCell: 1 })));
  });

  it("corpus.fingerprint: has the recorded fingerprint at seed 1", () => {
    const value = fingerprint(generateCorpus({ seed: 1, perCell: 1 }));
    console.log(`corpus.fingerprint seed 1: ${value}`);
    expect(value).toMatch(/^[0-9a-f]{8}$/);
    expect(value).toBe(SEED_1_FINGERPRINT);
  });
});

describe("generateEdits", () => {
  for (const script of scriptIds) {
    it(`gives edits that fit the text, on code point boundaries, for ${script}`, () => {
      const base = generateSample(4, script, "paragraph", 0).text;
      const edits = generateEdits({ seed: 4, script, base, count: 300 });
      expect(edits).toHaveLength(300);
      let text = base;
      for (const edit of edits) {
        expect(isBoundary(text, edit.at)).toBe(true);
        if (edit.kind !== "insert") expect(isBoundary(text, edit.at + edit.length)).toBe(true);
        text = applyEdits(text, [edit]);
        expect(hasLoneSurrogate(text)).toBe(false);
      }
      expect(applyEdits(base, edits)).toBe(text);
      expect(new Set(edits.map((e) => e.kind))).toEqual(new Set(["insert", "delete", "replace"]));
    });
  }

  it("works from an empty text", () => {
    const edits = generateEdits({ seed: 1, script: "emoji", base: "", count: 50 });
    expect(hasLoneSurrogate(applyEdits("", edits))).toBe(false);
  });

  it("refuses an edit that does not fit", () => {
    expect(() => applyEdits("abc", [{ kind: "delete", at: 2, length: 5 }])).toThrow(RangeError);
  });
});
