/**
 * The font stacks of the comparison (T11). A stack is a list of corpus fonts, in the order of a CSS `font-family` list. The
 * texts mix the scripts of a stack, so that a text needs more than one font of the list.
 */
import { generateSample, type FontId, type ScriptId } from "@typeset/corpus";
import type { Font } from "@mark1russell7/typeset/fonts";

/** One family list and the scripts of its texts. */
export interface FontStack {
  readonly id: string;
  readonly fonts: readonly FontId[];
  readonly scripts: readonly ScriptId[];
}

/** The stacks. `han-first` puts a font with Latin glyphs of its own first, so the order of the list changes the widths. */
export const fontStacks: readonly FontStack[] = [
  { id: "latin-han", fonts: ["noto-sans", "noto-sans-sc"], scripts: ["latin", "han"] },
  { id: "han-first", fonts: ["noto-sans-jp", "noto-sans"], scripts: ["latin", "kana", "han"] },
  { id: "latin-arabic-emoji", fonts: ["noto-sans", "noto-sans-arabic", "noto-emoji"], scripts: ["latin", "arabic", "emoji"] },
  { id: "latin-indic-thai", fonts: ["noto-sans", "noto-sans-devanagari", "noto-sans-thai"], scripts: ["latin", "devanagari", "thai"] },
  {
    id: "all-scripts",
    fonts: ["noto-sans", "noto-sans-hebrew", "noto-sans-arabic", "noto-sans-devanagari", "noto-sans-thai", "noto-sans-jp", "noto-sans-kr", "noto-emoji"],
    scripts: ["latin", "cyrillic", "hebrew", "arabic", "devanagari", "thai", "han", "kana", "hangul", "emoji"],
  },
];

/** A text of a stack. A `mixed` text joins words of each script. A `mark` text has a mark that the first font does not have. */
export interface StackText {
  readonly id: string;
  readonly kind: "mixed" | "mark";
  readonly text: string;
}

/** The count of `mixed` texts of each stack. */
const mixedCount = 24;

/** The count of rounds over the scripts of a stack in one `mixed` text. */
const rounds = 3;

/** The largest count of `mark` texts of each stack. */
const markCount = 6;

/** The Latin letter of the `mark` texts. */
const markBase = "a";

/** The largest count of corpus words that `mixedTexts` draws for one word of a text. */
const wordTries = 400;

/**
 * This function gives the `mixed` texts of a stack. Each text has words of each script, in the order of the stack.
 * Each word comes from the corpus, and a word with a code point that no font of `fonts` has is skipped. So the canvas
 * uses no font of the system, and each text has a width to compare.
 */
export function mixedTexts(stack: FontStack, seed: number, fonts: readonly Font[]): StackText[] {
  const next = new Map<ScriptId, number>();
  const word = (script: ScriptId): string => {
    for (let tries = 0; tries < wordTries; tries++) {
      const index = next.get(script) ?? 0;
      next.set(script, index + 1);
      const text = generateSample(seed, script, "word", index).text;
      if (missingInStack(fonts, text) === 0) return text;
    }
    throw new Error(`${stack.id}: no word of ${script} in ${wordTries} words has all its code points in the fonts of the stack`);
  };
  return Array.from({ length: mixedCount }, (_, index) => {
    const words: string[] = [];
    for (let round = 0; round < rounds; round++) for (const script of stack.scripts) words.push(word(script));
    return { id: `${stack.id}:mixed:${index}`, kind: "mixed", text: words.join(" ") };
  });
}

/**
 * This function gives the `mark` texts of a stack. Each text has a base and a mark. The first font has the base and not
 * the mark, and a later font has both. Blink gives such a cluster to the later font. The marks come in the order of their
 * code points, evenly over the marks that fit. So the result does not change between runs.
 */
export function markTexts(stack: FontStack, fonts: readonly Font[]): StackText[] {
  const first = fonts[0]!;
  const fitting: number[] = [];
  for (let code = 0x300; code < 0x2000; code++) {
    if (!/^\p{M}$/u.test(String.fromCodePoint(code)) || first.glyph(code) !== 0) continue;
    if (fonts.slice(1).some((font) => font.glyph(code) !== 0 && font.glyph(markBase.codePointAt(0)!) !== 0)) fitting.push(code);
  }
  const count = Math.min(markCount, fitting.length);
  return Array.from({ length: count }, (_, index) => {
    const code = fitting[Math.floor((index * fitting.length) / count)]!;
    return { id: `${stack.id}:mark:${code.toString(16)}`, kind: "mark", text: `${markBase}${String.fromCodePoint(code)} ${markBase}` };
  });
}

/** This function gives the CSS font of a stack at a size. The canvas and the model get the same string. */
export function stackFont(stack: FontStack, size: number): string {
  return `400 ${size}px ${stack.fonts.map((id) => `"typeset-${id}"`).join(", ")}`;
}

/** This function gives the count of code points of a text that no font of a list has. */
export function missingInStack(fonts: readonly Font[], text: string): number {
  let missing = 0;
  for (const character of text) if (fonts.every((font) => font.glyph(character.codePointAt(0)!) === 0)) missing++;
  return missing;
}

/** One text of a stack at one size, on one arm. */
export interface StackRecord {
  readonly stack: string;
  readonly sample: string;
  readonly kind: StackText["kind"];
  readonly size: number;
  readonly codePoints: number;
  /** The count of code points that no font of the list has. The canvas then uses a font of the system. */
  readonly missing: number;
  readonly canvas: number;
  readonly model: number;
  /** The model width minus the canvas width, in px. */
  readonly error: number;
}

/**
 * This function gives the records of a stack. `canvas[s][i]` is the width of the text `i` at the size `s`, and `advance`
 * is the model. A text with a code point that no font has still has records, and its field `missing` tells it.
 */
export function stackRecords(stack: FontStack, fonts: readonly Font[], texts: readonly StackText[], sizes: readonly number[], canvas: readonly (readonly number[])[], advance: (text: string, font: string) => number): StackRecord[] {
  return sizes.flatMap((size, s) =>
    texts.map((text, i) => {
      const model = advance(text.text, stackFont(stack, size));
      const width = canvas[s]![i]!;
      return { stack: stack.id, sample: text.id, kind: text.kind, size, codePoints: [...text.text].length, missing: missingInStack(fonts, text.text), canvas: width, model, error: model - width };
    }),
  );
}

/** The errors of one stack at one size. The field `excluded` counts the records with a code point that no font has. */
export interface StackCell {
  readonly stack: string;
  readonly size: number;
  readonly n: number;
  readonly excluded: number;
  /** The worst absolute error, in 1/64 px. */
  readonly worst64: number;
  readonly worstSample?: string;
}

/** This function gives one cell for each stack and each size, in the order of the records. */
export function stackCells(records: readonly StackRecord[]): StackCell[] {
  const cells = new Map<string, { stack: string; size: number; n: number; excluded: number; worst64: number; worstSample?: string }>();
  for (const record of records) {
    const key = `${record.stack}|${record.size}`;
    const cell = cells.get(key) ?? { stack: record.stack, size: record.size, n: 0, excluded: 0, worst64: 0 };
    cells.set(key, cell);
    if (record.missing > 0) {
      cell.excluded++;
      continue;
    }
    cell.n++;
    const error = Math.abs(record.error) * 64;
    if (cell.worstSample === undefined || error > cell.worst64) {
      cell.worst64 = error;
      cell.worstSample = record.sample;
    }
  }
  return [...cells.values()];
}
