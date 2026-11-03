import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createMeasurer, layoutText, TEXT_UNITS } from "@mark1russell7/layout-contract/text";
import { engines, measureWidth, readFont, type EngineName } from "@mark1russell7/typeset/fonts";
import { fontAdvance } from "@mark1russell7/typeset/measurer";
import { fontsFor, generateSample, scriptIds, type ScriptId } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. `fetch.ts` downloads them. A script with no file is skipped.
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
