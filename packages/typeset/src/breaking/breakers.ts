import { adjustmentRatio, isBreak, lineStart, lineWidth, type Glue, type Item, type Paragraph } from "./paragraph.ts";

/**
 * A breaker: a strategy that chooses the breaks of a paragraph for the line width `width`. It gives the indices of the
 * items where the lines end, in order. A breaker reads only the items, so any width function and any builder work with it.
 */
export interface Breaker {
  readonly name: string;
  breaks(paragraph: Paragraph, width: number): number[];
}

/**
 * The greedy breaker: first fit, as a browser with `text-wrap: wrap`. Each line takes the items while they fit in the width.
 * A box that is wider than a line stays whole on its own line.
 */
export const greedy: Breaker = {
  name: "greedy",
  breaks: (paragraph, width) => greedyBreaks(paragraph, width),
};

/**
 * This function gives the breaks of the greedy breaker. After each break, it reads the items again from the start of the new
 * line, so that each break opportunity of the new line counts.
 */
function greedyBreaks(paragraph: Paragraph, width: number): number[] {
  const { items } = paragraph;
  const breaks: number[] = [];
  let used = 0;
  let candidate = -1;
  const breakAt = (index: number): number => {
    breaks.push(index);
    used = 0;
    candidate = -1;
    return lineStart(items, index) - 1;
  };
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.type === "box") {
      used += item.width;
      if (used > width && candidate >= 0) i = breakAt(candidate);
    } else if (item.type === "penalty" && item.cost === -Infinity) {
      i = breakAt(i);
    } else if (item.type === "glue") {
      if (isBreak(items, i)) candidate = i;
      used += item.width;
    } else if (isBreak(items, i) && used + item.width <= width) {
      candidate = i;
    }
  }
  return breaks;
}

/** The options of the total fit breaker. */
export interface TotalFitOptions {
  /** The cost of each line, as `\linepenalty` of TeX. A larger value gives fewer lines. The default is 10. */
  readonly linePenalty?: number;
  /** The cost of two hyphen breaks in sequence. The default is 3000, as `\doublehyphendemerits` of TeX. */
  readonly flaggedCost?: number;
}

/**
 * This function gives the total fit breaker of Knuth and Plass. It chooses the breaks with the least sum of demerits over all
 * the lines. A paragraph with no stretch and no shrink has a ragged right edge. The demerits of a line are then
 * `(linePenalty + 100 r²)²` plus the square of the cost of its penalty. The ratio `r` is the free space divided by the width.
 * The last line has `r = 0`.
 *
 * A paragraph with glue that has stretch or shrink has a justified edge. The demerits then use `100 |r|³` with the ratio of
 * `adjustmentRatio`, and the last line does not stretch. A line that needs more shrink than it has counts first. Thus the
 * breaker keeps such a line only when each set of breaks has one.
 */
export function totalFit(options: TotalFitOptions = {}): Breaker {
  const linePenalty = options.linePenalty ?? 10;
  const flaggedCost = options.flaggedCost ?? 3000;
  return {
    name: "total-fit",
    breaks: (paragraph, width) => totalFitBreaks(paragraph, width, linePenalty, flaggedCost),
  };
}

/** The total fit breaker with the default options. */
export const knuthPlass: Breaker = totalFit();

/** The largest badness of a justified line. An infinite ratio gets this value, so the sum of the demerits stays finite. */
const worstBadness = 1e8;

/** This function gives the breaks of the total fit breaker, by dynamic programming over the break opportunities. */
function totalFitBreaks(paragraph: Paragraph, width: number, linePenalty: number, flaggedCost: number): number[] {
  const { items } = paragraph;
  // The nodes: the start of the paragraph (-1), each break opportunity, and the end (items.length)
  const nodes = [-1];
  for (let i = 0; i < items.length; i++) if (isBreak(items, i)) nodes.push(i);
  nodes.push(items.length);
  const best = new Array<number>(nodes.length).fill(Infinity);
  const previous = new Array<number>(nodes.length).fill(-1);
  const justified = items.some((item) => item.type === "glue" && ((item.stretch ?? 0) > 0 || (item.shrink ?? 0) > 0));
  // The count of lines over their shrink comes before the demerits. It stays 0 for a ragged edge.
  const over = new Array<number>(nodes.length).fill(justified ? Infinity : 0);
  over[0] = 0;
  best[0] = 0;
  // With no glue that shrinks by more than its width, the least width of a line grows with its end
  const steady = items.every((item) => item.type !== "glue" || (item.shrink ?? 0) <= item.width);
  for (let a = 0; a < nodes.length - 1; a++) {
    if (best[a] === Infinity) continue;
    const start = a === 0 ? 0 : lineStart(items, nodes[a]!);
    const flaggedBefore = a > 0 && isFlagged(paragraph, nodes[a]!);
    for (let b = a + 1; b < nodes.length; b++) {
      const end = nodes[b]!;
      const last = b === nodes.length - 1;
      const used = lineWidth(items, start, end);
      const fit = justified ? adjustmentRatio(items, start, end, width) : 0;
      const overflow = justified ? fit < -1 : used > width;
      // A line wider than the width is possible only when no break opportunity is inside it
      if (overflow && b > a + 1) {
        // Only the text of the penalty can make the line too wide. A later break has no such text, so it can fit.
        if (items[end]?.type === "penalty" && !(steady && leastWidth(items, start, end, used, justified) > width)) continue;
        break;
      }
      const penalty = items[end];
      const cost = penalty?.type === "penalty" ? penalty.cost : 0;
      const ratio = last || overflow ? 0 : (width - used) / width;
      const badness = justified ? Math.min(100 * Math.abs(last ? Math.min(fit, 0) : fit) ** 3, worstBadness) : 100 * ratio * ratio;
      let demerits = (linePenalty + badness) ** 2;
      if (cost > 0) demerits += cost * cost;
      else if (cost > -Infinity && cost < 0) demerits -= cost * cost;
      if (flaggedBefore && isFlagged(paragraph, end)) demerits += flaggedCost;
      const total = best[a]! + demerits;
      const count = over[a]! + (justified && overflow ? 1 : 0);
      if (count < over[b]! || (count === over[b]! && total < best[b]!)) {
        over[b] = count;
        best[b] = total;
        previous[b] = a;
      }
      // A forced break ends each line that comes to it
      if (cost === -Infinity) break;
    }
  }
  const breaks: number[] = [];
  for (let b = previous[nodes.length - 1]!; b > 0; b = previous[b]!) breaks.push(nodes[b]!);
  return breaks.reverse();
}

/**
 * This function gives the least width of the line from `start` to `end`, without the text of the penalty at `end`. It is
 * the width `used` less that text, and less the shrink of the glue for a justified edge. A later break of the line has no
 * smaller least width when no glue shrinks by more than its width.
 */
function leastWidth(items: readonly Item[], start: number, end: number, used: number, justified: boolean): number {
  let least = used - items[end]!.width;
  if (justified) for (let i = start; i < end; i++) least -= items[i]!.type === "glue" ? ((items[i] as Glue).shrink ?? 0) : 0;
  return least;
}

/** This function tells if the item `index` is a flagged penalty. */
function isFlagged(paragraph: Paragraph, index: number): boolean {
  const item = paragraph.items[index];
  return item?.type === "penalty" && item.flagged;
}

/** The options of the balanced breaker. */
export interface BalancedOptions {
  /** The steps of the search for the width. The default is 32. */
  readonly steps?: number;
}

/**
 * This function gives the balanced breaker, as a browser with `text-wrap: balance`. It keeps the line count of the greedy
 * breaker, and it finds the least width that gives that count. Thus the lines have more equal widths.
 */
export function balancedBreaker(options: BalancedOptions = {}): Breaker {
  const steps = options.steps ?? 32;
  return {
    name: "balanced",
    breaks: (paragraph, width) => {
      const count = greedyBreaks(paragraph, width).length;
      let low = 0;
      let high = width;
      for (let step = 0; step < steps; step++) {
        const middle = (low + high) / 2;
        if (greedyBreaks(paragraph, middle).length === count) high = middle;
        else low = middle;
      }
      return greedyBreaks(paragraph, high);
    },
  };
}

/** The balanced breaker with the default options. */
export const balanced: Breaker = balancedBreaker();

/** The breakers of the package, by name. */
export const breakers: Readonly<Record<"greedy" | "total-fit" | "balanced", Breaker>> = { greedy, "total-fit": knuthPlass, balanced };
