/**
 * The paragraph model of the breakers: a list of boxes, glue and penalties, as Knuth and Plass define it. A builder makes
 * the items of a text. The breakers read only the items, so a new rule of break opportunities is a new builder.
 */

/** A width function: the width of a run of text, in any unit. The breakers add the widths and compare them. */
export type WidthOf = (text: string) => number;

/** A box: text that the breaker does not break. */
export interface Box {
  readonly type: "box";
  readonly text: string;
  readonly width: number;
}

/** Glue: a space between two boxes. A line can end at glue that comes after a box. The line then does not show the glue. */
export interface Glue {
  readonly type: "glue";
  readonly text: string;
  readonly width: number;
}

/**
 * A penalty: a break opportunity with a cost. A line that ends at the penalty shows its text, for example a hyphen. A cost of
 * `Infinity` forbids the break, and a cost of `-Infinity` forces it.
 */
export interface Penalty {
  readonly type: "penalty";
  readonly text: string;
  readonly width: number;
  readonly cost: number;
  /** A flagged penalty is a hyphen. Total fit adds a cost to two flagged breaks in sequence. */
  readonly flagged: boolean;
}

/** An item of a paragraph. */
export type Item = Box | Glue | Penalty;

/** A paragraph: the items in the order of the text. */
export interface Paragraph {
  readonly items: readonly Item[];
}

/** The options of `paragraphOf`. */
export interface ParagraphOptions {
  /** The width function of the boxes, the spaces and the hyphens. */
  readonly widthOf: WidthOf;
  /**
   * The hyphenation hook. It gives the offsets in a word where a break with a hyphen is possible. The default gives no
   * offset. The width of each part of a word comes from `widthOf`, so the kerning across an offset is not in the sum.
   */
  readonly hyphenate?: (word: string) => readonly number[];
  /**
   * The hook of the break places inside a word, for example `lineBreaks` of `./segmentation`. It gives offsets in a word where
   * a line can end with no hyphen and no cost. The default gives no offset. This hook wins at an offset that `hyphenate` also gives.
   */
  readonly breaks?: (word: string) => readonly number[];
  /** The text that a line shows at a hyphen break. The default is "-". */
  readonly hyphen?: string;
  /** The cost of a hyphen break. The default is 50, as in TeX. */
  readonly hyphenCost?: number;
}

const whiteSpace = /\s+/u;

/**
 * This function makes the paragraph of a text with the break opportunities of CSS `white-space: normal`. Each run of white
 * space becomes one glue of the width of a space. Each word between two runs becomes a box, or boxes and hyphen penalties.
 */
export function paragraphOf(text: string, options: ParagraphOptions): Paragraph {
  const { widthOf } = options;
  const hyphen = options.hyphen ?? "-";
  const hyphenCost = options.hyphenCost ?? 50;
  const space = widthOf(" ");
  const hyphenWidth = options.hyphenate === undefined ? 0 : widthOf(hyphen);
  const items: Item[] = [];
  for (const word of text.split(whiteSpace)) {
    if (word === "") continue;
    if (items.length > 0) items.push({ type: "glue", text: " ", width: space });
    const free = new Set(options.breaks?.(word) ?? []);
    const offsets = [...new Set([...(options.hyphenate?.(word) ?? []), ...free])].filter((o) => o > 0 && o < word.length).sort((a, b) => a - b);
    let start = 0;
    for (const offset of offsets) {
      const part = word.slice(start, offset);
      items.push({ type: "box", text: part, width: widthOf(part) });
      items.push(free.has(offset) ? { type: "penalty", text: "", width: 0, cost: 0, flagged: false } : { type: "penalty", text: hyphen, width: hyphenWidth, cost: hyphenCost, flagged: true });
      start = offset;
    }
    const last = word.slice(start);
    items.push({ type: "box", text: last, width: widthOf(last) });
  }
  return { items };
}

/** A line of a broken paragraph. */
export interface Line {
  readonly text: string;
  /** The width of the line: its boxes, the glue between them and the text of a penalty at its end. */
  readonly width: number;
  /** The index of the first item of the line. */
  readonly start: number;
  /** The index after the last item of the line. A break at glue or at a penalty has the index of that item. */
  readonly end: number;
}

/** This function tells if a line can end at the item `index`: glue after a box, or a penalty with a cost below `Infinity`. */
export function isBreak(items: readonly Item[], index: number): boolean {
  const item = items[index]!;
  if (item.type === "glue") return index > 0 && items[index - 1]!.type === "box";
  return item.type === "penalty" && item.cost < Infinity;
}

/** This function gives the index of the first item of a line after a break at `index`. It skips the glue and the penalties. */
export function lineStart(items: readonly Item[], index: number): number {
  let i = index + 1;
  while (i < items.length && items[i]!.type !== "box") i++;
  return i;
}

/** This function gives the width of the line from the item `start` to a break at `end`, with the text of a penalty at `end`. */
export function lineWidth(items: readonly Item[], start: number, end: number): number {
  let width = 0;
  for (let i = start; i < end; i++) {
    const item = items[i]!;
    if (item.type !== "penalty") width += item.width;
  }
  const last = items[end];
  return last?.type === "penalty" ? width + last.width : width;
}

/**
 * This function gives the lines of a paragraph from the indices of its breaks. Each break is the index of glue or of a penalty.
 * The last line ends at the end of the items.
 */
export function linesOf(paragraph: Paragraph, breaks: readonly number[]): Line[] {
  const { items } = paragraph;
  const lines: Line[] = [];
  let start = 0;
  for (const end of [...breaks, items.length]) {
    let text = "";
    for (let i = start; i < end; i++) {
      const item = items[i]!;
      if (item.type !== "penalty") text += item.text;
    }
    const last = items[end];
    if (last?.type === "penalty") text += last.text;
    lines.push({ text, width: lineWidth(items, start, end), start, end });
    start = lineStart(items, end);
  }
  return lines;
}
