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
  { id: "han-first", fonts: ["noto-sans-jp", "noto-sans", "noto-sans-sc"], scripts: ["latin", "kana", "han"] },
  { id: "latin-arabic-emoji", fonts: ["noto-sans", "noto-sans-arabic", "noto-emoji"], scripts: ["latin", "arabic", "emoji"] },
  { id: "latin-indic-thai", fonts: ["noto-sans", "noto-sans-devanagari", "noto-sans-thai"], scripts: ["latin", "devanagari", "thai"] },
  {
    id: "all-scripts",
    fonts: ["noto-sans", "noto-sans-hebrew", "noto-sans-arabic", "noto-sans-devanagari", "noto-sans-thai", "noto-sans-jp", "noto-sans-sc", "noto-sans-kr", "noto-emoji"],
    scripts: ["latin", "cyrillic", "hebrew", "arabic", "devanagari", "thai", "han", "kana", "hangul", "emoji"],
  },
];

/**
 * A text of a stack. A `mixed` text joins words of each script that the fonts of the stack cover. A `drawn` text joins
 * the words as the corpus draws them. A `mark` text has a mark that the first font does not have.
 */
export interface StackText {
  readonly id: string;
  readonly kind: "mixed" | "drawn" | "mark";
  readonly text: string;
}

/** The two cells of a stack at a size. The `covered` texts have a glyph for each code point, and the `uncovered` texts come as drawn. */
export type StackSet = "covered" | "uncovered";

/** This function gives the cell set of a text kind. */
export function setOf(kind: StackText["kind"]): StackSet {
  return kind === "drawn" ? "uncovered" : "covered";
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
  return joinedTexts(stack, seed, "mixed", (text) => missingInStack(fonts, text) === 0);
}

/**
 * This function gives the `drawn` texts of a stack: the words of the `mixed` texts, as the corpus draws them, with no word
 * skipped. A text with a code point that no font of the stack has is a real case, so its cell keeps it.
 */
export function drawnTexts(stack: FontStack, seed: number): StackText[] {
  return joinedTexts(stack, seed, "drawn", () => true);
}

/** This function joins words of each script of a stack into texts. Each word comes from the corpus, and `accept` skips a word. */
function joinedTexts(stack: FontStack, seed: number, kind: "mixed" | "drawn", accept: (word: string) => boolean): StackText[] {
  const next = new Map<ScriptId, number>();
  const word = (script: ScriptId): string => {
    for (let tries = 0; tries < wordTries; tries++) {
      const index = next.get(script) ?? 0;
      next.set(script, index + 1);
      const text = generateSample(seed, script, "word", index).text;
      if (accept(text)) return text;
    }
    throw new Error(`${stack.id}: no word of ${script} in ${wordTries} words has all its code points in the fonts of the stack`);
  };
  return Array.from({ length: mixedCount }, (_, index) => {
    const words: string[] = [];
    for (let round = 0; round < rounds; round++) for (const script of stack.scripts) words.push(word(script));
    return { id: `${stack.id}:${kind}:${index}`, kind, text: words.join(" ") };
  });
}

/** The segmenter of the grapheme clusters, as Blink and the model divide a text. */
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });

/**
 * A missing run of a text: a longest run of grapheme clusters with a code point that no font of the list has. The field
 * `before` is the cluster before the run, or "" at the start of the text.
 */
export interface MissingRun {
  readonly before: string;
  readonly run: string;
}

/**
 * This function gives the missing runs of a text. Blink draws such a run with a font of the system, and the CSS list does not
 * name that font. The model gives the run the font of the cluster before it.
 */
export function missingRuns(fonts: readonly Font[], text: string): MissingRun[] {
  const runs: MissingRun[] = [];
  let before = "";
  let run = "";
  let last = "";
  for (const { segment } of graphemes.segment(text)) {
    if (missingInStack(fonts, segment) > 0) {
      if (run === "") before = last;
      run += segment;
    } else if (run !== "") {
      runs.push({ before, run });
      run = "";
    }
    last = segment;
  }
  if (run !== "") runs.push({ before, run });
  return runs;
}

/** This function gives the texts that the canvas measures for the missing runs of texts: each run after its cluster, and each cluster. */
export function runTexts(runs: readonly MissingRun[]): string[] {
  return [...new Set(runs.flatMap(({ before, run }) => (before === "" ? [run] : [before + run, before])))];
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
  /** The count of words of the text, between spaces, and the count of them with a code point that no font has. */
  readonly words: number;
  readonly missingWords: number;
  readonly canvas: number;
  readonly model: number;
  /** The model width minus the canvas width, in px. */
  readonly error: number;
  /**
   * The sum of the errors of the missing runs of the text, in px. Each run is measured after its cluster, less the cluster
   * alone, so each side gives the run the font that it gives in the text. It is 0 for a text with no missing run.
   */
  readonly runError: number;
  /** The error of the text minus the errors of its missing runs, in px. This is the error over the code points that the fonts have. */
  readonly residual: number;
}

/**
 * This function gives the records of a stack. `canvas[s][i]` is the width of the text `i` at the size `s`, and `advance`
 * is the model. `runCanvas[s]` has the canvas width of each text of `runTexts` at the size `s`. A text with a missing run needs it.
 */
export function stackRecords(
  stack: FontStack,
  fonts: readonly Font[],
  texts: readonly StackText[],
  sizes: readonly number[],
  canvas: readonly (readonly number[])[],
  advance: (text: string, font: string) => number,
  runCanvas: readonly ReadonlyMap<string, number>[] = [],
): StackRecord[] {
  return sizes.flatMap((size, s) =>
    texts.map((text, i) => {
      const font = stackFont(stack, size);
      const model = advance(text.text, font);
      const width = canvas[s]![i]!;
      let runError = 0;
      const canvasOf = (value: string): number => {
        if (value === "") return 0;
        const found = runCanvas[s]?.get(value);
        if (found === undefined) throw new Error(`${text.id}: no canvas width of the missing run ${JSON.stringify(value)} at ${size} px`);
        return found;
      };
      const modelOf = (value: string): number => (value === "" ? 0 : advance(value, font));
      for (const { before, run } of missingRuns(fonts, text.text)) {
        runError += modelOf(before + run) - modelOf(before) - (canvasOf(before + run) - canvasOf(before));
      }
      const words = text.text.split(" ").filter((word) => word !== "");
      return {
        stack: stack.id,
        sample: text.id,
        kind: text.kind,
        size,
        codePoints: [...text.text].length,
        missing: missingInStack(fonts, text.text),
        words: words.length,
        missingWords: words.filter((word) => missingInStack(fonts, word) > 0).length,
        canvas: width,
        model,
        error: model - width,
        runError,
        residual: model - width - runError,
      };
    }),
  );
}

/**
 * The errors of one stack at one size, for one set of texts. A `covered` cell counts a text with a missing code point in
 * `excluded`. An `uncovered` cell keeps each text, and its worst error is the worst `residual`.
 */
export interface StackCell {
  readonly stack: string;
  readonly set: StackSet;
  readonly size: number;
  readonly n: number;
  readonly excluded: number;
  /** The worst absolute error, in 1/64 px. */
  readonly worst64: number;
  readonly worstSample?: string;
  /** The count of texts with a code point that no font has. Only an `uncovered` cell has it. */
  readonly missingTexts?: number;
  /** The count of words of the texts, and of the words with a code point that no font has. Only an `uncovered` cell has them. */
  readonly words?: number;
  readonly missingWords?: number;
}

/** This function gives one cell for each stack, set and size, in the order of the records. */
export function stackCells(records: readonly StackRecord[]): StackCell[] {
  type Mutable = { -readonly [K in keyof StackCell]: StackCell[K] };
  const cells = new Map<string, Mutable>();
  for (const record of records) {
    const set = setOf(record.kind);
    const key = `${record.stack}|${set}|${record.size}`;
    const cell = cells.get(key) ?? (set === "covered" ? { stack: record.stack, set, size: record.size, n: 0, excluded: 0, worst64: 0 } : { stack: record.stack, set, size: record.size, n: 0, excluded: 0, worst64: 0, missingTexts: 0, words: 0, missingWords: 0 });
    cells.set(key, cell);
    if (set === "covered" && record.missing > 0) {
      cell.excluded++;
      continue;
    }
    if (set === "uncovered") {
      cell.missingTexts! += record.missing > 0 ? 1 : 0;
      cell.words! += record.words;
      cell.missingWords! += record.missingWords;
    }
    cell.n++;
    const error = Math.abs(set === "covered" ? record.error : record.residual) * 64;
    if (cell.worstSample === undefined || error > cell.worst64) {
      cell.worst64 = error;
      cell.worstSample = record.sample;
    }
  }
  return [...cells.values()];
}
