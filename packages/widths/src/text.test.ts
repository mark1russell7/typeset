import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Text } from "@mark1russell7/typeset/text";
import { fontsFor, generateEdits, generateSample, scriptIds, type Edit, type ScriptId } from "@typeset/corpus";
import { measureWidth, readFont, type Font, type MeasureOptions } from "@typeset/fonts";
import { describe, expect, it } from "vitest";
import { cssInstance, extraSource, extraWeights, fileName, scriptTags } from "./sources.ts";

// The test needs the pinned font files in the folder `TYPESET_FONTS`. `fetch.ts` downloads them. A script with no file is skipped.
const folder = process.env["TYPESET_FONTS"];
const modes: readonly Pick<MeasureOptions, "shaping" | "rounding">[] = [
  { shaping: "dom", rounding: "exact" },
  { shaping: "dom", rounding: "pixel" },
  { shaping: "canvas", rounding: "exact" },
  { shaping: "canvas", rounding: "pixel" },
];
const sequences = 200;
const fonts = new Map<string, Font | undefined>();

function present(id: string): boolean {
  return folder !== undefined && existsSync(join(folder, fileName(id)));
}

function fontOf(id: string, weight = 400): Font | undefined {
  const key = `${id}@${weight}`;
  if (!fonts.has(key)) {
    const file = join(folder ?? "", fileName(id));
    fonts.set(key, folder !== undefined && existsSync(file) ? readFont(readFileSync(file), { instance: cssInstance(weight) }) : undefined);
  }
  return fonts.get(key);
}

function applied(text: Text, edit: Edit): Text {
  if (edit.kind === "insert") return text.insert(edit.at, edit.text);
  if (edit.kind === "delete") return text.remove(edit.at, edit.at + edit.length);
  return text.replace(edit.at, edit.at + edit.length, edit.text);
}

/** This function applies `sequences` edit sequences to the rope and compares the width of the rope with the width of the flat string. */
function check(script: ScriptId, fontAt: (index: number) => Font | undefined): number {
  let checked = 0;
  for (let index = 0; index < sequences; index++) {
    const font = fontAt(index);
    if (font === undefined) continue;
    const sample = generateSample(2026, script, "line", index);
    const options: MeasureOptions = { script: scriptTags[script], ...modes[index % modes.length] };
    const widthOf = (value: string): number => measureWidth(font, value, sample.size, options);
    let text = Text.from(sample.text, widthOf, { chunk: 8 });
    let flat = sample.text;
    for (const edit of generateEdits({ seed: sample.seed, script, base: sample.text, count: 3 })) {
      text = applied(text, edit);
      flat = text.toString();
      const label = `${sample.id} ${options.shaping} ${options.rounding} ${JSON.stringify(flat)}`;
      expect(Math.abs(text.width - widthOf(flat)), label).toBeLessThanOrEqual(1e-6);
    }
    checked++;
  }
  return checked;
}

describe.skipIf(folder === undefined)("the Text rope with the real fonts", () => {
  for (const script of scriptIds) {
    const ids = fontsFor(script).map((font) => font.id);
    it.skipIf(!ids.every(present))(`gives the width of the flat string after each edit: ${script}`, { timeout: 300_000 }, () => {
      expect(check(script, (index) => fontOf(ids[index % ids.length]!))).toBe(sequences);
    });
  }

  for (const weight of extraWeights) {
    it.skipIf(!present(extraSource.id))(`gives the width of the flat string after each edit: Source Sans 3 at ${weight}`, { timeout: 300_000 }, () => {
      expect(check("latin", () => fontOf(extraSource.id, weight))).toBe(sequences);
    });
  }
});
