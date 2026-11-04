/**
 * The `Text` rope: a persistent balanced tree of strings with the width and the length of each subtree. An edit makes a
 * new rope. The new rope shares the subtrees that do not change. The tree is the `SummaryTree` of
 * `@procedures/collections`, and this module gives it the summary of a text.
 *
 * A width function gives the width of a run of text. The rope uses it only for the leaves and for the windows at the
 * seams. Thus an edit uses it of the order of `log n` times. The rope keeps the widths of the short windows, so an edit
 * measures only the windows that it changes. `Text.from` clears this memory.
 *
 * The seams are exact when the width function obeys the separator law. For each text `p + s + q` with a separator `s`:
 * `width(p + s + q) = width(p + s) + width(s + q) - width(s)`. The model of `@mark1russell7/typeset/fonts` obeys it for a space and a
 * tab. It shapes each word alone, and its kerning goes only between two adjacent glyphs.
 */
import { SummaryTree, type SummarySpec } from "@procedures/collections";
import type { WidthOf } from "../breaking/paragraph.ts";

/** The options of a rope. */
export interface TextOptions {
  /**
   * The separators of the separator law: each character is one UTF-16 code unit. The default is a space and a tab. An
   * empty string makes each seam measure the full text of the two sides.
   */
  readonly separators?: string;
  /** The largest count of UTF-16 code units in a leaf. The default is 256. */
  readonly chunk?: number;
}

/** The summary of a run of text: its length, its width, and the two ends that a seam measures again. */
interface Summary {
  /** The count of UTF-16 code units. */
  readonly length: number;
  readonly width: number;
  /** This value is `true` when the text has a separator. */
  readonly separated: boolean;
  /** The text through the first separator, or all the text when the text has no separator. */
  readonly head: string;
  readonly headWidth: number;
  /** The text from the last separator, or all the text when the text has no separator. */
  readonly tail: string;
  readonly tailWidth: number;
}

/** The summary of the empty text. */
const noText: Summary = { length: 0, width: 0, separated: false, head: "", headWidth: 0, tail: "", tailWidth: 0 };

/** The shared state of the ropes of one width function and one set of options. */
interface Context {
  readonly width: WidthOf;
  readonly separators: string;
  readonly chunk: number;
  readonly spec: SummarySpec<string, Summary>;
  /** The widths of the short windows. An edit gives the tree new paths, and most windows on these paths do not change. */
  readonly windows: Map<string, number>;
}

/** The largest count of windows in the memory of a context. */
const windowLimit = 16_384;

/** This function gives the width of a window. A window longer than a leaf stays out of the memory. */
function windowWidth(context: Context, window: string): number {
  if (window.length > context.chunk) return context.width(window);
  const known = context.windows.get(window);
  if (known !== undefined) return known;
  const width = context.width(window);
  if (context.windows.size >= windowLimit) context.windows.clear();
  context.windows.set(window, width);
  return width;
}

function isSeparator(separators: string, code: number): boolean {
  for (let i = 0; i < separators.length; i++) if (separators.charCodeAt(i) === code) return true;
  return false;
}

function summaryOfLeaf(context: Context, text: string): Summary {
  const { separators } = context;
  const whole = context.width(text);
  let first = -1;
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    if (!isSeparator(separators, text.charCodeAt(i))) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return { length: text.length, width: whole, separated: false, head: text, headWidth: whole, tail: text, tailWidth: whole };
  const head = text.slice(0, first + 1);
  const tail = text.slice(last);
  return { length: text.length, width: whole, separated: true, head, headWidth: windowWidth(context, head), tail, tailWidth: windowWidth(context, tail) };
}

/**
 * This function gives the summary of two runs in the order of the text. It measures one window: the tail of the left run and
 * the head of the right run. The separator law then gives the width of all the text from the widths of the two runs.
 */
function combine(context: Context, left: Summary, right: Summary): Summary {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const seam = left.tail + right.head;
  const seamWidth = windowWidth(context, seam);
  let width: number;
  if (!left.separated && !right.separated) width = seamWidth;
  else if (!left.separated) width = right.width - right.headWidth + seamWidth;
  else if (!right.separated) width = left.width - left.tailWidth + seamWidth;
  else width = left.width + right.width - left.tailWidth - right.headWidth + seamWidth;
  return {
    length: left.length + right.length,
    width,
    separated: left.separated || right.separated,
    head: left.separated ? left.head : seam,
    headWidth: left.separated ? left.headWidth : seamWidth,
    tail: right.separated ? right.tail : seam,
    tailWidth: right.separated ? right.tailWidth : seamWidth,
  };
}

/** The contexts of each width function. Two ropes join only when their trees have the same spec. */
const contexts = new WeakMap<WidthOf, Map<string, Context>>();

function contextOf(width: WidthOf, separators: string, chunk: number): Context {
  const own = contexts.get(width) ?? new Map<string, Context>();
  contexts.set(width, own);
  const key = `${chunk}/${separators}`;
  const known = own.get(key);
  if (known !== undefined) return known;
  const spec: SummarySpec<string, Summary> = {
    monoid: { empty: noText, combine: (left, right) => combine(context, left, right) },
    measure: (leaf) => summaryOfLeaf(context, leaf),
    merge: (left, right) => (left.length + right.length <= chunk ? left + right : undefined),
  };
  const context: Context = { width, separators, chunk, spec, windows: new Map() };
  own.set(key, context);
  return context;
}

/** This function gives the end of the next leaf of `text` from `start`: after a separator when it can, and not in a surrogate pair. */
function chunkEnd(context: Context, text: string, start: number): number {
  const limit = start + context.chunk;
  if (limit >= text.length) return text.length;
  for (let i = limit - 1; i >= start + context.chunk / 2; i--) if (isSeparator(context.separators, text.charCodeAt(i))) return i + 1;
  const code = text.charCodeAt(limit - 1);
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

/** This function divides a text into leaves of at most `chunk` code units. */
function chunksOf(context: Context, text: string): string[] {
  const out: string[] = [];
  for (let start = 0; start < text.length; ) {
    const end = chunkEnd(context, text, start);
    out.push(text.slice(start, end));
    start = end;
  }
  return out;
}

const lengthOf = (summary: Summary): number => summary.length;

/**
 * A text with its width: a persistent balanced rope. Each edit gives a new `Text` and does not change this one. The offsets
 * are in UTF-16 code units, as the offsets of a JavaScript string.
 */
export class Text {
  readonly #context: Context;
  readonly #tree: SummaryTree<string, Summary>;

  private constructor(context: Context, tree: SummaryTree<string, Summary>) {
    this.#context = context;
    this.#tree = tree;
  }

  /** This function makes the rope of `text` with the width function `width`. */
  static from(text: string, width: WidthOf, options: TextOptions = {}): Text {
    const separators = options.separators ?? " \t";
    const chunk = options.chunk ?? 256;
    if (!Number.isInteger(chunk) || chunk < 2) throw new RangeError(`the chunk is ${chunk}, not an integer of 2 or more`);
    for (let i = 0; i < separators.length; i++) {
      const code = separators.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdfff) throw new RangeError("a separator is one UTF-16 code unit, not a half of a surrogate pair");
    }
    const context = contextOf(width, separators, chunk);
    // A new rope measures again: the width function can change its result when a font loads
    context.windows.clear();
    return new Text(context, SummaryTree.of(context.spec, chunksOf(context, text)));
  }

  /** The count of UTF-16 code units of the text. */
  get length(): number {
    return this.#tree.summary.length;
  }

  /** The width of the text. It is equal to the width of the flat string when the width function obeys the separator law. */
  get width(): number {
    return this.#tree.summary.width;
  }

  /** The height of the tree: 0 for a text of one leaf. The tests use it to examine the balance. */
  get height(): number {
    return Math.max(0, this.#tree.height - 1);
  }

  /** This function gives the flat string. */
  toString(): string {
    return this.chunks().join("");
  }

  /** This function gives the strings of the leaves in the order of the text. */
  chunks(): string[] {
    return [...this.#tree];
  }

  /** This function gives the text from `start` to `end`, as a new rope. */
  slice(start: number, end: number = this.length): Text {
    this.#check(start, end);
    if (start === end) return new Text(this.#context, this.#tree.slice(0, 0));
    const first = this.#tree.locate(lengthOf, start)!;
    const last = this.#tree.locate(lengthOf, end - 1)!;
    const stop = first.offset + end - start;
    const middle = this.#tree.slice(first.index, last.index + 1);
    if (first.index === last.index) return new Text(this.#context, middle.set(0, first.leaf.slice(first.offset, stop)));
    return new Text(this.#context, middle.set(-1, last.leaf.slice(0, last.offset + 1)).set(0, first.leaf.slice(first.offset)));
  }

  /** This function gives the width of the text from `start` to `end`. */
  widthOf(start: number, end: number = this.length): number {
    return this.slice(start, end).width;
  }

  /** This function gives this text and then `other`. The two ropes must have the same width function and options. */
  concat(other: Text): Text {
    if (other.#context !== this.#context) throw new TypeError("the two ropes have different width functions or options");
    return new Text(this.#context, this.#tree.concat(other.#tree));
  }

  /** This function puts `text` at the offset `at`. */
  insert(at: number, text: string): Text {
    return this.replace(at, at, text);
  }

  /** This function removes the text from `start` to `end`. */
  remove(start: number, end: number): Text {
    return this.replace(start, end, "");
  }

  /** This function puts `text` in place of the text from `start` to `end`. */
  replace(start: number, end: number, text: string): Text {
    this.#check(start, end);
    if (start === end && text.length === 0) return this;
    const size = this.#tree.size;
    if (size === 0) return Text.from(text, this.#context.width, this.#context);
    const first = this.#tree.locate(lengthOf, start) ?? this.#lastPlace();
    const last = start === end ? first : this.#tree.locate(lengthOf, end - 1)!;
    const lastEnd = start === end ? first.offset : last.offset + 1;
    const fresh = first.leaf.slice(0, first.offset) + text + last.leaf.slice(lastEnd);
    const leaves = chunksOf(this.#context, fresh);
    // One long leaf in place of one leaf changes only a path. A short leaf goes through the seams, so that it can merge
    if (first.index === last.index && leaves.length === 1 && leaves[0]!.length * 2 >= this.#context.chunk) {
      return new Text(this.#context, this.#tree.set(first.index, leaves[0]!));
    }
    return new Text(this.#context, this.#tree.splice(first.index, last.index - first.index + 1, leaves));
  }

  /** This function gives the place after the last code unit: the end of the last leaf. */
  #lastPlace(): { index: number; leaf: string; offset: number } {
    const leaf = this.#tree.at(-1)!;
    return { index: this.#tree.size - 1, leaf, offset: leaf.length };
  }

  #check(start: number, end: number): void {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.length) {
      throw new RangeError(`the range ${start} to ${end} is not in the text of length ${this.length}`);
    }
  }
}
