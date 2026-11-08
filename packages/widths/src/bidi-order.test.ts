import { bidiClass } from "@mark1russell7/typeset/bidi";
import { describe, expect, it } from "vitest";
import { compareOrders, orderCase, orderOfPlaces, orderTexts } from "./bidi-order.ts";

describe("orderCase", () => {
  it("reverses a Hebrew run after a Latin letter", () => {
    expect(orderCase("aבג")).toEqual({ text: "aבג", indexes: [0, 1, 2], expected: [0, 2, 1] });
  });

  it("keeps European digits left to right inside a Hebrew run", () => {
    // The digits get the level 2 inside the run of level 1, so they keep their order and go to the left of the letter.
    expect(orderCase("א12").expected).toEqual([1, 2, 0]);
  });

  it("puts a pair of brackets in the Hebrew run by the rule N0", () => {
    expect(orderCase("א(ב)a").expected).toEqual([3, 2, 1, 0, 4]);
  });

  it("does not compare an explicit control, and applies its override", () => {
    // RLO makes b and c right to left, and the control itself has no place to compare.
    expect(orderCase("a‮bc")).toEqual({ text: "a‮bc", indexes: [0, 2, 3], expected: [0, 3, 2] });
  });

  it("does not compare white space or a mark of direction", () => {
    expect(orderCase("a ‏b").indexes).toEqual([0, 3]);
  });
});

describe("orderTexts", () => {
  it("gives the same texts for the same seed, with a compared character at each end", () => {
    const texts = orderTexts(13, 200);
    expect(orderTexts(13, 200)).toEqual(texts);
    expect(texts).toHaveLength(200);
    const ends = new Set(["L", "R", "AL", "EN", "AN", "ES", "ET", "CS", "ON"]);
    const marks = new Set([0x200e, 0x200f, 0x061c]);
    for (const text of texts) {
      for (const codePoint of [text.codePointAt(0)!, text.codePointAt(text.length - 1)!]) {
        expect(ends.has(bidiClass(codePoint)) && !marks.has(codePoint), text).toBe(true);
      }
    }
  });

  it("mixes both directions, brackets and controls in the texts", () => {
    const all = orderTexts(13, 600).join("");
    for (const character of ["a", "א", "1", "١", "(", "‏", "‫", "⁧"]) expect(all).toContain(character);
  });
});

describe("orderOfPlaces", () => {
  it("orders the indexes by the center of their box, and keeps the logical order for equal centers", () => {
    expect(orderOfPlaces([{ index: 0, center: 30 }, { index: 1, center: 10 }, { index: 2, center: 10 }])).toEqual([1, 2, 0]);
  });
});

describe("compareOrders", () => {
  it("counts the matched texts and keeps the first mismatches", () => {
    const cases = [orderCase("aבג"), orderCase("ab"), orderCase("בג")];
    const result = compareOrders("test", "1", cases, [[0, 2, 1], [1, 0], []], 1);
    expect(result).toMatchObject({ browser: "test", texts: 3, matched: 1 });
    expect(result.mismatches).toEqual([{ text: "ab", expected: [0, 1], actual: [1, 0] }]);
  });
});
