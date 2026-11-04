import { adjustmentRatio, type Line, type Paragraph } from "./paragraph.ts";

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

/**
 * This function gives the adjustment ratio of each line for the width `width`. A renderer sets each glue of a line with a
 * ratio `r` to its width plus `r` times its stretch, or plus `r` times its shrink when `r` is negative. The last line does
 * not stretch, so its ratio is not more than 0.
 */
export function adjustmentRatios(paragraph: Paragraph, lines: readonly Line[], width: number): number[] {
  return lines.map((line, index) => {
    const ratio = adjustmentRatio(paragraph.items, line.start, line.end, width);
    return index === lines.length - 1 ? Math.min(ratio, 0) : ratio;
  });
}

/**
 * This function gives the measure of the justified edge: the largest absolute adjustment ratio of the lines. A value of 1 or
 * less means that the glue of each line reaches the edge within its stretch and its shrink.
 */
export function worstRatio(paragraph: Paragraph, lines: readonly Line[], width: number): number {
  return Math.max(0, ...adjustmentRatios(paragraph, lines, width).map(Math.abs));
}
