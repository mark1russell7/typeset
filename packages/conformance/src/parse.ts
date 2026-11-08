/** One test of a break test file of Unicode. */
export interface BreakTest {
  /** The number of the line in the file, from 1. */
  readonly line: number;
  readonly text: string;
  /** The offsets in UTF-16 units where the test expects a break, without the start of the text. */
  readonly breaks: readonly number[];
  /** The text of the test as the file writes it, with the marks and the code points. */
  readonly source: string;
}

/** This function reads the tests of a break test file. Each test is a list of code points with a mark between them. */
export function parseTests(file: string): readonly BreakTest[] {
  const tests: BreakTest[] = [];
  file.split("\n").forEach((raw, index) => {
    const source = raw.split("#")[0]!.trim();
    if (source === "") return;
    const breaks: number[] = [];
    let text = "";
    for (const token of source.split(/\s+/u)) {
      if (token === "÷") {
        if (text.length > 0) breaks.push(text.length);
      } else if (token !== "×") {
        text += String.fromCodePoint(Number.parseInt(token, 16));
      }
    }
    tests.push({ line: index + 1, text, breaks, source });
  });
  return tests;
}

/** One test that gave other breaks than the file expects. */
export interface Failure extends BreakTest {
  readonly actual: readonly number[];
}

/** The result of a function over the tests of a file. */
export interface Score {
  readonly tests: number;
  readonly passed: number;
  readonly failures: readonly Failure[];
}

/** This function compares the breaks of a function with each test. */
export function scoreTests(tests: readonly BreakTest[], breaksOf: (text: string) => readonly number[]): Score {
  const failures: Failure[] = [];
  for (const test of tests) {
    const actual = breaksOf(test.text);
    if (actual.length !== test.breaks.length || actual.some((offset, index) => offset !== test.breaks[index])) failures.push({ ...test, actual });
  }
  return { tests: tests.length, passed: tests.length - failures.length, failures };
}
