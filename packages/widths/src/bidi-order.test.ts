import { bidiClass } from "@mark1russell7/typeset/bidi";
import { describe, expect, it } from "vitest";
import { compareOrders, orderCase, orderOfPlaces, orderTexts, variantNames, variantOrder, variantText } from "./bidi-order.ts";

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

describe("variantText", () => {
  it("keeps the length of the text, so the indexes stay the same", () => {
    const text = "(a⁧b)⁩[c]";
    for (const variant of variantNames) expect(variantText(text, variant)).toHaveLength(text.length);
  });

  it("changes the brackets for noN0 and the isolates for the isolate variants", () => {
    expect(variantText("(a⁧b)⁩", "noN0")).toBe("!a⁧b!⁩");
    expect(variantText("(a⁧b)⁩", "isolatesBN")).toBe("(a‌b)‌");
    expect(variantText("(a⁧b)⁩", "isolatesON")).toBe("(a!b)!");
    expect(variantText("(a⁧b)⁩", "noN0IsolatesON")).toBe("!a!b!!");
  });
});

describe("variantOrder", () => {
  it("gives the order without the rule N0", () => {
    // With N0, the brackets go into the Hebrew run. Without N0, the closing bracket between ב and a takes the level 0.
    expect(variantOrder(orderCase("א(ב)a"), "noN0")).toEqual([2, 1, 0, 3, 4]);
  });

  it("gives the order with an isolate as a removed character", () => {
    // The RLI isolates bא at the level 1, so א goes left of b. As BN, the isolate does nothing, and b stays at the level 0.
    const item = orderCase("a⁧bא⁩c");
    expect(item.expected).toEqual([0, 3, 2, 5]);
    expect(variantOrder(item, "isolatesBN")).toEqual([0, 2, 3, 5]);
  });
});

describe("compareOrders", () => {
  it("counts the matched texts and keeps the first mismatches", () => {
    const cases = [orderCase("aבג"), orderCase("ab"), orderCase("בג")];
    const result = compareOrders(cases, [[0, 2, 1], [1, 0], []], 1);
    expect(result).toMatchObject({ texts: 3, matched: 1, unexplained: 2 });
    expect(result.mismatches).toEqual([{ text: "ab", expected: [0, 1], actual: [1, 0], variants: [] }]);
  });

  it("counts each variant that gives the order of a mismatch", () => {
    const result = compareOrders([orderCase("א(ב)a"), orderCase("a⁧bא⁩c")], [[2, 1, 0, 3, 4], [0, 2, 3, 5]]);
    expect(result.matched).toBe(0);
    expect(result.unexplained).toBe(0);
    expect(result.variants).toEqual({ noN0: 1, isolatesBN: 1, isolatesON: 1, noN0IsolatesBN: 2, noN0IsolatesON: 2 });
    expect(result.mismatches[0]!.variants).toEqual(["noN0", "noN0IsolatesBN", "noN0IsolatesON"]);
  });
});
