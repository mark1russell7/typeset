/**
 * The `Text` rope: a persistent balanced tree of strings with the width and the length of each subtree. An edit makes a
 * new rope. The new rope shares the subtrees that do not change. A width function gives the width of a run of text. The
 * rope uses it only for the leaves and for the windows at the seams. Thus an edit uses it of the order of `log n` times.
 *
 * The seams are exact when the width function obeys the separator law. For each text `p + s + q` with a separator `s`:
 * `width(p + s + q) = width(p + s) + width(s + q) - width(s)`. The model of `@typeset/fonts` obeys it for a space and a
 * tab. It shapes each word alone, and its kerning goes only between two adjacent glyphs.
 */
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

/** The summary of a subtree: its length, its width, and the two ends that a seam measures again. */
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

interface Leaf extends Summary {
  readonly kind: "leaf";
  readonly text: string;
  readonly height: 0;
}

interface Branch extends Summary {
  readonly kind: "branch";
  readonly left: Node;
  readonly right: Node;
  readonly height: number;
}

type Node = Leaf | Branch;

/** The shared state of the ropes of one width function and one set of options. */
interface Context {
  readonly width: WidthOf;
  readonly separators: string;
  readonly chunk: number;
}

function isSeparator(context: Context, code: number): boolean {
  for (let i = 0; i < context.separators.length; i++) if (context.separators.charCodeAt(i) === code) return true;
  return false;
}

function leafOf(context: Context, text: string): Leaf {
  const width = context.width(text);
  let first = -1;
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    if (!isSeparator(context, text.charCodeAt(i))) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return { kind: "leaf", text, height: 0, length: text.length, width, separated: false, head: text, headWidth: width, tail: text, tailWidth: width };
  const head = text.slice(0, first + 1);
  const tail = text.slice(last);
  return { kind: "leaf", text, height: 0, length: text.length, width, separated: true, head, headWidth: context.width(head), tail, tailWidth: context.width(tail) };
}

/**
 * This function makes the branch of two subtrees. It measures one window: the tail of the left side and the head of the right
 * side. The separator law then gives the width of all the text from the widths of the two sides.
 */
function branchOf(context: Context, left: Node, right: Node): Branch {
  const seam = left.tail + right.head;
  const seamWidth = context.width(seam);
  let width: number;
  if (!left.separated && !right.separated) width = seamWidth;
  else if (!left.separated) width = right.width - right.headWidth + seamWidth;
  else if (!right.separated) width = left.width - left.tailWidth + seamWidth;
  else width = left.width + right.width - left.tailWidth - right.headWidth + seamWidth;
  return {
    kind: "branch",
    left,
    right,
    height: Math.max(left.height, right.height) + 1,
    length: left.length + right.length,
    width,
    separated: left.separated || right.separated,
    head: left.separated ? left.head : seam,
    headWidth: left.separated ? left.headWidth : seamWidth,
    tail: right.separated ? right.tail : seam,
    tailWidth: right.separated ? right.tailWidth : seamWidth,
  };
}

/** This function joins two trees in the order of the text and keeps the heights of the two children within 1. */
function join(context: Context, left: Node | undefined, right: Node | undefined): Node | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (left.kind === "leaf" && right.kind === "leaf" && left.length + right.length <= context.chunk) return leafOf(context, left.text + right.text);
  if (left.height > right.height + 1) {
    const branch = left as Branch;
    const joined = join(context, branch.right, right)!;
    if (joined.height <= branch.left.height + 1) return branchOf(context, branch.left, joined);
    return rotateLeft(context, branch.left, joined as Branch);
  }
  if (right.height > left.height + 1) {
    const branch = right as Branch;
    const joined = join(context, left, branch.left)!;
    if (joined.height <= branch.right.height + 1) return branchOf(context, joined, branch.right);
    return rotateRight(context, joined as Branch, branch.right);
  }
  return branchOf(context, left, right);
}

/** This function balances the branch of `left` and `heavy`, when `heavy` is 2 levels higher than `left`. */
function rotateLeft(context: Context, left: Node, heavy: Branch): Branch {
  if (heavy.left.height <= heavy.right.height) return branchOf(context, branchOf(context, left, heavy.left), heavy.right);
  const middle = heavy.left as Branch;
  return branchOf(context, branchOf(context, left, middle.left), branchOf(context, middle.right, heavy.right));
}

/** This function balances the branch of `heavy` and `right`, when `heavy` is 2 levels higher than `right`. */
function rotateRight(context: Context, heavy: Branch, right: Node): Branch {
  if (heavy.right.height <= heavy.left.height) return branchOf(context, heavy.left, branchOf(context, heavy.right, right));
  const middle = heavy.right as Branch;
  return branchOf(context, branchOf(context, heavy.left, middle.left), branchOf(context, middle.right, right));
}

/** This function divides a tree at the UTF-16 offset `at` into the text before and the text after. */
function split(context: Context, node: Node | undefined, at: number): [Node | undefined, Node | undefined] {
  if (node === undefined) return [undefined, undefined];
  if (at <= 0) return [undefined, node];
  if (at >= node.length) return [node, undefined];
  if (node.kind === "leaf") return [leafOf(context, node.text.slice(0, at)), leafOf(context, node.text.slice(at))];
  if (at === node.left.length) return [node.left, node.right];
  if (at < node.left.length) {
    const [before, after] = split(context, node.left, at);
    return [before, join(context, after, node.right)];
  }
  const [before, after] = split(context, node.right, at - node.left.length);
  return [join(context, node.left, before), after];
}

/** This function gives the end of the next leaf of `text` from `start`: after a separator when it can, and not in a surrogate pair. */
function chunkEnd(context: Context, text: string, start: number): number {
  const limit = start + context.chunk;
  if (limit >= text.length) return text.length;
  for (let i = limit - 1; i >= start + context.chunk / 2; i--) if (isSeparator(context, text.charCodeAt(i))) return i + 1;
  const code = text.charCodeAt(limit - 1);
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

/** This function makes a balanced tree of a text: leaves of at most `chunk` code units, and then a level of branches at a time. */
function build(context: Context, text: string): Node | undefined {
  let level: Node[] = [];
  for (let start = 0; start < text.length; ) {
    const end = chunkEnd(context, text, start);
    level.push(leafOf(context, text.slice(start, end)));
    start = end;
  }
  if (level.length === 0) return undefined;
  while (level.length > 1) {
    const next: Node[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) next.push(branchOf(context, level[i]!, level[i + 1]!));
    if (level.length % 2 === 1) next.push(level[level.length - 1]!);
    level = next;
  }
  return level[0];
}

function leaves(node: Node | undefined, out: string[]): string[] {
  if (node === undefined) return out;
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.kind === "leaf") out.push(top.text);
    else stack.push(top.right, top.left);
  }
  return out;
}

/**
 * A text with its width: a persistent balanced rope. Each edit gives a new `Text` and does not change this one. The offsets
 * are in UTF-16 code units, as the offsets of a JavaScript string.
 */
export class Text {
  readonly #context: Context;
  readonly #root: Node | undefined;

  private constructor(context: Context, root: Node | undefined) {
    this.#context = context;
    this.#root = root;
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
    const context: Context = { width, separators, chunk };
    return new Text(context, build(context, text));
  }

  /** The count of UTF-16 code units of the text. */
  get length(): number {
    return this.#root?.length ?? 0;
  }

  /** The width of the text. It is equal to the width of the flat string when the width function obeys the separator law. */
  get width(): number {
    return this.#root?.width ?? 0;
  }

  /** The height of the tree: 0 for a text of one leaf. The tests use it to examine the balance. */
  get height(): number {
    return this.#root?.height ?? 0;
  }

  /** This function gives the flat string. */
  toString(): string {
    return leaves(this.#root, []).join("");
  }

  /** This function gives the strings of the leaves in the order of the text. */
  chunks(): string[] {
    return leaves(this.#root, []);
  }

  /** This function gives the text from `start` to `end`, as a new rope. */
  slice(start: number, end: number = this.length): Text {
    this.#check(start, end);
    const [, after] = split(this.#context, this.#root, start);
    const [middle] = split(this.#context, after, end - start);
    return new Text(this.#context, middle);
  }

  /** This function gives the width of the text from `start` to `end`. */
  widthOf(start: number, end: number = this.length): number {
    return this.slice(start, end).width;
  }

  /** This function gives this text and then `other`. The two ropes must have the same width function and options. */
  concat(other: Text): Text {
    const context = other.#context;
    if (context.width !== this.#context.width || context.separators !== this.#context.separators || context.chunk !== this.#context.chunk) {
      throw new TypeError("the two ropes have different width functions or options");
    }
    return new Text(this.#context, join(this.#context, this.#root, other.#root));
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
    const [before, rest] = split(this.#context, this.#root, start);
    const [, after] = split(this.#context, rest, end - start);
    const middle = build(this.#context, text);
    return new Text(this.#context, join(this.#context, join(this.#context, before, middle), after));
  }

  #check(start: number, end: number): void {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.length) {
      throw new RangeError(`the range ${start} to ${end} is not in the text of length ${this.length}`);
    }
  }
}
