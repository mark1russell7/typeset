import type { ScriptId } from "./scripts.ts";

/** The identifier of a font of the corpus. */
export type FontId =
  | "noto-sans"
  | "noto-serif"
  | "noto-sans-mono"
  | "noto-sans-arabic"
  | "noto-sans-hebrew"
  | "noto-sans-devanagari"
  | "noto-sans-thai"
  | "noto-sans-sc"
  | "noto-sans-jp"
  | "noto-sans-kr"
  | "noto-emoji";

/** The description of a font of the corpus. T1 gets the files. This list gives only the names and the coverage. */
export interface FontSpec {
  readonly id: FontId;
  readonly family: string;
  /** The scripts that the font covers. */
  readonly scripts: readonly ScriptId[];
  /** This value is `true` when each glyph has the same advance. */
  readonly monospace: boolean;
  readonly license: "OFL-1.1";
}

const european: readonly ScriptId[] = ["latin", "latin-extended", "greek", "cyrillic"];

/** The fonts of the corpus. All of them have the SIL Open Font License, so CI can download them. */
export const fonts: readonly FontSpec[] = [
  { id: "noto-sans", family: "Noto Sans", scripts: european, monospace: false, license: "OFL-1.1" },
  { id: "noto-serif", family: "Noto Serif", scripts: european, monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-mono", family: "Noto Sans Mono", scripts: european, monospace: true, license: "OFL-1.1" },
  { id: "noto-sans-arabic", family: "Noto Sans Arabic", scripts: ["arabic"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-hebrew", family: "Noto Sans Hebrew", scripts: ["hebrew"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-devanagari", family: "Noto Sans Devanagari", scripts: ["devanagari"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-thai", family: "Noto Sans Thai", scripts: ["thai"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-sc", family: "Noto Sans SC", scripts: ["han"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-jp", family: "Noto Sans JP", scripts: ["han", "kana"], monospace: false, license: "OFL-1.1" },
  { id: "noto-sans-kr", family: "Noto Sans KR", scripts: ["hangul"], monospace: false, license: "OFL-1.1" },
  { id: "noto-emoji", family: "Noto Emoji", scripts: ["emoji"], monospace: false, license: "OFL-1.1" },
];

/** This function gives the fonts that cover a script, in the order of the list `fonts`. */
export function fontsFor(script: ScriptId): readonly FontSpec[] {
  return fonts.filter((font) => font.scripts.includes(script));
}
