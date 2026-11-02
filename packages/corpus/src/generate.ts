import { fontsFor, type FontId } from "./fonts.ts";
import { createRandom, hash32, type Random } from "./random.ts";
import { scriptIds, scripts, type CodePointRange, type ScriptId, type ScriptSpec } from "./scripts.ts";

/** A class of text lengths, in code points. */
export type LengthClass = "word" | "line" | "paragraph" | "page";

/** The range of code points of each length class, both ends included. */
export const lengthClasses: Readonly<Record<LengthClass, readonly [min: number, max: number]>> = {
  word: [1, 12],
  line: [20, 80],
  paragraph: [200, 800],
  page: [2000, 6000],
};

/** The identifiers of all length classes, from short to long. */
export const lengthClassIds: readonly LengthClass[] = ["word", "line", "paragraph", "page"];

/** The font sizes of the samples, in CSS pixels. */
export const fontSizes: readonly number[] = [10, 12, 14, 16, 24, 48];

/** One sample of the corpus. */
export interface Sample {
  /** The identifier: script, length class and index, for example `greek/line/3`. */
  readonly id: string;
  readonly script: ScriptId;
  readonly lengthClass: LengthClass;
  readonly font: FontId;
  /** The font size, in CSS pixels. */
  readonly size: number;
  /** The seed of the sample. The same seed always gives the same text. */
  readonly seed: number;
  readonly text: string;
}

/** The input of `generateCorpus`. */
export interface CorpusSpec {
  readonly seed: number;
  /** The count of samples of each pair of script and length class. */
  readonly perCell: number;
  /** The scripts. The default is all scripts. */
  readonly scripts?: readonly ScriptId[];
  /** The length classes. The default is all length classes. */
  readonly lengthClasses?: readonly LengthClass[];
}

function pickCodePoint(random: Random, ranges: readonly CodePointRange[]): number {
  let total = 0;
  for (const [first, last, weight] of ranges) total += (last - first + 1) * weight;
  let at = random.next() * total;
  for (const [first, last, weight] of ranges) {
    const span = (last - first + 1) * weight;
    if (at < span) return first + Math.floor(at / weight);
    at -= span;
  }
  const [, last] = ranges[ranges.length - 1]!;
  return last;
}

function generateWord(random: Random, spec: ScriptSpec, maxLetters: number): string[] {
  const letters = Math.min(maxLetters, random.int(spec.wordLength[0], spec.wordLength[1]));
  const out: string[] = [];
  for (let i = 0; i < letters; i++) {
    out.push(String.fromCodePoint(pickCodePoint(random, spec.letters)));
    if (spec.marks.length > 0 && random.chance(spec.markRate)) out.push(String.fromCodePoint(pickCodePoint(random, spec.marks)));
  }
  return out;
}

/**
 * This function generates a text of a script with exactly `codePoints` code points.
 * The text has words, separators, punctuation and sometimes digits. It does not start or end with a separator.
 */
export function generateText(random: Random, script: ScriptId, codePoints: number): string {
  if (!Number.isInteger(codePoints) || codePoints < 1) throw new RangeError(`the count of code points is ${codePoints}, not a positive integer`);
  const spec = scripts[script];
  const out: string[] = [];
  while (out.length < codePoints) {
    if (out.length > 0 && spec.separator !== "") out.push(spec.separator);
    const left = codePoints - out.length;
    if (left <= 0) break;
    const word = random.chance(0.03) ? Array.from(String(random.int(0, 9999))).slice(0, left) : generateWord(random, spec, left);
    out.push(...word);
    if (spec.punctuation.length > 0 && out.length < codePoints - 1 && random.chance(0.08)) out.push(random.pick(spec.punctuation));
  }
  // A separator at the end is not a part of the text: put a letter in its place.
  while (out.length > codePoints) out.pop();
  if (spec.separator !== "" && out[out.length - 1] === spec.separator) out[out.length - 1] = String.fromCodePoint(pickCodePoint(random, spec.letters));
  return out.join("");
}

/** This function gives the seed of the sample with an index in a cell of the corpus. */
export function sampleSeed(corpusSeed: number, script: ScriptId, lengthClass: LengthClass, index: number): number {
  return hash32(corpusSeed, script, lengthClass, index);
}

/** This function generates one sample. The sample depends only on its arguments, not on the other samples. */
export function generateSample(corpusSeed: number, script: ScriptId, lengthClass: LengthClass, index: number): Sample {
  const seed = sampleSeed(corpusSeed, script, lengthClass, index);
  const random = createRandom(seed);
  const [min, max] = lengthClasses[lengthClass];
  const font = random.pick(fontsFor(script)).id;
  const size = random.pick(fontSizes);
  const text = generateText(random, script, random.int(min, max));
  return { id: `${script}/${lengthClass}/${index}`, script, lengthClass, font, size, seed, text };
}

/**
 * This function generates a corpus: `perCell` samples for each pair of script and length class.
 * A corpus with fewer scripts or classes is a subset of the full corpus with the same seed.
 */
export function generateCorpus(spec: CorpusSpec): Sample[] {
  if (!Number.isInteger(spec.perCell) || spec.perCell < 1) throw new RangeError(`perCell is ${spec.perCell}, not a positive integer`);
  const samples: Sample[] = [];
  for (const script of spec.scripts ?? scriptIds) {
    for (const lengthClass of spec.lengthClasses ?? lengthClassIds) {
      for (let index = 0; index < spec.perCell; index++) samples.push(generateSample(spec.seed, script, lengthClass, index));
    }
  }
  return samples;
}

/**
 * This function gives a fingerprint of a list of samples: 16 hexadecimal digits.
 * Two corpora with the same fingerprint have the same identifiers, fonts, sizes and texts.
 */
export function fingerprint(samples: readonly Sample[]): string {
  let a = 0x811c9dc5;
  let b = 0x01234567;
  const add = (text: string): void => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995);
      b ^= b >>> 15;
    }
    a = Math.imul(a ^ 0x1f, 0x01000193);
    b = Math.imul(b ^ 0x1f, 0x5bd1e995);
  };
  for (const sample of samples) {
    add(sample.id);
    add(sample.font);
    add(String(sample.size));
    add(sample.text);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
