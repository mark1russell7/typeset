import type { Line } from "./paragraph.ts";

/**
 * This function gives the raggedness of the lines for the width `width`: the mean of `((width - line) / width)²` over the
 * lines before the last line. It is 0 for one line. `@mark1russell7/layout-contract/text` uses the same measure.
 */
export function raggedness(lines: readonly Line[], width: number): number {
  if (lines.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const free = (width - lines[i]!.width) / width;
    sum += free * free;
  }
  return sum / (lines.length - 1);
}

/** This function gives the spread of the lines: the width of the widest line less the width of the narrowest line, the last line included. */
export function spread(lines: readonly Line[]): number {
  if (lines.length === 0) return 0;
  let widest = -Infinity;
  let narrowest = Infinity;
  for (const line of lines) {
    widest = Math.max(widest, line.width);
    narrowest = Math.min(narrowest, line.width);
  }
  return widest - narrowest;
}
