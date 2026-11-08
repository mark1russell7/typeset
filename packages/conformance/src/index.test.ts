import { describe, expect, it } from "vitest";
import { directionName, eachBidiTest, eachCharacterTest, resolveCharacterTest, resolveClassTest, resultOf, scoreBidi, type BidiTest } from "./bidi.ts";
import { classOf, offsetsOf, unlistedFailures } from "./check.ts";
import { parseTests, scoreTests } from "./parse.ts";
import { fileUrl, propertyFiles, testFiles } from "./sources.ts";
import { bidiTableSource, makeBidiTable, makeTable, resolveClass, tableSource } from "./tables.ts";

describe("parseTests", () => {
  it("reads the marks, the code points and the line numbers", () => {
    const tests = parseTests("# comment\n\n÷ 0061 × 0308 ÷ 1F600 ÷\t# a\n× 0023 ÷");
    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({ line: 3, text: "ä\u{1F600}", breaks: [2, 4] });
    expect(tests[1]).toMatchObject({ line: 4, text: "#", breaks: [1] });
  });
});

describe("scoreTests", () => {
  const tests = parseTests("× 0041 ÷ 0042 ÷\n× 0043 ÷");

  it("counts the tests that pass and keeps the others", () => {
    const score = scoreTests(tests, (text) => [text.length]);
    expect(score).toMatchObject({ tests: 2, passed: 1 });
    expect(score.failures[0]).toMatchObject({ line: 1, actual: [2] });
  });

  it("finds a result with the correct length and a wrong offset", () => {
    expect(scoreTests(tests, () => [9]).passed).toBe(0);
  });
});

describe("the reasons", () => {
  const failure = { line: 7, text: "ab", source: "", breaks: [1, 2], actual: [2] };

  it("lists a failure with no reason, and passes one with a reason", () => {
    const scores = { line: { tests: 1, passed: 0, failures: [failure] } };
    expect(unlistedFailures(scores, { failures: {}, canvasWords: {} })).toEqual(["line:7"]);
    expect(unlistedFailures(scores, { failures: { "line:7": "why" }, canvasWords: {} })).toEqual([]);
  });

  it("gives the class of a difference", () => {
    expect(classOf(failure)).toBe("missing");
    expect(classOf({ ...failure, breaks: [2], actual: [1, 2] })).toBe("extra");
    expect(classOf({ ...failure, breaks: [1, 3], actual: [2, 3] })).toBe("both");
  });
});

describe("the bidi files", () => {
  const file = "# comment\n@Levels:\tx 1\n@Reorder:\t1\nBN R; 7\nBN AL; 4\n@Levels:\tx\n@Reorder:\t\nPDF; 3\n@Other: 1\n";
  const characters = "# comment\n05D0 0028;1;1;1 1;1 0\n0061;2;0;0;0\n";
  const read = (each: (visit: (test: BidiTest) => void) => void): BidiTest[] => {
    const tests: BidiTest[] = [];
    each((test) => tests.push(test));
    return tests;
  };

  it("reads one test for each direction of the bitset", () => {
    const tests = read((visit) => eachBidiTest(file, visit));
    expect(tests.map((test) => [test.line, test.direction])).toEqual([
      [4, "auto"],
      [4, 0],
      [4, 1],
      [5, 1],
      [8, "auto"],
      [8, 0],
    ]);
    expect(tests[0]).toMatchObject({ input: "BN R", levels: "x 1", order: "1", paragraph: null });
    expect(tests[4]).toMatchObject({ input: "PDF", levels: "x", order: "" });
  });

  it("reads the fields of the character file", () => {
    expect(read((visit) => eachCharacterTest(characters, visit))).toEqual([
      { line: 2, input: "05D0 0028", direction: 1, paragraph: 1, levels: "1 1", order: "1 0" },
      { line: 3, input: "0061", direction: "auto", paragraph: 0, levels: "0", order: "0" },
    ]);
  });

  it("names the directions", () => {
    expect(["auto", 0, 1].map((direction) => directionName(direction as "auto"))).toEqual(["auto", "ltr", "rtl"]);
  });

  it("writes a result in the form of the file", () => {
    expect(resultOf({ levels: [-1, 1], paragraphs: [{ start: 0, end: 2, level: 1 }] }, [1])).toEqual({ levels: "x 1", order: "1", paragraph: 1 });
    expect(resultOf({ levels: [], paragraphs: [] }, [])).toEqual({ levels: "", order: "", paragraph: 0 });
  });

  it("resolves a test of each file", () => {
    const score = scoreBidi((visit) => eachBidiTest(file, visit), resolveClassTest);
    expect(score["rtl.levels"]).toMatchObject({ tests: 2, passed: 2 });
    expect(score["auto.order"]).toMatchObject({ tests: 2, passed: 2 });
    const characterScore = scoreBidi((visit) => eachCharacterTest(characters, visit), resolveCharacterTest);
    expect(characterScore["rtl.levels"]).toMatchObject({ tests: 1, passed: 1 });
    expect(characterScore["auto.order"]).toMatchObject({ tests: 1, passed: 1 });
  });

  it("scores the levels and the order alone, for each direction", () => {
    const score = scoreBidi(
      (visit) => eachBidiTest(file, visit),
      (test) => ({ levels: test.levels, order: "9", paragraph: 0 }),
    );
    expect(score["ltr.levels"]).toMatchObject({ tests: 2, passed: 2 });
    expect(score["ltr.order"]).toMatchObject({ tests: 2, passed: 0 });
    expect(score["ltr.order"].failures[0]).toEqual({ line: 4, input: "BN R", expected: "1", actual: "9" });
  });

  it("fails the levels of a test when the paragraph level differs", () => {
    const score = scoreBidi(
      (visit) => eachCharacterTest(characters, visit),
      (test) => ({ levels: test.levels, order: test.order, paragraph: 5 }),
    );
    expect(score["rtl.levels"].passed).toBe(0);
    expect(score["rtl.order"].passed).toBe(1);
  });

  it("lists a failed bidi test with no reason, and passes one with a reason", () => {
    const score = scoreBidi(
      (visit) => eachBidiTest(file, visit),
      (test) => ({ levels: "1", order: test.order, paragraph: 0 }),
    );
    const scores = { "bidi.rtl.levels": score["rtl.levels"] };
    expect(unlistedFailures(scores, { failures: {}, canvasWords: {} })).toEqual(["bidi.rtl.levels:4", "bidi.rtl.levels:5"]);
    expect(unlistedFailures(scores, { failures: { "bidi.rtl.levels:4": "why", "bidi.rtl.levels:5": "why" }, canvasWords: {} })).toEqual([]);
  });
});

describe("offsetsOf", () => {
  it("gives the end of each part in UTF-16 units", () => {
    expect(offsetsOf(["a", "\u{1F600}", "bc"])).toEqual([1, 3, 5]);
  });
});

describe("the table", () => {
  it("resolves the classes of the rule LB1", () => {
    expect(["AI", "SG", "XX"].map((name) => resolveClass(name, 0x41))).toEqual(["AL", "AL", "AL"]);
    expect(resolveClass("CJ", 0x3041)).toBe("NS");
    expect(resolveClass("SA", 0x0e31)).toBe("CM");
    expect(resolveClass("SA", 0x0e01)).toBe("SA");
    expect(resolveClass("BA", 0x20)).toBe("BA");
  });

  it("reads ranges and the defaults of a property file", () => {
    const table = makeTable("0041..0042 ; ID # x\n0043 ; SA # y\n", "# @missing: 0041..0041; W\n0042 ; N # x\n");
    expect(table.classNames).toEqual(["AL", "ID", "SA"]);
    expect(table.classes.startsWith("1tA2B1C")).toBe(true);
    expect(table.eastAsian.split(" ").slice(0, 2)).toEqual(["1t", "1"]);
  });

  it("writes one version in the source", () => {
    expect(tableSource(makeTable("", ""), "1.2.3")).toContain('unicodeVersion = "1.2.3"');
  });
});

describe("the bidi table", () => {
  const derived = "# @missing: 0000..10FFFF; Left_To_Right\n# @missing: 0041..0042; Right_To_Left\n0042 ; ON # x\n0043..0044 ; NSM # y\n# @missing: 0045..0045; European_Terminator\n";

  it("reads the defaults with long names, and a data line over a default", () => {
    const table = makeBidiTable(derived, "");
    expect(table.classNames).toEqual(["L", "R", "ON", "NSM", "ET"]);
    expect(table.classes.startsWith("1tA1B1C2D1E")).toBe(true);
  });

  it("writes each pair with two distances, and reads the opening lines only", () => {
    expect(makeBidiTable("", "0028; 0029; o # a\n0029; 0028; c # b\n0030; 002F; o # c\n").brackets).toBe("14 1 8 -1");
  });

  it("writes the names as a list that tree shaking removes, and one version", () => {
    const source = bidiTableSource(makeBidiTable(derived, ""), "1.2.3");
    expect(source).toContain('unicodeVersion = "1.2.3"');
    expect(source).toContain('classNames: readonly string[] = ["L","R",');
  });
});

describe("the sources", () => {
  it("names the file of the pinned version", () => {
    expect(fileUrl(testFiles.line)).toBe("https://www.unicode.org/Public/17.0.0/ucd/auxiliary/LineBreakTest.txt");
    expect(fileUrl(testFiles.bidi)).toBe("https://www.unicode.org/Public/17.0.0/ucd/BidiTest.txt");
    expect(fileUrl(propertyFiles.bidiClass)).toBe("https://www.unicode.org/Public/17.0.0/ucd/extracted/DerivedBidiClass.txt");
  });
});
