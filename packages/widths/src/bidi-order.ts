/**
 * The browser read of the bidi order (T13b). The texts mix Latin and Hebrew letters, European and Arabic digits, paired
 * brackets, marks of direction and explicit controls. A browser gives the position of each character, and this module
 * compares their order with `visualIndexes` of `@mark1russell7/typeset/bidi` in an LTR paragraph. This module has no
 * browser code, so the tests examine it in Node.
 */
import { random as createRandom } from "@mark1russell7/rigor-generators";
import { bidiClass, resolveText, visualIndexes, type BidiClass } from "@mark1russell7/typeset/bidi";

/**
 * The pieces of the texts. Each piece is in the Basic Multilingual Plane, so an index of a code point is also an index
 * of a UTF-16 unit. No pair of the letters makes a ligature in a common font.
 */
const pieces: readonly string[] = [
  "a", "b", "c", "x", "y", "z",
  "א", "ב", "ג", "ד", "ה", "ו",
  "1", "2", "3", "١", "٢", "٣",
  "(", ")", "[", "]", "+", "-", ".", ",", "%", "!", " ",
  "‎", "‏", "؜",
  "‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩",
];

/** The classes that the compare reads. A character of another class has no width, or its place at the edge of a run is not fixed. */
const compared: ReadonlySet<BidiClass> = new Set(["L", "R", "AL", "EN", "AN", "ES", "ET", "CS", "ON"]);

/** One text of the read, with the indexes that the compare reads and their visual order from the rules. */
export interface OrderCase {
  readonly text: string;
  /** The indexes of the compared characters, in the logical order. */
  readonly indexes: readonly number[];
  /** The same indexes in the visual order of `visualIndexes`, from left to right. */
  readonly expected: readonly number[];
}

/** The marks of direction LRM, RLM and ALM. Their classes are L, R and AL, but they have no width, so the compare does not read them. */
const marks: ReadonlySet<number> = new Set([0x200e, 0x200f, 0x061c]);

/** This function tells if the compare reads the character at an index: its class is in the list, and it is not a mark of direction. */
function isCompared(text: string, index: number): boolean {
  const codePoint = text.codePointAt(index)!;
  return !marks.has(codePoint) && compared.has(bidiClass(codePoint));
}

/** This function gives the case of a text: the compared indexes, and their order from `resolveText` in an LTR paragraph. */
export function orderCase(text: string): OrderCase {
  const indexes = Array.from({ length: text.length }, (_, index) => index).filter((index) => isCompared(text, index));
  const kept = new Set(indexes);
  const expected = visualIndexes(resolveText(text, 0)).filter((index) => kept.has(index));
  return { text, indexes, expected };
}

/**
 * This function gives the seeded texts of the read. Each text has 3 to 14 pieces, with a compared character at each end, so
 * no space is at an end of the line.
 */
export function orderTexts(seed: number, count: number): string[] {
  const random = createRandom(seed);
  const texts: string[] = [];
  while (texts.length < count) {
    const length = 3 + random.below(12);
    const text = Array.from({ length }, () => pieces[random.below(pieces.length)]!).join("");
    if (text.length > 0 && isCompared(text, 0) && isCompared(text, text.length - 1)) texts.push(text);
  }
  return texts;
}

/** The position of a character on the line: its index and the center of its box. */
export interface Placed {
  readonly index: number;
  readonly center: number;
}

/** This function gives the indexes in their order on the line, from left to right. Two equal centers keep the logical order. */
export function orderOfPlaces(places: readonly Placed[]): number[] {
  return [...places].sort((a, b) => a.center - b.center || a.index - b.index).map((place) => place.index);
}

/** The result of one browser. */
export interface BrowserOrder {
  readonly browser: string;
  readonly version: string;
  readonly texts: number;
  readonly matched: number;
  /** The first texts that do not match, with the two orders. */
  readonly mismatches: readonly { readonly text: string; readonly expected: readonly number[]; readonly actual: readonly number[] }[];
}

/** This function compares the orders of a browser with the cases. It keeps at most `keep` mismatches in the result. */
export function compareOrders(browser: string, version: string, cases: readonly OrderCase[], actual: readonly (readonly number[])[], keep = 20): BrowserOrder {
  const mismatches: { text: string; expected: readonly number[]; actual: readonly number[] }[] = [];
  let matched = 0;
  cases.forEach((item, i) => {
    const order = actual[i] ?? [];
    if (order.length === item.expected.length && order.every((index, k) => index === item.expected[k])) matched++;
    else if (mismatches.length < keep) mismatches.push({ text: item.text, expected: item.expected, actual: order });
  });
  return { browser, version, texts: cases.length, matched, mismatches };
}
