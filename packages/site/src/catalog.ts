/**
 * The fonts and scripts of the site. They come from the corpus and from the sources of the CI comparison, so the site
 * measures the same files as CI.
 */
import { fonts, scriptIds, type ScriptId } from "@typeset/corpus";
import type { EngineName } from "@typeset/fonts";
import { extraSource, fontSources, sourceUrl } from "@typeset/widths";

/** One font that the visitor can pick. */
export interface FontChoice {
  readonly id: string;
  readonly family: string;
  /** The scripts of the corpus that the font covers. */
  readonly scripts: readonly ScriptId[];
  /** The URL of the file at the pinned commit of `google/fonts`. */
  readonly url: string;
  /** The approximate size of the file, in MB, so the visitor knows the cost of a download. */
  readonly megabytes: number;
}

/** The approximate file sizes of the fonts in MB, from the pinned commit. */
const sizes: Readonly<Record<string, number>> = {
  "noto-sans": 2.0,
  "noto-serif": 1.9,
  "noto-sans-mono": 1.7,
  "noto-sans-arabic": 0.8,
  "noto-sans-hebrew": 0.1,
  "noto-sans-devanagari": 0.6,
  "noto-sans-thai": 0.2,
  "noto-sans-sc": 17.8,
  "noto-sans-jp": 9.6,
  "noto-sans-kr": 10.4,
  "noto-emoji": 2.0,
  "source-sans-3": 0.6,
};

/** The fonts of the site: the 11 fonts of the corpus, then the extra font of the CI comparison. */
export const fontChoices: readonly FontChoice[] = [
  ...fontSources.map((source) => {
    const spec = fonts.find((font) => font.id === source.id)!;
    return { id: source.id, family: spec.family, scripts: spec.scripts, url: sourceUrl(source), megabytes: sizes[source.id] ?? 0 };
  }),
  { id: extraSource.id, family: "Source Sans 3", scripts: ["latin"], url: sourceUrl(extraSource), megabytes: sizes[extraSource.id] ?? 0 },
];

/** This function gives the font choice with the identifier `id`. It throws for an unknown identifier. */
export function fontChoice(id: string): FontChoice {
  const choice = fontChoices.find((font) => font.id === id);
  if (choice === undefined) throw new Error(`the site has no font ${id}`);
  return choice;
}

/** The label of each script of the corpus. */
export const scriptLabels: Readonly<Record<ScriptId, string>> = {
  latin: "Latin",
  "latin-extended": "Latin with marks",
  greek: "Greek",
  cyrillic: "Cyrillic",
  arabic: "Arabic",
  hebrew: "Hebrew",
  devanagari: "Devanagari",
  thai: "Thai",
  han: "Han",
  kana: "Kana",
  hangul: "Hangul",
  emoji: "Emoji",
};

/** The scripts in the order of the corpus. */
export const scriptOrder: readonly ScriptId[] = scriptIds;

/** The scripts that need a shaper for a correct width. The model of typeset does not shape them yet (roadmap item T1d). Arabic has its joining forms since typeset#34. */
export const shapedScripts: ReadonlySet<ScriptId> = new Set<ScriptId>(["devanagari"]);

/** One text engine, with its platform and a one-line description. */
export interface EngineChoice {
  readonly name: EngineName;
  readonly platform: string;
  readonly description: string;
}

/** The text engines of the table `engines`, with the platform that uses each of them. */
export const engineChoices: readonly EngineChoice[] = [
  { name: "freetype", platform: "Linux, ChromeOS, Android", description: "FreeType rounds each advance to whole px at the device scale 1." },
  { name: "coretext", platform: "macOS, iOS", description: "CoreText keeps the fractions of the variable-font deltas." },
  { name: "directwrite", platform: "Windows", description: "DirectWrite gives a composite glyph the advance of its main component." },
];

/**
 * This function gives the engine of the visitor's platform from the user agent text. Windows uses DirectWrite, Apple
 * systems use CoreText, and the other systems use FreeType.
 */
export function engineForAgent(agent: string): EngineName {
  if (/Windows/i.test(agent)) return "directwrite";
  if (/Macintosh|Mac OS X|iPhone|iPad/i.test(agent)) return "coretext";
  return "freetype";
}

/** The arm of the CI comparison that uses an engine. FreeType has two arms, and the scale 1 is the arm of its model. */
export const armOfEngine: Readonly<Record<EngineName, string>> = { freetype: "linux-1", coretext: "macos-2", directwrite: "windows-1" };
