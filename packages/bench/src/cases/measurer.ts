import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readFont } from "@mark1russell7/typeset/fonts";
import { fontAdvance } from "@mark1russell7/typeset/measurer";
import { fileName, fontStacks, mixedTexts, stackFont, type FontStack } from "@typeset/widths";
import { defineCase, type BenchCase, type CaseModule } from "../case.ts";

/** The environment variable with the folder of the pinned font files. `bench.yml` fetches them with their SHA-256. */
export const fontFolder = "TYPESET_FONTS";

/** The size of the texts of the cases, in px. */
const size = 16;

/** This function gives the bytes of a pinned font file. It throws when the folder `TYPESET_FONTS` is not set. */
function bytesOf(id: string): Uint8Array {
  const folder = process.env[fontFolder];
  if (folder === undefined || folder === "") throw new Error(`the measurer cases need the pinned fonts in the folder ${fontFolder}`);
  return readFileSync(join(folder, fileName(id)));
}

/**
 * This function gives a case that measures the 24 `mixed` texts of a stack at 16 px with the model of FreeType. Each
 * run measures each text again, because `fontAdvance` keeps no width of a text.
 */
function stackCase(stack: FontStack): BenchCase {
  return defineCase({
    setup: () => {
      const fonts = stack.fonts.map((id) => readFont(bytesOf(id)));
      const texts = mixedTexts(stack, 1, fonts).map(({ text }) => text);
      const advance = fontAdvance({ faces: stack.fonts.map((id) => ({ family: `typeset-${id}`, data: bytesOf(id) })), engine: "freetype" });
      return { advance, texts, font: stackFont(stack, size) };
    },
    run: (state) => state.texts.reduce((sum, text) => sum + state.advance(text, state.font), 0),
  });
}

/** This function gives the stack of an identifier. */
function stackOf(id: string): FontStack {
  const stack = fontStacks.find((value) => value.id === id);
  if (stack === undefined) throw new Error(`no font stack ${id}`);
  return stack;
}

/** The cases of the font-stack measurer of T11. A stack of one font is the base of the fallback over a list. */
export const cases: CaseModule = {
  "measurer.one-font": stackCase({ id: "latin", fonts: ["noto-sans"], scripts: ["latin"] }),
  "measurer.latin-han": stackCase(stackOf("latin-han")),
  "measurer.all-scripts": stackCase(stackOf("all-scripts")),
};
