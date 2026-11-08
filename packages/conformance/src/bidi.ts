/** This module reads the two bidi test files of Unicode and scores a resolver with them. */
import { bidiClass, bracketOf, resolveLevels, visualIndexes, type BidiClass, type ParagraphDirection, type ResolvedBidi } from "@mark1russell7/typeset/bidi";

/** One test of a bidi test file, for one paragraph direction. */
export interface BidiTest {
  /** The number of the line in the file, from 1. */
  readonly line: number;
  /** The names of the classes in `BidiTest.txt`, or the code points in `BidiCharacterTest.txt`. */
  readonly input: string;
  readonly direction: ParagraphDirection;
  /** The level of each character, with `x` for a removed character. */
  readonly levels: string;
  /** The indexes in the visual order. */
  readonly order: string;
  /** The paragraph level that the test expects. `BidiTest.txt` does not give it, so the value is `null` there. */
  readonly paragraph: number | null;
}

/** The result of a resolver for one test, in the form of the file. */
export interface BidiResult {
  readonly levels: string;
  readonly order: string;
  readonly paragraph: number;
}

/** This function gives the form of the file for a resolved text, from the levels and the visual order. */
export function resultOf(resolved: ResolvedBidi, order: readonly number[]): BidiResult {
  return { levels: resolved.levels.map((level) => (level < 0 ? "x" : level)).join(" "), order: order.join(" "), paragraph: resolved.paragraphs[0]?.level ?? 0 };
}

/** This function resolves a test of `BidiTest.txt`. This file gives classes and has no brackets. */
export function resolveClassTest(test: BidiTest): BidiResult {
  const resolved = resolveLevels(test.input.split(" ") as BidiClass[], [], test.direction);
  return resultOf(resolved, visualIndexes(resolved));
}

/** This function resolves a test of `BidiCharacterTest.txt` with the exact table. This file gives code points. */
export function resolveCharacterTest(test: BidiTest): BidiResult {
  const codePoints = test.input.split(" ").map((token) => Number.parseInt(token, 16));
  const resolved = resolveLevels(codePoints.map(bidiClass), codePoints.map(bracketOf), test.direction);
  return resultOf(resolved, visualIndexes(resolved));
}

const fileDirections: readonly [number, ParagraphDirection][] = [
  [1, "auto"],
  [2, 0],
  [4, 1],
];

/** This function gives `visit` each test of `BidiTest.txt`: one test for each direction in the bitset of a line. */
export function eachBidiTest(file: string, visit: (test: BidiTest) => void): void {
  let levels = "";
  let order = "";
  file.split("\n").forEach((raw, index) => {
    const source = raw.split("#")[0]!.trim();
    if (source === "") return;
    if (source.startsWith("@Levels:")) levels = source.slice(8).trim().split(/\s+/u).join(" ");
    else if (source.startsWith("@Reorder:")) order = source.slice(9).trim().split(/\s+/u).join(" ");
    else if (!source.startsWith("@")) {
      const [input, bitset] = source.split(";");
      for (const [bit, direction] of fileDirections) {
        if (Number.parseInt(bitset!, 16) & bit) visit({ line: index + 1, input: input!.trim(), direction, levels, order, paragraph: null });
      }
    }
  });
}

/** This function gives `visit` each test of `BidiCharacterTest.txt`. */
export function eachCharacterTest(file: string, visit: (test: BidiTest) => void): void {
  file.split("\n").forEach((raw, index) => {
    const source = raw.trim();
    if (source === "" || source.startsWith("#")) return;
    const [input, field, paragraph, levels, order] = source.split(";");
    visit({ line: index + 1, input: input!.trim(), direction: field === "2" ? "auto" : field === "1" ? 1 : 0, levels: levels!.trim(), order: order!.trim(), paragraph: Number(paragraph) });
  });
}

/** One test that gave another result than the file expects. */
export interface BidiFailure {
  readonly line: number;
  readonly input: string;
  readonly expected: string;
  readonly actual: string;
}

/** The result of a resolver for one measure of a file in one direction. */
export interface BidiScore {
  readonly tests: number;
  readonly passed: number;
  readonly failures: readonly BidiFailure[];
}

/** The scores of a file: the levels and the order for each direction. */
export type BidiScores = Readonly<Record<`${"auto" | "ltr" | "rtl"}.${"levels" | "order"}`, BidiScore>>;

/** This function gives the name of a direction in the scores. */
export function directionName(direction: ParagraphDirection): "auto" | "ltr" | "rtl" {
  if (direction === "auto") return "auto";
  return direction === 0 ? "ltr" : "rtl";
}

/**
 * This function scores a resolver with the tests of a file. The levels of a test fail also when the paragraph level differs.
 * `each` is `eachBidiTest` or `eachCharacterTest` with its file.
 */
export function scoreBidi(each: (visit: (test: BidiTest) => void) => void, resolve: (test: BidiTest) => BidiResult): BidiScores {
  const empty = (): { tests: number; passed: number; failures: BidiFailure[] } => ({ tests: 0, passed: 0, failures: [] });
  const count = { "auto.levels": empty(), "auto.order": empty(), "ltr.levels": empty(), "ltr.order": empty(), "rtl.levels": empty(), "rtl.order": empty() };
  const add = (name: keyof BidiScores, test: BidiTest, expected: string, actual: string, same: boolean): void => {
    const score = count[name];
    score.tests++;
    if (same) score.passed++;
    else score.failures.push({ line: test.line, input: test.input, expected, actual });
  };
  each((test) => {
    const result = resolve(test);
    const name = directionName(test.direction);
    const paragraphSame = test.paragraph === null || test.paragraph === result.paragraph;
    add(`${name}.levels`, test, test.levels, result.levels, paragraphSame && result.levels === test.levels);
    add(`${name}.order`, test, test.order, result.order, result.order === test.order);
  });
  return count;
}
