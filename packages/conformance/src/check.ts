import type { Failure, Score } from "./parse.ts";

/** The reasons of `data/reasons.json`. */
export interface Reasons {
  /** The reason for a failed test, with the key `<file>:<line>`, for example `line:2599`. */
  readonly failures: Readonly<Record<string, string>>;
  /** The reason for each class of difference of `canvasWords` from UAX #29. */
  readonly canvasWords: Readonly<Record<string, string>>;
}

/** This function gives the end offset of each part of a text. */
export function offsetsOf(parts: readonly string[]): readonly number[] {
  let offset = 0;
  return parts.map((part) => (offset += part.length));
}

/** This function gives the key of each failed test that has no reason. */
export function unlistedFailures(scores: Readonly<Record<string, Score>>, reasons: Reasons): readonly string[] {
  return Object.entries(scores).flatMap(([name, score]) => score.failures.map((failure) => `${name}:${failure.line}`).filter((key) => reasons.failures[key] === undefined));
}

/** This function gives the class of a difference: which breaks of the file a result does not have, and which it has in excess. */
export function classOf(failure: Failure): string {
  const expected = new Set(failure.breaks);
  const actual = new Set(failure.actual);
  const missing = failure.breaks.some((offset) => !actual.has(offset));
  const extra = failure.actual.some((offset) => !expected.has(offset));
  if (missing && extra) return "both";
  return missing ? "missing" : "extra";
}
