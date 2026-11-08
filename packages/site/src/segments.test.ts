import { generateSample } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import conformanceFile from "../data/conformance.json";
import { readConformance, segmentsOf, segmentView, type SegmentKind } from "./segments.ts";

const kinds: readonly SegmentKind[] = ["graphemes", "words", "lines"];

describe("segmentsOf", () => {
  it("adds the end of the text and ignores a cut outside the text", () => {
    expect(segmentsOf("ab cd", [{ offset: 3, required: false }, { offset: 0, required: true }, { offset: 9, required: true }])).toEqual([
      { text: "ab ", start: 0, required: false },
      { text: "cd", start: 3, required: false },
    ]);
  });

  it("gives no segment for an empty text", () => {
    expect(segmentsOf("", [{ offset: 0, required: true }])).toEqual([]);
  });

  it("keeps a required cut when the same offset also comes as an optional cut", () => {
    expect(segmentsOf("a\nb", [{ offset: 2, required: true }, { offset: 2, required: false }])[0]).toEqual({ text: "a\n", start: 0, required: true });
  });
});

describe("segmentView", () => {
  it("keeps a cluster of a base letter and a combining mark, and an emoji sequence, as one grapheme", () => {
    expect(segmentView("é\u{1F468}‍\u{1F469}‍\u{1F467}x", "graphemes").segments.map((segment) => segment.text)).toEqual([
      "é",
      "\u{1F468}‍\u{1F469}‍\u{1F467}",
      "x",
    ]);
  });

  it("divides words from the punctuation and the space", () => {
    expect(segmentView("Hello, world", "words").segments.map((segment) => segment.text)).toEqual(["Hello", ",", " ", "world"]);
  });

  it("marks the line break after a line feed as required", () => {
    const view = segmentView("one two\nthree", "lines");
    expect(view.segments.map((segment) => segment.text)).toEqual(["one ", "two\n", "three"]);
    expect(view.segments[1]!.required).toBe(true);
    expect(view.segments[0]!.required).toBe(false);
    expect(view.required).toBeGreaterThanOrEqual(1);
  });

  it("gives segments that join to the text, for each kind and each script of the corpus", () => {
    for (const script of ["latin", "han", "arabic", "devanagari", "thai"] as const) {
      const text = generateSample(1, script, "paragraph", 0).text;
      for (const kind of kinds) {
        const view = segmentView(text, kind);
        expect(view.segments.map((segment) => segment.text).join(""), `${script} ${kind}`).toBe(text);
        expect(view.segments.every((segment) => segment.text.length > 0)).toBe(true);
      }
    }
  });
});

describe("readConformance", () => {
  it("reads the committed record of CI", () => {
    const record = readConformance(conformanceFile);
    expect(record.unicodeVersion).toBe("17.0.0");
    expect(record.rows.filter((row) => row.function !== "canvasWords").every((row) => row.passed === row.total)).toBe(true);
  });

  it("refuses a count over the total", () => {
    expect(() => readConformance({ run: "1", head: "x", unicodeVersion: "17.0.0", runtime: "Node", rows: [{ function: "f", file: "F", passed: 2, total: 1 }] })).toThrow(/2 of 1/);
  });
});
