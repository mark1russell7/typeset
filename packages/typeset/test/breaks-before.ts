/**
 * The fingerprints of the breaks of the corpus. The file `breaks-before.json` holds the fingerprints of the code before the
 * glue had stretch and shrink. A test compares each breaker of the head with that file.
 */
import { createHash } from "node:crypto";
import { generateSample, type ScriptId } from "@typeset/corpus";
import { paragraphOf, type Breaker, type ParagraphOptions } from "../src/breaking.ts";

/** The seed, the scripts, the paragraphs of each script and the widths of the fingerprints. */
export const beforeSeed = 14;
export const beforeScripts: readonly ScriptId[] = ["latin", "latin-extended", "greek", "cyrillic", "han", "kana"];
export const beforePerScript = 50;
export const beforeWidths: readonly number[] = [120, 240, 480];

/** This function gives a width from 4 to 12 for each code point. A width with a fraction shows each change of a sum. */
const widthOf = (text: string): number => {
  let px = 0;
  for (const character of text) px += 4 + ((Math.imul(character.codePointAt(0)!, 2654435761) >>> 0) % 801) / 100;
  return px;
};

/** This function gives a hyphen place at each third offset of a word, so the fingerprints also cover penalties. */
const hyphenate = (word: string): readonly number[] => Array.from({ length: Math.floor(word.length / 3) }, (_, index) => (index + 1) * 3);

/** This function gives a fingerprint for each script, breaker, width and hook. The options `extra` go to `paragraphOf`. */
export function fingerprints(breakers: Readonly<Record<string, Breaker>>, extra: Partial<ParagraphOptions> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const script of beforeScripts) {
    for (const [hook, options] of [["plain", { widthOf, ...extra }], ["hyphens", { widthOf, hyphenate, ...extra }]] as const) {
      const paragraphs = Array.from({ length: beforePerScript }, (_, index) => paragraphOf(generateSample(beforeSeed, script, "paragraph", index).text, options));
      for (const [name, breaker] of Object.entries(breakers)) {
        for (const width of beforeWidths) {
          const breaks = paragraphs.map((paragraph) => breaker.breaks(paragraph, width));
          result[`${script}/${hook}/${name}/${width}`] = createHash("sha256").update(JSON.stringify(breaks)).digest("hex").slice(0, 16);
        }
      }
    }
  }
  return result;
}
