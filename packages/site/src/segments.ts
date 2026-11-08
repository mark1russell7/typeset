/**
 * The segments of the lab text: its grapheme clusters (UAX #29), its words (UAX #29) and its line break places (UAX #14).
 * The line break places come from the tables of the package. The other two come from `Intl.Segmenter` of the browser.
 * This module has no DOM code, so the tests examine it in Node.
 */
import { graphemes, lineBreaks, wordBreaks } from "@mark1russell7/typeset/segmentation";

/** The three kinds of segment that the page shows. */
export type SegmentKind = "graphemes" | "words" | "lines";

/** One segment of a text. */
export interface Segment {
  readonly text: string;
  /** The offset of the first UTF-16 code unit of the segment. */
  readonly start: number;
  /** This value is `true` when the line must break at the end of the segment. */
  readonly required: boolean;
}

/** The segments of a text, with their counts. */
export interface SegmentView {
  readonly kind: SegmentKind;
  readonly segments: readonly Segment[];
  /** The count of the places where a line must break. It is 0 for the other kinds. */
  readonly required: number;
}

/** A place between two segments: the offset of the start of the next segment. */
interface Cut {
  readonly offset: number;
  readonly required: boolean;
}

/** This function gives the segments between the cuts. It adds the start and the end of the text, and it ignores a cut outside the text. */
export function segmentsOf(text: string, cuts: readonly Cut[]): Segment[] {
  const required = new Map<number, boolean>();
  for (const cut of cuts) if (cut.offset > 0 && cut.offset <= text.length) required.set(cut.offset, (required.get(cut.offset) ?? false) || cut.required);
  if (text.length > 0 && !required.has(text.length)) required.set(text.length, false);
  const ends = [...required.keys()].sort((a, b) => a - b);
  let start = 0;
  return ends.map((end) => {
    const segment = { text: text.slice(start, end), start, required: required.get(end)! };
    start = end;
    return segment;
  });
}

/** This function gives the segments of a kind in a text. */
export function segmentView(text: string, kind: SegmentKind): SegmentView {
  let cuts: Cut[];
  if (kind === "graphemes") {
    let offset = 0;
    cuts = graphemes(text).map((cluster) => ({ offset: (offset += cluster.length), required: false }));
  } else if (kind === "words") {
    cuts = wordBreaks(text).map((offset) => ({ offset, required: false }));
  } else {
    cuts = lineBreaks(text).map(({ offset, required }) => ({ offset, required }));
  }
  const segments = segmentsOf(text, cuts);
  return { kind, segments, required: kind === "lines" ? segments.filter((segment) => segment.required).length : 0 };
}

/** One row of the conformance record of CI. */
export interface ConformanceRow {
  readonly function: string;
  readonly file: string;
  readonly passed: number;
  readonly total: number;
  readonly note?: string;
}

/** The conformance record of CI: the official test files of Unicode against the functions. */
export interface ConformanceRecord {
  readonly run: string;
  readonly head: string;
  /** The Unicode version of the tables of `lineBreaks`. */
  readonly unicodeVersion: string;
  /** The runtime of CI. `graphemes` and `wordBreaks` use its `Intl.Segmenter`, so the record holds for that runtime. */
  readonly runtime: string;
  readonly rows: readonly ConformanceRow[];
}

/** This function examines the conformance record and gives it. It throws on a row with an impossible count. */
export function readConformance(value: unknown): ConformanceRecord {
  const record = value as ConformanceRecord;
  if (typeof record.run !== "string" || typeof record.runtime !== "string" || !Array.isArray(record.rows)) throw new Error("the conformance record has no run or no rows");
  for (const row of record.rows) {
    if (!Number.isInteger(row.passed) || !Number.isInteger(row.total) || row.passed < 0 || row.passed > row.total) throw new Error(`the row ${row.function} has the count ${row.passed} of ${row.total}`);
  }
  return record;
}
