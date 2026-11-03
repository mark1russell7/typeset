import { isBreak, lineStart, lineWidth, type Paragraph } from "./paragraph.ts";

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
 * This function gives the total fit breaker of Knuth and Plass for text with a ragged right edge. It chooses the breaks with
 * the least sum of demerits over all the lines. The demerits of a line are `(linePenalty + 100 r²)²` plus the square of the
 * cost of its penalty. The ratio `r` is the free space of the line divided by the width. The last line has `r = 0`.
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

/** This function gives the breaks of the total fit breaker, by dynamic programming over the break opportunities. */
function totalFitBreaks(paragraph: Paragraph, width: number, linePenalty: number, flaggedCost: number): number[] {
  const { items } = paragraph;
  // The nodes: the start of the paragraph (-1), each break opportunity, and the end (items.length)
  const nodes = [-1];
  for (let i = 0; i < items.length; i++) if (isBreak(items, i)) nodes.push(i);
  nodes.push(items.length);
  const best = new Array<number>(nodes.length).fill(Infinity);
  const previous = new Array<number>(nodes.length).fill(-1);
  best[0] = 0;
  for (let a = 0; a < nodes.length - 1; a++) {
    if (best[a] === Infinity) continue;
    const start = a === 0 ? 0 : lineStart(items, nodes[a]!);
    const flaggedBefore = a > 0 && isFlagged(paragraph, nodes[a]!);
    for (let b = a + 1; b < nodes.length; b++) {
      const end = nodes[b]!;
      const last = b === nodes.length - 1;
      const used = lineWidth(items, start, end);
      const overflow = used > width;
      // A line wider than the width is possible only when no break opportunity is inside it
      if (overflow && b > a + 1) {
        if (items[end]?.type === "penalty") continue;
        break;
      }
      const penalty = items[end];
      const cost = penalty?.type === "penalty" ? penalty.cost : 0;
      const ratio = last || overflow ? 0 : (width - used) / width;
      let demerits = (linePenalty + 100 * ratio * ratio) ** 2;
      if (cost > 0) demerits += cost * cost;
      else if (cost > -Infinity && cost < 0) demerits -= cost * cost;
      if (flaggedBefore && isFlagged(paragraph, end)) demerits += flaggedCost;
      const total = best[a]! + demerits;
      if (total < best[b]!) {
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
