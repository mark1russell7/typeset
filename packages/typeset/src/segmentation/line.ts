/**
 * The line break algorithm of UAX #14. The rules run in their order, and the first rule that matches decides. The class of a
 * code point comes from a table that the tool in `packages/conformance` makes from the property files of Unicode.
 */
import { classNames, classRuns, eastAsianRuns } from "./line-table.ts";

/** A place where a line can end. */
export interface LineBreak {
  /** The offset in UTF-16 units of the first character after the break. */
  readonly offset: number;
  /** This value is `true` when a line must end here, as at a line feed or at the end of the text. */
  readonly required: boolean;
}

interface Table {
  readonly starts: Uint32Array;
  readonly classes: Uint8Array;
  readonly east: Uint32Array;
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+-./:;<=>?@[]^_{|}~";
let table: Table | undefined;

/** This function decodes the runs one time, at the first use, so an import of the entry costs no work. */
function tableOf(): Table {
  if (table !== undefined) return table;
  const runs = [...classRuns.matchAll(/([0-9a-z]+)([^0-9a-z])/gu)];
  const starts = new Uint32Array(runs.length + 1);
  const classes = new Uint8Array(runs.length);
  let start = 0;
  runs.forEach((run, index) => {
    starts[index] = start;
    classes[index] = alphabet.indexOf(run[2]!);
    start += Number.parseInt(run[1]!, 36);
  });
  starts[runs.length] = start;
  const lengths = eastAsianRuns.split(" ").map((length) => Number.parseInt(length, 36));
  const east = new Uint32Array(lengths.length + 1);
  lengths.forEach((length, index) => {
    east[index + 1] = east[index]! + length;
  });
  table = { starts, classes, east };
  return table;
}

/** This function gives the index of the last start that is not above `code`. */
function indexOfRun(starts: Uint32Array, code: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (starts[middle]! <= code) low = middle;
    else high = middle;
  }
  return low;
}

/** One base character and its combining marks, as the rule LB9 treats them. */
interface Item {
  readonly name: string;
  readonly code: number;
  readonly start: number;
  readonly east: boolean;
  /** This value is `true` when the last code point of the item is U+200D. */
  zwj: boolean;
  /** This value is `true` when the base character has the class SA. The rules read the item as AL. */
  readonly complex: boolean;
}

const breakClasses = new Set(["BK", "CR", "LF", "NL", "SP", "ZW"]);

/** This function makes the items of a text. It applies the rules LB9 and LB10. */
function itemsOf(text: string): Item[] {
  const { starts, classes, east } = tableOf();
  const items: Item[] = [];
  let offset = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const name = classNames[classes[indexOfRun(starts, code)]!]!;
    const combining = name === "CM" || name === "ZWJ";
    const last = items.at(-1);
    if (combining && last !== undefined && !breakClasses.has(last.name)) last.zwj = name === "ZWJ";
    else if (combining) items.push({ name: "AL", code: 0x41, start: offset, east: false, zwj: name === "ZWJ", complex: false });
    else if (name === "SA") items.push({ name: "AL", code, start: offset, east: indexOfRun(east, code) % 2 === 1, zwj: false, complex: true });
    else items.push({ name, code, start: offset, east: indexOfRun(east, code) % 2 === 1, zwj: false, complex: false });
    offset += character.length;
  }
  return items;
}

const initial = /^\p{Pi}$/u;
const final = /^\p{Pf}$/u;
const pictographic = /^\p{Extended_Pictographic}$/u;
const unassigned = /^\p{Cn}$/u;
const of = (item: Item): string => String.fromCodePoint(item.code);
const isPi = (item: Item): boolean => initial.test(of(item));
const isPf = (item: Item): boolean => final.test(of(item));
const inClass = (item: Item | undefined, names: Set<string>): boolean => item !== undefined && names.has(item.name);
const isName = (item: Item | undefined, name: string): boolean => item?.name === name;

const beforeOpening = new Set(["BK", "CR", "LF", "NL", "OP", "QU", "GL", "SP", "ZW"]);
const afterClosing = new Set(["SP", "GL", "WJ", "CL", "QU", "CP", "EX", "IS", "SY", "BK", "CR", "LF", "NL", "ZW"]);
const beforeHyphen = new Set(["BK", "CR", "LF", "NL", "SP", "ZW", "CB", "GL"]);
const alphabetic = new Set(["AL", "HL"]);
const hyphens = new Set(["HY", "HH"]);
const emoji = new Set(["ID", "EB", "EM"]);
const prefix = new Set(["PR", "PO"]);
const closing = new Set(["CL", "CP"]);
const separators = new Set(["SY", "IS"]);
const hangul = new Set(["JL", "JV", "JT", "H2", "H3"]);
const aksara = (item: Item | undefined): boolean => item !== undefined && (item.name === "AK" || item.name === "AS" || item.code === 0x25cc);
const aksaraStart = (item: Item | undefined): boolean => item !== undefined && (item.name === "AK" || item.code === 0x25cc);

/** This function tells if the items before `index` end with `NU (SY | IS)*`. */
function afterNumber(items: readonly Item[], index: number): boolean {
  let i = index;
  while (i >= 0 && separators.has(items[i]!.name)) i--;
  return isName(items[i], "NU");
}

/** This function applies the rules LB4 to LB31 at the start of the item `i`. It gives 0 for no break, 1 for a break and 2 for a necessary break. */
function ruleAt(items: readonly Item[], i: number): 0 | 1 | 2 {
  const a = items[i - 1]!;
  const b = items[i]!;
  const c = a.name;
  const d = b.name;
  const earlier = items[i - 2];
  const later = items[i + 1];
  if (c === "BK" || c === "NL" || c === "LF") return 2;
  if (c === "CR") return d === "LF" ? 0 : 2;
  if (d === "BK" || d === "CR" || d === "LF" || d === "NL" || d === "SP" || d === "ZW") return 0;
  let last = i - 1;
  while (last >= 0 && items[last]!.name === "SP") last--;
  const beforeSpaces = items[last];
  if (isName(beforeSpaces, "ZW")) return 1;
  if (a.zwj) return 0;
  if (d === "WJ" || c === "WJ" || c === "GL") return 0;
  if (d === "GL" && c !== "SP" && c !== "BA" && !hyphens.has(c)) return 0;
  if (d === "CL" || d === "CP" || d === "EX" || d === "SY") return 0;
  if (isName(beforeSpaces, "OP")) return 0;
  if (beforeSpaces !== undefined && beforeSpaces.name === "QU" && isPi(beforeSpaces)) {
    const before = items[last - 1];
    if (before === undefined || beforeOpening.has(before.name)) return 0;
  }
  if (d === "QU" && isPf(b) && (later === undefined || afterClosing.has(later.name))) return 0;
  if (c === "SP" && d === "IS" && isName(later, "NU")) return 1;
  if (d === "IS") return 0;
  if (d === "NS" && inClass(beforeSpaces, closing)) return 0;
  if (d === "B2" && isName(beforeSpaces, "B2")) return 0;
  if (c === "SP") return 1;
  if (d === "QU" && !isPi(b)) return 0;
  if (c === "QU" && !isPf(a)) return 0;
  if (d === "QU" && (!a.east || later === undefined || !later.east)) return 0;
  if (c === "QU" && (!b.east || earlier === undefined || !earlier.east)) return 0;
  if (d === "CB" || c === "CB") return 1;
  if (hyphens.has(c) && alphabetic.has(d) && (earlier === undefined || beforeHyphen.has(earlier.name))) return 0;
  if (d === "BA" || d === "HH" || d === "HY" || d === "NS" || c === "BB") return 0;
  if (isName(earlier, "HL") && hyphens.has(c) && d !== "HL") return 0;
  if (c === "SY" && d === "HL") return 0;
  if (d === "IN") return 0;
  if (alphabetic.has(c) && d === "NU") return 0;
  if (c === "NU" && alphabetic.has(d)) return 0;
  if (c === "PR" && emoji.has(d)) return 0;
  if (emoji.has(c) && d === "PO") return 0;
  if (prefix.has(c) && alphabetic.has(d)) return 0;
  if (alphabetic.has(c) && prefix.has(d)) return 0;
  if (prefix.has(d) && afterNumber(items, closing.has(c) ? i - 2 : i - 1)) return 0;
  if (d === "NU" && afterNumber(items, i - 1)) return 0;
  if (prefix.has(c) && (d === "NU" || (d === "OP" && (isName(later, "NU") || (isName(later, "IS") && isName(items[i + 2], "NU")))))) return 0;
  if ((c === "HY" || c === "IS") && d === "NU") return 0;
  if (c === "JL" && (d === "JL" || d === "JV" || d === "H2" || d === "H3")) return 0;
  if ((c === "JV" || c === "H2") && (d === "JV" || d === "JT")) return 0;
  if ((c === "JT" || c === "H3") && d === "JT") return 0;
  if (hangul.has(c) && d === "PO") return 0;
  if (c === "PR" && hangul.has(d)) return 0;
  if (alphabetic.has(c) && alphabetic.has(d)) return 0;
  if (c === "AP" && aksara(b)) return 0;
  if (aksara(a) && (d === "VF" || d === "VI")) return 0;
  if (c === "VI" && aksara(earlier) && aksaraStart(b)) return 0;
  if (aksara(a) && aksara(b) && isName(later, "VF")) return 0;
  if (c === "IS" && alphabetic.has(d)) return 0;
  if ((alphabetic.has(c) || c === "NU") && d === "OP" && !b.east) return 0;
  if (c === "CP" && !a.east && (alphabetic.has(d) || d === "NU")) return 0;
  if (c === "RI" && d === "RI") {
    let count = 0;
    for (let k = i - 1; k >= 0 && items[k]!.name === "RI"; k--) count++;
    if (count % 2 === 1) return 0;
  }
  if (d === "EM" && (c === "EB" || (pictographic.test(of(a)) && unassigned.test(of(a))))) return 0;
  return 1;
}

/** The options of `lineBreaks`. */
export interface LineBreakOptions {
  /**
   * The hook gives the break places inside a run of class SA (Thai, Lao, Khmer, Myanmar and others). It gets the text of the
   * run and gives offsets in the run. `complexBreaks` is a hook. With no hook, the rule LB1 reads the run as AL, so no break
   * is inside it, as in `LineBreakTest`.
   */
  readonly complex?: (run: string) => readonly number[];
}

/**
 * This function gives the places where a line of a text can end, by the rules of UAX #14. With no option, it applies no
 * tailoring. The last place is the end of the text, and an empty text has no place.
 *
 * The hook `complex` adds places inside each run of class SA. The function keeps only the places at the start of an item,
 * so no place is before a combining mark. The places outside the runs do not change.
 */
export function lineBreaks(text: string, options: LineBreakOptions = {}): readonly LineBreak[] {
  const items = itemsOf(text);
  const inside = options.complex === undefined ? undefined : complexPlaces(text, items, options.complex);
  const breaks: LineBreak[] = [];
  for (let i = 1; i < items.length; i++) {
    const rule = ruleAt(items, i);
    if (rule !== 0) breaks.push({ offset: items[i]!.start, required: rule === 2 });
    else if (inside?.has(i)) breaks.push({ offset: items[i]!.start, required: false });
  }
  if (text.length > 0) breaks.push({ offset: text.length, required: true });
  return breaks;
}

/** This function gives the indexes of the items inside the runs of class SA where the hook gives a place. */
function complexPlaces(text: string, items: readonly Item[], complex: (run: string) => readonly number[]): Set<number> {
  const places = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.complex) continue;
    let last = i;
    while (last + 1 < items.length && items[last + 1]!.complex) last++;
    const start = items[i]!.start;
    const offsets = new Set(complex(text.slice(start, items[last + 1]?.start ?? text.length)));
    for (let k = i + 1; k <= last; k++) if (offsets.has(items[k]!.start - start)) places.add(k);
    i = last;
  }
  return places;
}
