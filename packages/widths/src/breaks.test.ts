import type { Font } from "@mark1russell7/typeset/fonts";
import { describe, expect, it } from "vitest";
import { breakCells, breakRecord, linesOf, sameLines, widthKey, withRunWidths } from "./breaks.ts";

/** This function makes a font that has the glyphs of a text. The test needs only the method `glyph`. */
const fontWith = (text: string): Font => ({ glyph: (code: number) => (text.includes(String.fromCodePoint(code)) ? 1 : 0) }) as unknown as Font;

describe("linesOf", () => {
  it("starts a line at a cluster more than half a line below the line, and keeps a cluster with no rectangle on its line", () => {
    const clusters = [..."ab cd"].map((text, i) => ({ text, middle: i < 2 ? 8 : i === 2 ? Number.NaN : 28 }));
    expect(linesOf(clusters, 20)).toEqual(["ab", "cd"]);
    // A fallback font with a larger ascent moves the middle of its cluster less than half a line.
    expect(linesOf([{ text: "a", middle: 8 }, { text: "字", middle: 13 }, { text: "b", middle: 8 }], 20)).toEqual(["a字b"]);
    expect(linesOf([], 20)).toEqual([]);
  });
});

describe("the records", () => {
  it("compares the lines without the spaces at their ends, and counts each stack and set", () => {
    expect(sameLines(["a b", "c"], ["a b ", "c"])).toBe(true);
    expect(sameLines(["a b", "c"], ["a", "b c"])).toBe(false);
    const same = breakRecord("s", { id: "x", kind: "mixed", text: "a b c" }, 16, 128, ["a b", "c"], ["a b ", "c"]);
    const other = breakRecord("s", { id: "y", kind: "mixed", text: "a b c" }, 16, 128, ["a b", "c"], ["a", "b c"]);
    const drawn = breakRecord("s", { id: "z", kind: "drawn", text: "a" }, 10, 80, ["a"], ["a"]);
    const han = breakRecord("s", { id: "h", kind: "mixed", text: "ab 字字字" }, 16, 128, ["ab 字字", "字"], ["ab", "字字字"]);
    expect(same).toMatchObject({ set: "covered", model: ["a b", "c"], same: true });
    expect(same.cause).toBeUndefined();
    expect(other.cause).toBe("width");
    expect(han.cause).toBe("opportunity");
    expect(breakCells([same, other, drawn, han])).toEqual([
      { stack: "s", set: "covered", n: 3, same: 1, opportunity: 1, width: 1, firstDifferent: "y 16px 128px" },
      { stack: "s", set: "uncovered", n: 1, same: 1, opportunity: 0, width: 0 },
    ]);
  });
});

describe("withRunWidths", () => {
  it("gives each missing run its canvas width after its cluster, and asks for a width that it does not have", () => {
    // The model gives each character 1 px. The canvas gives " b" 3 px and " " 1 px, so "b" is 2 px wide in the system font.
    const advance = (text: string): number => [...text].length;
    const fonts = [fontWith("a ")];
    const canvas = new Map([[widthKey("f", " b"), 3], [widthKey("f", " "), 1]]);
    const needed = new Set<string>();
    expect(withRunWidths(advance, fonts, canvas, needed)("a b", "f")).toBe(4);
    expect(needed.size).toBe(0);
    expect(withRunWidths(advance, fonts, canvas, needed)("bb", "f")).toBe(2);
    expect([...needed]).toEqual([widthKey("f", "bb")]);
    expect(withRunWidths(advance, fonts, canvas, needed)("a a", "f")).toBe(3);
  });
});
