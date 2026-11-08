/**
 * The class and the paired bracket of a code point. These values come from a table that the tool in `packages/conformance`
 * makes from the property files of Unicode.
 */
import { bracketOf } from "./brackets.ts";
import { resolveLevels, type BidiClass, type ParagraphDirection, type ResolvedBidi } from "./resolve.ts";
import { classNames, classRuns } from "./table.ts";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+-./:;<=>?@[]^_{|}~";
let starts: Uint32Array | undefined;
let runClasses: Uint8Array | undefined;

/** This function decodes the runs one time, at the first use, so an import of the entry costs no work. */
function decodeRuns(): void {
  const runs = [...classRuns.matchAll(/([0-9a-z]+)([^0-9a-z])/gu)];
  starts = new Uint32Array(runs.length);
  runClasses = new Uint8Array(runs.length);
  let start = 0;
  runs.forEach((run, index) => {
    starts![index] = start;
    runClasses![index] = alphabet.indexOf(run[2]!);
    start += Number.parseInt(run[1]!, 36);
  });
}

/** This function gives the bidi class of a code point. */
export function bidiClass(codePoint: number): BidiClass {
  if (starts === undefined) decodeRuns();
  let low = 0;
  let high = starts!.length;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (starts![middle]! <= codePoint) low = middle;
    else high = middle;
  }
  return classNames[runClasses![low]!]! as BidiClass;
}

/** This function gives the levels of each code point of a text. It applies `resolveLevels` with the exact classes and brackets. */
export function resolveText(text: string, direction: ParagraphDirection = "auto"): ResolvedBidi {
  const codePoints = Array.from(text, (character) => character.codePointAt(0)!);
  return resolveLevels(codePoints.map(bidiClass), codePoints.map(bracketOf), direction);
}
