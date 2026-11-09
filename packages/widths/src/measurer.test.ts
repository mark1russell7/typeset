import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createMeasurer, layoutText, TEXT_UNITS } from "@mark1russell7/layout-contract/text";
import { engines, measureWidth, readFont, type EngineName } from "@mark1russell7/typeset/fonts";
import { fontAdvance } from "@mark1russell7/typeset/measurer";
import { fontsFor, generateSample, scriptIds, type FontId, type ScriptId } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";
import { drawnTexts, fontStacks, markTexts, missingInStack, mixedTexts, stackFont } from "./stacks.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. The restore command of `@typeset/pinned` gets them. A script with no file is skipped.
const folder = process.env["TYPESET_FONTS"];
const samples = 40;
const names = Object.keys(engines) as EngineName[];
const files = new Map<string, Uint8Array>();

function present(id: string): boolean {
  return folder !== undefined && existsSync(join(folder, fileName(id)));
}

function bytesOf(id: string): Uint8Array {
  let bytes = files.get(id);
  if (bytes === undefined) {
    bytes = readFileSync(join(folder ?? "", fileName(id)));
    files.set(id, bytes);
  }
  return bytes;
}

/**
 * This function compares `fontAdvance` with `measureWidth` of the same font, size, script and engine rules on `samples`
 * line samples for each engine. It also lays out each sample with `layoutText`. It gives the count of the compared samples.
 */
function check(script: ScriptId, idAt: (index: number) => string, weight: number): number {
  let checked = 0;
  for (const engine of names) {
    const rules = engines[engine];
    const advances = new Map<string, (text: string, font: string) => number>();
    for (let index = 0; index < samples; index++) {
      const id = idAt(index);
      const sample = generateSample(2026, script, "line", index);
      const font = readFont(bytesOf(id), { instance: cssInstance(weight), deltas: rules.deltas, metrics: rules.metrics });
      const want = measureWidth(font, sample.text, sample.size, { script: scriptTags[script], shaping: "canvas", rounding: rules.rounding, sum: rules.sum });
      let advance = advances.get(id);
      if (advance === undefined) {
        advance = fontAdvance({ faces: [{ family: id, data: bytesOf(id) }], engine });
        advances.set(id, advance);
      }
      const css = `${weight} ${sample.size}px "${id}"`;
      expect(advance(sample.text, css), `${sample.id} ${engine}`).toBe(want);
      const layout = layoutText(sample.text, { font: css, measurer: createMeasurer(advance), lineHeight: sample.size * 1.25, wrapWidth: sample.size * 12 });
      expect(layout.lineCount, sample.id).toBeGreaterThan(0);
      for (const width of layout.widths) expect(Number.isInteger(width * TEXT_UNITS), sample.id).toBe(true);
      checked++;
    }
  }
  return checked;
}

describe.skipIf(folder === undefined)("fontAdvance with the real fonts", () => {
  for (const script of scriptIds) {
    const ids = fontsFor(script).map((font) => font.id);
    it.skipIf(!ids.every(present))(`gives the width of measureWidth for each engine: ${script}`, { timeout: 300_000 }, () => {
      expect(check(script, (index) => ids[index % ids.length]!, 400)).toBe(samples * names.length);
    });
  }

  for (const weight of extraWeights) {
    it.skipIf(!present(extraSource.id))(`gives the width of measureWidth for each engine: Source Sans 3 at ${weight}`, { timeout: 300_000 }, () => {
      expect(check("latin", () => extraSource.id, weight)).toBe(samples * names.length);
    });
  }
});

/** The width limit of a stack cell, in px: 1.28 in 1/64 px, as the prediction of T11 gives it. */
const stackLimit = 1.28 / 64;

/** The segmenter of the grapheme clusters, as the layout of layout-contract divides a text. */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** This function tells if a font has a glyph for each code point of a text. */
function coversText(font: ReturnType<typeof readFont>, text: string): boolean {
  return [...text].every((character) => font.glyph(character.codePointAt(0)!) !== 0);
}

describe.skipIf(folder === undefined)("fontAdvance with a font stack, as Blink falls back", () => {
  for (const stack of fontStacks) {
    it.skipIf(!stack.fonts.every(present))(`gives a mark that the first font lacks no .notdef advance: ${stack.id}`, { timeout: 300_000 }, () => {
      const list = stack.fonts.map((id) => readFont(bytesOf(id), { instance: cssInstance() }));
      // A stack whose later fonts have no mark that the first font lacks, as latin-han, has no mark text.
      const texts = markTexts(stack, list);
      for (const engine of names) {
        const advance = fontAdvance({ faces: stack.fonts.map((id) => ({ family: `typeset-${id}`, data: bytesOf(id) })), engine });
        const alone = (text: string, id: FontId, size: number): number => advance(text, stackFont({ ...stack, fonts: [id] }, size));
        for (const { id, text } of texts) {
          const [base, mark] = [...text];
          expect(list[0]!.glyph(mark!.codePointAt(0)!), `${id}: the first font lacks the mark`).toBe(0);
          const cluster = `${base}${mark}`;
          // Blink keeps a mark of a script, not Inherited, in a script run of its own. Else the base and the mark are one cluster.
          const own = !/\p{sc=Inherited}/u.test(mark!);
          for (const size of [10, 16, 48]) {
            const rest = advance(" a", stackFont(stack, size));
            let want: number;
            if (own) {
              const markFont = stack.fonts.find((_, index) => list[index]!.glyph(mark!.codePointAt(0)!) !== 0)!;
              want = advance("a", stackFont(stack, size)) + alone(mark!, markFont, size) + rest;
            } else {
              const index = list.findIndex((font) => coversText(font, cluster) || coversText(font, cluster.normalize("NFC")));
              want = alone(cluster, stack.fonts[index]!, size) + rest;
            }
            const got = advance(text, stackFont(stack, size));
            expect(Math.abs(got - want), `${id} ${engine} ${size}px: ${got} against ${want}`).toBeLessThanOrEqual(stackLimit);
          }
        }
      }
    });
  }

  for (const stack of fontStacks) {
    it.skipIf(!stack.fonts.every(present))(`lays out the texts of a stack through the measurer of layout-contract: ${stack.id}`, { timeout: 300_000 }, () => {
      const list = stack.fonts.map((id) => readFont(bytesOf(id), { instance: cssInstance() }));
      const covered = [...mixedTexts(stack, 1, list), ...markTexts(stack, list)];
      expect(covered.every(({ text }) => missingInStack(list, text) === 0), stack.id).toBe(true);
      // A drawn text can have a code point that no font has. The model and the layout still give it a width: the .notdef advance.
      const texts = [...covered, ...drawnTexts(stack, 1)];
      for (const engine of names) {
        const advance = fontAdvance({ faces: stack.fonts.map((id) => ({ family: `typeset-${id}`, data: bytesOf(id) })), engine });
        for (const { id, text } of texts) {
          for (const size of [10, 16, 48]) {
            const font = stackFont(stack, size);
            // The layout measures each part between two break opportunities alone, with the CSS list of the stack. The
            // measurer rounds each part to whole units. So the line differs from the sum of its parts by 0.5 unit for each part at most.
            // The whole text can differ more: the layout loses a kern across a break in a word, as "л," and "、そ" show.
            const parts: string[] = [];
            const measurer = createMeasurer((segment, css) => {
              expect(css, id).toBe(font);
              parts.push(segment);
              return advance(segment, css);
            }, { maxEntries: 0 });
            const line = layoutText(text, { font, measurer, lineHeight: size * 1.25 });
            // The layout measures the space one time, and puts it between each two words. A space with a lone skin tone
            // modifier after it is one grapheme cluster, so it is in a word.
            const pieces = parts.filter((part) => part !== " ");
            const spaces = [...graphemes.segment(text)].filter(({ segment }) => segment === " ").length;
            const sum = pieces.reduce((total, part) => total + advance(part, font), 0) + spaces * advance(" ", font);
            expect(Math.abs(line.widths[0]! - sum), `${id} ${engine} ${size}px`).toBeLessThanOrEqual(((pieces.length + spaces) * 0.5) / TEXT_UNITS);
            expect(Number.isFinite(line.widths[0]!) && line.widths[0]! > 0, `${id} ${engine} ${size}px`).toBe(true);
            const wrapped = layoutText(text, { font, measurer, lineHeight: size * 1.25, wrapWidth: size * 8 });
            expect(wrapped.lines.join(" ").split(/\s+/u), `${id} ${engine} ${size}px`).toEqual(text.split(/\s+/u));
            for (const width of wrapped.widths) expect(Number.isInteger(width * TEXT_UNITS), id).toBe(true);
          }
        }
      }
    });
  }

  it.skipIf(!["noto-sans", "noto-emoji"].every(present))("keeps a space before a lone skin tone modifier in the first font", () => {
    const stack = fontStacks.find((value) => value.id === "latin-arabic-emoji")!;
    for (const engine of names) {
      const advance = fontAdvance({ faces: stack.fonts.map((id) => ({ family: `typeset-${id}`, data: bytesOf(id) })), engine });
      const want = advance(" ", stackFont({ ...stack, fonts: ["noto-sans"] }, 16)) + advance("\u{1F3FC}\u{1F44F}", stackFont({ ...stack, fonts: ["noto-emoji"] }, 16));
      expect(Math.abs(advance(" \u{1F3FC}\u{1F44F}", stackFont(stack, 16)) - want), engine).toBeLessThanOrEqual(stackLimit);
    }
  });
});
