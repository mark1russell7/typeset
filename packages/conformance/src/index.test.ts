import { describe, expect, it } from "vitest";
import { classOf, offsetsOf, unlistedFailures } from "./check.ts";
import { parseTests, scoreTests } from "./parse.ts";
import { fileUrl, testFiles } from "./sources.ts";
import { makeTable, resolveClass, tableSource } from "./tables.ts";

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

describe("the sources", () => {
  it("names the file of the pinned version", () => {
    expect(fileUrl(testFiles.line)).toBe("https://www.unicode.org/Public/17.0.0/ucd/auxiliary/LineBreakTest.txt");
  });
});
