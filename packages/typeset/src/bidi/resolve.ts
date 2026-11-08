/**
 * The rules of the Unicode Bidirectional Algorithm (UAX #9). This module works on bidi classes and has no table, so `./fonts`
 * can use it with its own classes. The comments give the names of the rules. This module treats each paragraph as one line.
 */

/** A bidi class of UAX #9. */
export type BidiClass =
  | "L"
  | "R"
  | "AL"
  | "EN"
  | "ES"
  | "ET"
  | "AN"
  | "CS"
  | "NSM"
  | "BN"
  | "B"
  | "S"
  | "WS"
  | "ON"
  | "LRE"
  | "LRO"
  | "RLE"
  | "RLO"
  | "PDF"
  | "LRI"
  | "RLI"
  | "FSI"
  | "PDI";

/** The paragraph direction: `0` is left to right, `1` is right to left, and `"auto"` applies the rules P2 and P3. */
export type ParagraphDirection = 0 | 1 | "auto";

/** One paragraph of a resolved text. */
export interface BidiParagraph {
  /** The index of the first character. */
  readonly start: number;
  /** The index after the last character. */
  readonly end: number;
  /** The paragraph embedding level. */
  readonly level: number;
}

/** The result of `resolveLevels`. */
export interface ResolvedBidi {
  /** The level of each character. The value is `removed` for a character that the rule X9 removes. */
  readonly levels: number[];
  readonly paragraphs: readonly BidiParagraph[];
}

/** This value is the level of a character that the rule X9 removes. */
export const removed = -1;

const L = 1 << 0;
const R = 1 << 1;
const AL = 1 << 2;
const EN = 1 << 3;
const ES = 1 << 4;
const ET = 1 << 5;
const AN = 1 << 6;
const CS = 1 << 7;
const NSM = 1 << 8;
const BN = 1 << 9;
const B = 1 << 10;
const S = 1 << 11;
const WS = 1 << 12;
const ON = 1 << 13;
const LRE = 1 << 14;
const LRO = 1 << 15;
const RLE = 1 << 16;
const RLO = 1 << 17;
const PDF = 1 << 18;
const LRI = 1 << 19;
const RLI = 1 << 20;
const FSI = 1 << 21;
const PDI = 1 << 22;

const bits: Readonly<Record<BidiClass, number>> = { L, R, AL, EN, ES, ET, AN, CS, NSM, BN, B, S, WS, ON, LRE, LRO, RLE, RLO, PDF, LRI, RLI, FSI, PDI };
const isolates = LRI | RLI | FSI;
const neutrals = B | S | WS | ON | isolates | PDI;
const maxDepth = 125;
const maxBrackets = 63;

/** One entry of the directional status stack of the rule X1. */
interface Status {
  readonly level: number;
  readonly override: number;
  readonly isolate: boolean;
}

/** This function gives the direction of a type for the rules N0 to N2: numbers count as `R`, and a neutral gives 0. */
function strong(type: number): number {
  if (type === L) return L;
  return type & (R | EN | AN) ? R : 0;
}

/** This function applies the rule BD9. It gives each isolate initiator the index of its PDI, or `end` when it has no PDI. */
function matchIsolates(original: Int32Array, start: number, end: number, match: Int32Array): void {
  const open: number[] = [];
  for (let i = start; i < end; i++) {
    if (original[i]! & isolates) {
      open.push(i);
      match[i] = end;
    } else if (original[i] === PDI && open.length > 0) {
      match[open.pop()!] = i;
    }
  }
}

/** This function applies the rules P2 and P3 to a range. It gives the level of the first strong character, or else 0. */
function firstStrong(original: Int32Array, start: number, end: number, match: Int32Array): number {
  for (let i = start; i < end; i++) {
    const type = original[i]!;
    if (type === L) return 0;
    if (type & (R | AL)) return 1;
    if (type & isolates) i = match[i]!;
  }
  return 0;
}

/** This function applies the rules X1 to X9. It sets `levels` and it changes `types` where an override applies. */
function resolveExplicit(original: Int32Array, types: Int32Array, match: Int32Array, levels: number[], start: number, end: number, paragraph: number): void {
  const stack: Status[] = [{ level: paragraph, override: 0, isolate: false }];
  let overflowIsolates = 0;
  let overflowEmbeddings = 0;
  let validIsolates = 0;
  for (let i = start; i < end; i++) {
    const type = original[i]!;
    let top = stack.at(-1)!;
    if (type & (RLE | LRE | RLO | LRO | isolates)) {
      const isolate = (type & isolates) !== 0;
      levels[i] = isolate ? top.level : removed;
      if (isolate && top.override) types[i] = top.override;
      const right = type & (RLE | RLO | RLI) || (type === FSI && firstStrong(original, i + 1, match[i]!, match) === 1);
      const level = right ? (top.level + 1) | 1 : (top.level + 2) & ~1;
      if (level <= maxDepth && overflowIsolates === 0 && overflowEmbeddings === 0) {
        if (isolate) validIsolates++;
        stack.push({ level, override: type === RLO ? R : type === LRO ? L : 0, isolate });
      } else if (isolate) {
        overflowIsolates++;
      } else if (overflowIsolates === 0) {
        overflowEmbeddings++;
      }
    } else if (type === PDI) {
      if (overflowIsolates > 0) {
        overflowIsolates--;
      } else if (validIsolates > 0) {
        overflowEmbeddings = 0;
        while (!stack.at(-1)!.isolate) stack.pop();
        stack.pop();
        validIsolates--;
      }
      top = stack.at(-1)!;
      levels[i] = top.level;
      if (top.override) types[i] = top.override;
    } else if (type === PDF) {
      levels[i] = removed;
      if (overflowIsolates === 0) {
        if (overflowEmbeddings > 0) overflowEmbeddings--;
        else if (!top.isolate && stack.length > 1) stack.pop();
      }
    } else if (type === BN) {
      levels[i] = removed;
    } else if (type === B) {
      levels[i] = paragraph;
    } else {
      levels[i] = top.level;
      if (top.override) types[i] = top.override;
    }
  }
}

/** This function applies the rule BD13. It gives the indexes of each isolating run sequence. */
function sequencesOf(original: Int32Array, match: Int32Array, levels: readonly number[], start: number, end: number): number[][] {
  const sequences: number[][] = [];
  const continued = new Map<number, number[]>();
  let sequence: number[] = [];
  let level = removed;
  for (let i = start; i < end; i++) {
    if (levels[i] === removed) continue;
    if (levels[i] !== level) {
      level = levels[i]!;
      const next = continued.get(i);
      if (next === undefined) sequences.push((sequence = []));
      else sequence = next;
    }
    sequence.push(i);
    if (original[i]! & isolates) continued.set(match[i]!, sequence);
  }
  return sequences;
}

/** This function applies the rules W1 to W7 to the types of one sequence. */
function resolveWeak(sequenceTypes: number[], sos: number): void {
  const n = sequenceTypes.length;
  let previous = sos;
  for (let k = 0; k < n; k++) {
    if (sequenceTypes[k] === NSM) sequenceTypes[k] = previous & (isolates | PDI) ? ON : previous;
    previous = sequenceTypes[k]!;
  }
  let last = sos;
  for (let k = 0; k < n; k++) {
    const type = sequenceTypes[k]!;
    if (type & (L | R | AL)) last = type;
    else if (type === EN && last === AL) sequenceTypes[k] = EN;
    if (type === AL) sequenceTypes[k] = R;
  }
  for (let k = 1; k + 1 < n; k++) {
    const type = sequenceTypes[k]!;
    const before = sequenceTypes[k - 1]!;
    if (type & (ES | CS) && before === sequenceTypes[k + 1] && (before === EN || (before === AN && type === CS))) sequenceTypes[k] = before;
  }
  for (let k = 0; k < n; k++) {
    if (sequenceTypes[k] !== ET) continue;
    let end = k;
    while (end < n && sequenceTypes[end] === ET) end++;
    if (sequenceTypes[k - 1] === EN || sequenceTypes[end] === EN) sequenceTypes.fill(EN, k, end);
    k = end - 1;
  }
  last = sos;
  for (let k = 0; k < n; k++) {
    const type = sequenceTypes[k]!;
    if (type & (ES | ET | CS)) sequenceTypes[k] = ON;
    else if (type & (L | R)) last = type;
    else if (type === EN && last === L) sequenceTypes[k] = L;
  }
}

/** This function applies the rules BD16 and N0 to one sequence. A value of `brackets` is above 0 at an opening bracket and below 0 at its closing bracket. */
function resolveBrackets(sequenceTypes: number[], sequence: readonly number[], original: Int32Array, brackets: readonly number[], direction: number, sos: number): void {
  const pairs: [number, number][] = [];
  const stack: number[] = [];
  const n = sequence.length;
  for (let k = 0; k < n; k++) {
    const bracket = brackets[sequence[k]!];
    if (!bracket || sequenceTypes[k] !== ON) continue;
    if (bracket > 0) {
      if (stack.length === maxBrackets) {
        pairs.length = 0;
        break;
      }
      stack.push(k);
    } else {
      for (let depth = stack.length - 1; depth >= 0; depth--) {
        if (brackets[sequence[stack[depth]!]!] !== -bracket) continue;
        pairs.push([stack[depth]!, k]);
        stack.length = depth;
        break;
      }
    }
  }
  pairs.sort((first, second) => first[0] - second[0]);
  for (const [open, close] of pairs) {
    let found = 0;
    for (let k = open + 1; k < close && found !== direction; k++) found = strong(sequenceTypes[k]!) || found;
    if (found === 0) continue;
    if (found !== direction) {
      let context = sos;
      for (let k = open - 1; k >= 0; k--) {
        if (strong(sequenceTypes[k]!) === 0) continue;
        context = strong(sequenceTypes[k]!);
        break;
      }
      if (context !== found) found = direction;
    }
    for (const bracket of [open, close]) {
      sequenceTypes[bracket] = found;
      for (let k = bracket + 1; k < n && original[sequence[k]!] === NSM; k++) sequenceTypes[k] = found;
    }
  }
}

/** This function applies the rules N1 and N2 to the types of one sequence. */
function resolveNeutrals(sequenceTypes: number[], direction: number, sos: number, eos: number): void {
  const n = sequenceTypes.length;
  for (let k = 0; k < n; k++) {
    if (!(sequenceTypes[k]! & neutrals)) continue;
    let end = k;
    while (end < n && sequenceTypes[end]! & neutrals) end++;
    const before = k === 0 ? sos : strong(sequenceTypes[k - 1]!);
    const after = end === n ? eos : strong(sequenceTypes[end]!);
    sequenceTypes.fill(before === after ? before : direction, k, end);
    k = end - 1;
  }
}

/** This function applies the rule X10 and the rules W1 to N2 to one sequence. The level of the rules X1 to X9 gives the values of `sos` and `eos`. */
function resolveSequence(sequence: readonly number[], original: Int32Array, types: Int32Array, brackets: readonly number[], levels: readonly number[], start: number, end: number, paragraph: number): void {
  const first = sequence[0]!;
  const last = sequence.at(-1)!;
  const level = levels[first]!;
  let before = first - 1;
  while (before >= start && levels[before] === removed) before--;
  let after = last + 1;
  while (after < end && levels[after] === removed) after++;
  const sos = Math.max(level, before < start ? paragraph : levels[before]!) & 1 ? R : L;
  const eos = Math.max(level, after === end || original[last]! & isolates ? paragraph : levels[after]!) & 1 ? R : L;
  const sequenceTypes = sequence.map((i) => types[i]!);
  const direction = level & 1 ? R : L;
  resolveWeak(sequenceTypes, sos);
  resolveBrackets(sequenceTypes, sequence, original, brackets, direction, sos);
  resolveNeutrals(sequenceTypes, direction, sos, eos);
  sequence.forEach((i, k) => {
    types[i] = sequenceTypes[k]!;
  });
}

/** This function applies the rules I1, I2 and L1 to one paragraph. */
function resolveImplicit(original: Int32Array, types: Int32Array, levels: number[], start: number, end: number, paragraph: number): void {
  let atEnd = true;
  for (let i = end - 1; i >= start; i--) {
    if (levels[i] === removed) continue;
    const type = types[i]!;
    const kind = original[i]!;
    levels[i]! += levels[i]! & 1 ? (type === R ? 0 : 1) : type === L ? 0 : type === R ? 1 : 2;
    if (kind & (S | B)) atEnd = true;
    else if (!(kind & (WS | isolates | PDI))) atEnd = false;
    if (atEnd) levels[i] = paragraph;
  }
}

/**
 * This function gives the levels of a text from its classes, with the rules P1 to L1 of UAX #9. A class `B` ends a paragraph.
 * A value of `brackets` is 0 for a character that is not a paired bracket. It is above 0 at an opening bracket and below 0
 * at the closing bracket with the same absolute value. `bracketOf` of `./bidi` gives these values.
 */
export function resolveLevels(classes: readonly BidiClass[], brackets: readonly number[] = [], direction: ParagraphDirection = "auto"): ResolvedBidi {
  const n = classes.length;
  const original = new Int32Array(n);
  for (let i = 0; i < n; i++) original[i] = bits[classes[i]!];
  const types = original.slice();
  const match = new Int32Array(n);
  const levels = new Array<number>(n).fill(0);
  const paragraphs: BidiParagraph[] = [];
  for (let start = 0; start < n; ) {
    let end = start;
    while (end < n && original[end] !== B) end++;
    end = Math.min(end + 1, n);
    matchIsolates(original, start, end, match);
    const level = direction === "auto" ? firstStrong(original, start, end, match) : direction;
    resolveExplicit(original, types, match, levels, start, end, level);
    for (const sequence of sequencesOf(original, match, levels, start, end)) resolveSequence(sequence, original, types, brackets, levels, start, end, level);
    resolveImplicit(original, types, levels, start, end, level);
    paragraphs.push({ start, end, level });
    start = end;
  }
  return { levels, paragraphs };
}

/**
 * This function puts items in the visual order of the rule L2 of UAX #9. Each item has the level `levels[i]`. From the
 * highest level to the level 1, it reverses each sequence of items at that level or higher.
 */
export function visualOrder<T>(items: readonly T[], levels: readonly number[]): T[] {
  const order = items.map((_, i) => i);
  const n = order.length;
  for (let level = levels.reduce((highest, value) => Math.max(highest, value), 0); level >= 1; level--) {
    for (let i = 0; i < n; i++) {
      if (levels[order[i]!]! < level) continue;
      let end = i;
      while (end < n && levels[order[end]!]! >= level) end++;
      for (let low = i, high = end - 1; low < high; low++, high--) [order[low], order[high]] = [order[high]!, order[low]!];
      i = end;
    }
  }
  return order.map((i) => items[i]!);
}

/** This function gives the indexes of the characters in the visual order, for each paragraph as one line. It omits each removed character. */
export function visualIndexes({ levels, paragraphs }: ResolvedBidi): number[] {
  return paragraphs.flatMap(({ start, end }) => {
    const kept: number[] = [];
    for (let i = start; i < end; i++) if (levels[i] !== removed) kept.push(i);
    return visualOrder(
      kept,
      kept.map((i) => levels[i]!),
    );
  });
}
