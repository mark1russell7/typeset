import { describe, expect, it } from "vitest";
import { bidiClass, bracketOf, removed, resolveLevels, resolveText, unicodeVersion, visualIndexes, visualOrder, type BidiClass } from "../bidi.ts";
import { icuDirection } from "./resolve.ts";

const classes = (text: string): BidiClass[] => text.split(" ") as BidiClass[];
const x = removed;

describe("the table", () => {
  it("has the pinned version", () => {
    expect(unicodeVersion).toBe("17.0.0");
  });

  it("gives the class of assigned code points", () => {
    expect(["a", "א", "ا", "1", "٣", " ", "(", ",", "+", "$", "\n", "\t"].map((character) => bidiClass(character.codePointAt(0)!))).toEqual(["L", "R", "AL", "EN", "AN", "WS", "ON", "CS", "ES", "ET", "B", "S"]);
    expect([0x300, 0x200d, 0x202a, 0x202d, 0x202b, 0x202e, 0x202c, 0x2066, 0x2067, 0x2068, 0x2069].map(bidiClass)).toEqual(["NSM", "BN", "LRE", "LRO", "RLE", "RLO", "PDF", "LRI", "RLI", "FSI", "PDI"]);
  });

  it("gives the defaults of the unassigned code points", () => {
    expect([0x5ff, 0x7ff, 0x86f, 0x20cf, 0xfffe, 0x10ffff, 0x2fffd].map(bidiClass)).toEqual(["R", "R", "AL", "ET", "BN", "BN", "L"]);
  });

  it("gives the first and the last code point", () => {
    expect(bidiClass(0)).toBe("BN");
    expect(bidiClass(0x10ffff)).toBe("BN");
  });
});

describe("bracketOf", () => {
  it("gives opposite values to the two brackets of a pair", () => {
    expect(bracketOf(0x28)).toBeGreaterThan(0);
    expect(bracketOf(0x29)).toBe(-bracketOf(0x28));
    expect(bracketOf(0x5b)).not.toBe(bracketOf(0x28));
    expect(bracketOf(0x61)).toBe(0);
  });

  it("has a pair whose closing bracket is before its opening bracket", () => {
    const open = [0x2e50, 0x2e51, 0x2e52, 0x2e53, 0x2e54, 0x2e55, 0x2e56].find((code) => bracketOf(code) > 0)!;
    expect(bracketOf(open)).toBeGreaterThan(0);
    expect(bracketOf(0x2998)).toBe(-bracketOf(0x2997));
  });

  it("treats U+2329 and U+3008 as equivalent, and U+232A and U+3009", () => {
    expect(bracketOf(0x2329)).toBe(bracketOf(0x3008));
    expect(bracketOf(0x232a)).toBe(bracketOf(0x3009));
  });
});

describe("the paragraph direction", () => {
  it("takes the first strong class in the direction auto", () => {
    expect(resolveLevels(classes("ON R L")).paragraphs[0]?.level).toBe(1);
    expect(resolveLevels(classes("ON L R")).paragraphs[0]?.level).toBe(0);
    expect(resolveLevels(classes("ON EN")).paragraphs[0]?.level).toBe(0);
  });

  it("skips the content of an isolate, up to the end when it has no PDI", () => {
    expect(resolveLevels(classes("LRI R PDI L")).paragraphs[0]?.level).toBe(0);
    expect(resolveLevels(classes("RLI L")).paragraphs[0]?.level).toBe(0);
  });

  it("gives each paragraph its own level, and ends each embedding at the separator", () => {
    const { levels, paragraphs } = resolveLevels(classes("RLE L B R L"));
    expect(paragraphs).toEqual([
      { start: 0, end: 3, level: 0 },
      { start: 3, end: 5, level: 1 },
    ]);
    expect(levels).toEqual([x, 2, 0, 1, 2]);
  });

  it("gives no paragraph for an empty text", () => {
    expect(resolveLevels([])).toEqual({ levels: [], paragraphs: [] });
    expect(resolveText("")).toEqual({ levels: [], paragraphs: [] });
  });
});

describe("the explicit rules", () => {
  it("removes the embedding characters and BN", () => {
    expect(resolveLevels(classes("L LRE BN PDF L"), [], 0).levels).toEqual([0, x, x, x, 0]);
  });

  it("applies an override, also to an isolate initiator and its PDI", () => {
    expect(resolveLevels(classes("RLO L EN PDF"), [], 0).levels).toEqual([x, 1, 1, x]);
    expect(resolveLevels(classes("LRO R LRI R PDI R"), [], 0).levels).toEqual([x, 2, 2, 5, 2, 2]);
  });

  it("gives the matching level to an FSI from the content", () => {
    expect(resolveLevels(classes("FSI R PDI"), [], 0).levels).toEqual([0, 1, 0]);
    expect(resolveLevels(classes("FSI L PDI"), [], 0).levels).toEqual([0, 2, 0]);
    expect(resolveLevels(classes("FSI LRI R PDI L"), [], 0).levels).toEqual([0, 2, 5, 2, 2]);
  });

  it("ignores a PDF that matches nothing, and a PDF inside an isolate does not end the isolate", () => {
    expect(resolveLevels(classes("PDF L"), [], 0).levels).toEqual([x, 0]);
    expect(resolveLevels(classes("RLI PDF R PDI"), [], 0).levels).toEqual([0, x, 1, 0]);
  });

  it("ends the embeddings of an isolate at the PDI", () => {
    expect(resolveLevels(classes("RLI LRE L PDI L"), [], 0).levels).toEqual([0, x, 2, 0, 0]);
  });

  it("stops at the level 125 and keeps the count of the overflow", () => {
    const deep = Array.from<BidiClass>({ length: 200 }).fill("LRE");
    const { levels } = resolveLevels([...deep, "L"], [], 0);
    expect(levels.at(-1)).toBe(124);
    const right = Array.from<BidiClass>({ length: 200 }).fill("RLE");
    expect(resolveLevels([...right, "R"], [], 0).levels.at(-1)).toBe(125);
    expect(resolveLevels([...right, "L"], [], 0).levels.at(-1)).toBe(126);
  });
});

describe("the isolating run sequences", () => {
  it("joins the text on the two sides of an isolate", () => {
    // The neutral is between two R across the isolate, so it takes R and not the embedding direction of the level 0
    expect(resolveLevels(classes("R ON LRI L PDI ON R"), [], 0).levels).toEqual([1, 1, 1, 2, 1, 1, 1]);
  });

  it("uses the level of the paragraph for eos after an initiator with no PDI", () => {
    expect(resolveLevels(classes("R ON RLI L"), [], 0).levels).toEqual([1, 0, 0, 2]);
  });

  it("uses the levels of the rules X1 to X9 for sos, after the earlier sequence has its implicit levels", () => {
    // R goes from the level 2 to the level 3. The sos of EN comes from the level 2, so it is L and EN becomes L by the rule W7
    expect(resolveLevels(classes("LRE R PDF EN"), [], 0).levels).toEqual([x, 3, x, 0]);
  });
});

describe("the weak and neutral rules", () => {
  it("gives a mark after an isolate the class ON", () => {
    expect(resolveLevels(classes("R LRI PDI NSM R"), [], 0).levels).toEqual([1, 1, 1, 1, 1]);
    expect(resolveLevels(classes("NSM"), [], 1).levels).toEqual([1]);
  });

  it("makes numbers from separators and terminators", () => {
    expect(resolveLevels(classes("R EN ES EN"), [], 0).levels).toEqual([1, 2, 2, 2]);
    expect(resolveLevels(classes("R AN CS AN"), [], 0).levels).toEqual([1, 2, 2, 2]);
    expect(resolveLevels(classes("R AN ES AN"), [], 0).levels).toEqual([1, 2, 1, 2]);
    expect(resolveLevels(classes("R ET ET EN"), [], 0).levels).toEqual([1, 2, 2, 2]);
  });

  it("makes an Arabic number from a digit after AL, and L from a digit after L", () => {
    expect(resolveLevels(classes("AL EN"), [], 0).levels).toEqual([1, 2]);
    expect(resolveLevels(classes("AL ON EN R EN"), [], 1).levels).toEqual([1, 1, 2, 1, 2]);
    expect(resolveLevels(classes("L EN"), [], 1).levels).toEqual([2, 2]);
  });

  it("goes up one level at an odd level, and up to two at an even level", () => {
    expect(resolveLevels(classes("L R EN AN"), [], 0).levels).toEqual([0, 1, 2, 2]);
    expect(resolveLevels(classes("L R EN AN"), [], 1).levels).toEqual([2, 1, 2, 2]);
  });
});

describe("the brackets", () => {
  const open = 1;
  const close = -1;

  it("sets a pair to the embedding direction when the pair has that direction inside", () => {
    expect(resolveLevels(classes("R ON L R ON L"), [0, open, 0, 0, close, 0], 0).levels).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("sets a pair to the opposite direction only with that direction before it", () => {
    expect(resolveLevels(classes("R ON R ON L"), [0, open, 0, close, 0], 0).levels).toEqual([1, 1, 1, 1, 0]);
    expect(resolveLevels(classes("L ON R ON R"), [0, open, 0, close, 0], 0).levels).toEqual([0, 0, 1, 0, 1]);
  });

  it("uses sos as the context when no strong class is before the pair", () => {
    // UAX #9 names sos in this step, and the two test files of Unicode do not examine it: sos is R at the even level 2
    expect(resolveLevels(classes("LRE RLE R PDF ON R ON"), [0, 0, 0, 0, open, 0, close], 0).levels).toEqual([x, x, 3, x, 3, 3, 3]);
  });

  it("counts numbers as R inside and before a pair", () => {
    expect(resolveLevels(classes("R ON EN ON L"), [0, open, 0, close, 0], 0).levels).toEqual([1, 1, 2, 1, 0]);
    expect(resolveLevels(classes("AN ON R ON L"), [0, open, 0, close, 0], 0).levels).toEqual([2, 1, 1, 1, 0]);
  });

  it("does not change a pair with no strong class inside", () => {
    expect(resolveLevels(classes("R ON ON ON L"), [0, open, 0, close, 0], 0).levels).toEqual([1, 0, 0, 0, 0]);
  });

  it("gives the marks after a bracket the class of the bracket", () => {
    expect(resolveLevels(classes("R ON NSM R ON NSM L"), [0, open, 0, 0, close, 0, 0], 0).levels).toEqual([1, 1, 1, 1, 1, 1, 0]);
  });

  it("ignores a bracket that an override changes", () => {
    expect(resolveLevels(classes("RLO ON L ON PDF"), [0, open, 0, close, 0], 0).levels).toEqual([x, 1, 1, 1, x]);
  });

  it("matches inside one sequence only", () => {
    expect(resolveLevels(classes("R ON RLI ON PDI L"), [0, open, 0, close, 0, 0], 0).levels).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("gives no pairs when the stack needs more than 63 entries", () => {
    const pair = (count: number): { types: BidiClass[]; brackets: number[] } => ({
      types: ["R", ...Array.from<BidiClass>({ length: count }).fill("ON"), "R", ...Array.from<BidiClass>({ length: count }).fill("ON"), "L"],
      brackets: [0, ...Array.from<number>({ length: count }).fill(open), 0, ...Array.from<number>({ length: count }).fill(close), 0],
    });
    const fits = pair(63);
    expect(resolveLevels(fits.types, fits.brackets, 0).levels[1]).toBe(1);
    const over = pair(64);
    expect(resolveLevels(over.types, over.brackets, 0).levels[1]).toBe(1);
    expect(resolveLevels(over.types, over.brackets, 0).levels.at(-2)).toBe(0);
    expect(resolveLevels(fits.types, fits.brackets, 0).levels.at(-2)).toBe(1);
  });

  it("resolves the example of UAX #9 through the text entry", () => {
    expect(resolveText("אב(גד[&ef].)gh", 0).levels).toEqual([1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(resolveText("אב(גד[&ef].)gh", 1).levels).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 2, 2]);
  });
});

describe("the rule L1", () => {
  it("resets the white space and the isolates at the end and before a separator", () => {
    expect(resolveLevels(classes("R WS LRI PDI"), [], 0).levels).toEqual([1, 0, 0, 0]);
    expect(resolveLevels(classes("R WS S R"), [], 0).levels).toEqual([1, 0, 0, 1]);
    expect(resolveLevels(classes("L WS B"), [], 1).levels).toEqual([2, 1, 1]);
  });

  it("looks through the removed characters", () => {
    expect(resolveLevels(classes("R WS BN WS"), [], 0).levels).toEqual([1, 0, x, 0]);
  });

  it("uses the class of the file, not the class of an override", () => {
    expect(resolveLevels(classes("RLO WS"), [], 0).levels).toEqual([x, 0]);
  });
});

describe("the visual order", () => {
  it("reverses from the highest level", () => {
    expect(visualOrder(["a", "b", "c", "d"], [1, 2, 2, 1])).toEqual(["d", "b", "c", "a"]);
    expect(visualOrder([0, 1, 2], [0, 0, 0])).toEqual([0, 1, 2]);
    expect(visualOrder([0, 1], [2, 2])).toEqual([0, 1]);
  });

  it("handles a long text", () => {
    const n = 200000;
    expect(visualOrder(new Array<number>(n).fill(0), new Array<number>(n).fill(1))).toHaveLength(n);
  });

  it("omits the removed characters, and orders each paragraph alone", () => {
    expect(visualIndexes(resolveLevels(classes("L LRE R"), [], 0))).toEqual([0, 2]);
    expect(visualIndexes(resolveLevels(classes("R B R"), [], 1))).toEqual([1, 0, 2]);
  });
});

describe("resolveText", () => {
  it("gives one level for each code point, and keeps its surrogate pairs together", () => {
    expect(resolveText("𐤀a", 0).levels).toEqual([1, 0]);
    expect(resolveText("𐤀a").paragraphs[0]?.level).toBe(1);
  });

  it("uses the exact class of a character outside the common ones", () => {
    expect(resolveText("\u{1e900}", 0).levels).toEqual([1]);
    expect(resolveText("\u{1eef0}", 0).levels).toEqual([0]);
  });
});

describe("icuDirection", () => {
  it("gives the direction of the classes when the text has no control", () => {
    expect(icuDirection(classes("L EN"), 0)).toBe("ltr");
    // The paragraph level 0 adds the flag L, so an RTL text in an LTR paragraph is mixed
    expect(icuDirection(classes("R AL"), 0)).toBe("mixed");
    expect(icuDirection(classes("R AL"), 1)).toBe("rtl");
    expect(icuDirection(classes("L R"), 1)).toBe("mixed");
  });

  it("makes a text with an Arabic digit and a neutral mixed", () => {
    expect(icuDirection(classes("EN AN"), 0)).toBe("ltr");
    expect(icuDirection(classes("AN ON"), 0)).toBe("mixed");
  });

  it("reads the isolates and the embeddings of the text", () => {
    expect(icuDirection(classes("L LRI L"), 0)).toBe("ltr");
    expect(icuDirection(classes("L RLI L"), 0)).toBe("mixed");
    expect(icuDirection(classes("L FSI L"), 0)).toBe("ltr");
    expect(icuDirection(classes("L FSI R PDI"), 0)).toBe("mixed");
    expect(icuDirection(classes("L PDI L"), 0)).toBe("ltr");
    expect(icuDirection(classes("L LRE L"), 0)).toBe("ltr");
    expect(icuDirection(classes("L RLE L"), 0)).toBe("mixed");
    expect(icuDirection(classes("L RLO L"), 0)).toBe("mixed");
  });

  it("ignores an embedding with no character inside it", () => {
    expect(icuDirection(classes("L RLE PDF L"), 0)).toBe("ltr");
    expect(icuDirection(classes("L RLE BN PDF L"), 0)).toBe("ltr");
  });
});
