/** A range of code points, both ends included, and its weight against the other ranges of the list. */
export type CodePointRange = readonly [first: number, last: number, weight: number];

/** The identifier of a script of the corpus. */
export type ScriptId =
  | "latin"
  | "latin-extended"
  | "greek"
  | "cyrillic"
  | "arabic"
  | "hebrew"
  | "devanagari"
  | "thai"
  | "han"
  | "kana"
  | "hangul"
  | "emoji";

/** The description of a script: its letters, its marks and the structure of its words. */
export interface ScriptSpec {
  readonly id: ScriptId;
  /** The code points of the letters. */
  readonly letters: readonly CodePointRange[];
  /** The combining marks. The generator puts a mark after a letter with the probability `markRate`. */
  readonly marks: readonly CodePointRange[];
  readonly markRate: number;
  /** The text between two words. An empty string means that the script has no word separator. */
  readonly separator: string;
  /** The minimum and the maximum count of letters in a word. */
  readonly wordLength: readonly [min: number, max: number];
  /** The direction of the text. */
  readonly direction: "ltr" | "rtl";
  /** This value is `true` when a correct width needs a shaper: joining forms, reordering or clusters. */
  readonly needsShaping: boolean;
  /** The punctuation that the generator puts after a word. */
  readonly punctuation: readonly string[];
}

const latinPunctuation: readonly string[] = [",", ".", ";", ":", "!", "?"];

/** The scripts of the corpus. */
export const scripts: Readonly<Record<ScriptId, ScriptSpec>> = {
  latin: {
    id: "latin",
    letters: [
      [0x61, 0x7a, 20],
      [0x41, 0x5a, 1],
    ],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [1, 12],
    direction: "ltr",
    needsShaping: false,
    punctuation: latinPunctuation,
  },
  "latin-extended": {
    id: "latin-extended",
    letters: [
      [0x61, 0x7a, 12],
      [0xc0, 0xd6, 1],
      [0xd8, 0xf6, 2],
      [0xf8, 0xff, 1],
      [0x100, 0x17f, 3],
    ],
    marks: [[0x300, 0x36f, 1]],
    markRate: 0.03,
    separator: " ",
    wordLength: [1, 14],
    direction: "ltr",
    needsShaping: false,
    punctuation: latinPunctuation,
  },
  greek: {
    id: "greek",
    letters: [
      [0x3b1, 0x3c9, 20],
      [0x391, 0x3a1, 1],
      [0x3a3, 0x3a9, 1],
    ],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [1, 12],
    direction: "ltr",
    needsShaping: false,
    punctuation: [",", ".", "·", ";"],
  },
  cyrillic: {
    id: "cyrillic",
    letters: [
      [0x430, 0x44f, 20],
      [0x410, 0x42f, 1],
    ],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [1, 13],
    direction: "ltr",
    needsShaping: false,
    punctuation: latinPunctuation,
  },
  arabic: {
    id: "arabic",
    letters: [[0x621, 0x64a, 1]],
    marks: [[0x64b, 0x652, 1]],
    markRate: 0.05,
    separator: " ",
    wordLength: [2, 9],
    direction: "rtl",
    needsShaping: true,
    punctuation: ["،", ".", "؟"],
  },
  hebrew: {
    id: "hebrew",
    letters: [[0x5d0, 0x5ea, 1]],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [2, 8],
    direction: "rtl",
    needsShaping: false,
    punctuation: [",", "."],
  },
  devanagari: {
    id: "devanagari",
    letters: [
      [0x915, 0x939, 6],
      [0x905, 0x914, 1],
    ],
    marks: [
      [0x93e, 0x94c, 4],
      [0x94d, 0x94d, 1],
      [0x902, 0x902, 1],
    ],
    markRate: 0.45,
    separator: " ",
    wordLength: [1, 7],
    direction: "ltr",
    needsShaping: true,
    punctuation: ["।", ","],
  },
  thai: {
    id: "thai",
    letters: [[0xe01, 0xe2e, 1]],
    marks: [
      [0xe31, 0xe31, 1],
      [0xe34, 0xe3a, 3],
      [0xe47, 0xe4e, 2],
    ],
    markRate: 0.3,
    separator: "",
    wordLength: [2, 8],
    direction: "ltr",
    needsShaping: true,
    punctuation: [" "],
  },
  han: {
    id: "han",
    letters: [[0x4e00, 0x9fff, 1]],
    marks: [],
    markRate: 0,
    separator: "",
    wordLength: [1, 3],
    direction: "ltr",
    needsShaping: false,
    punctuation: ["，", "。", "、"],
  },
  kana: {
    id: "kana",
    letters: [
      [0x3041, 0x3096, 3],
      [0x30a1, 0x30fa, 2],
    ],
    marks: [],
    markRate: 0,
    separator: "",
    wordLength: [1, 6],
    direction: "ltr",
    needsShaping: false,
    punctuation: ["、", "。"],
  },
  hangul: {
    id: "hangul",
    letters: [[0xac00, 0xd7a3, 1]],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [1, 5],
    direction: "ltr",
    needsShaping: false,
    punctuation: [",", "."],
  },
  emoji: {
    id: "emoji",
    letters: [
      [0x1f600, 0x1f64f, 3],
      [0x1f300, 0x1f5ff, 4],
      [0x1f680, 0x1f6c5, 1],
    ],
    marks: [],
    markRate: 0,
    separator: " ",
    wordLength: [1, 3],
    direction: "ltr",
    needsShaping: true,
    punctuation: [],
  },
};

/** The identifiers of all scripts, in a fixed order. */
export const scriptIds: readonly ScriptId[] = Object.keys(scripts) as ScriptId[];

/** This function gives `true` when the code point is in one of the ranges. */
export function inRanges(codePoint: number, ranges: readonly CodePointRange[]): boolean {
  return ranges.some(([first, last]) => codePoint >= first && codePoint <= last);
}
