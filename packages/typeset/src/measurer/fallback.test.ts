import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { random } from "@mark1russell7/rigor-generators";
import { generateEdits, generateSample, type Edit, type LengthClass, type ScriptId } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { buildTtf, characters } from "../../test/fonts.ts";
import { engines, measureWidth, readFont, shapingRisks, type EngineName, type EngineRules } from "../fonts.ts";
import { canvasWords } from "../fonts/words.ts";
import { fontAdvance, scriptTag, type AdvanceFn } from "../measurer.ts";
import { Text } from "../text.ts";
import { fallbackClusters, scriptRuns } from "./advance.ts";

const exact: EngineRules = { ...engines.freetype, rounding: "exact", sum: "exact" };
const CSS = "16px Test";

/** This function makes a fallback that keeps each call. Its width of a word is a pure function of the word. */
function stub(): { calls: string[]; fallback: AdvanceFn } {
  const calls: string[] = [];
  return { calls, fallback: (word) => (calls.push(word), [...word].length * 7.25) };
}

describe("scriptRuns", () => {
  it("keeps a text of one script in one run", () => {
    expect(scriptRuns("")).toEqual([""]);
    expect(scriptRuns("Hello, world 123")).toEqual(["Hello, world 123"]);
    expect(scriptRuns("123 नमस्ते ।")).toEqual(["123 नमस्ते ।"]);
    expect(scriptRuns("漢字とカタカナ")).toEqual(["漢字とカタカナ"]);
  });

  it("gives a neutral character to the run before it", () => {
    expect(scriptRuns("Hello नमस्ते")).toEqual(["Hello ", "नमस्ते"]);
    expect(scriptRuns("नमस्ते 1 Hello")).toEqual(["नमस्ते 1 ", "Hello"]);
  });

  it("keeps a mark in the run of its base", () => {
    expect(scriptRuns("éж")).toEqual(["é", "ж"]);
  });
});


describe("fallbackClusters", () => {
  it("keeps a base and an Inherited mark in one cluster", () => {
    expect(fallbackClusters("â a")).toEqual(["â", " ", "a"]);
  });

  it("splits a mark of another script from its base, as the script runs of Blink do", () => {
    expect(fallbackClusters("aऺ a")).toEqual(["a", "ऺ", " ", "a"]);
  });

  it("splits a space from a lone skin tone modifier, as the emoji runs of Blink do", () => {
    expect(fallbackClusters(" \u{1F3FC}\u{1F44F}")).toEqual([" ", "\u{1F3FC}", "\u{1F44F}"]);
  });

  it("keeps an emoji with its modifier and a ZWJ sequence in one cluster", () => {
    expect(fallbackClusters("\u{1F44F}\u{1F3FC}")).toEqual(["\u{1F44F}\u{1F3FC}"]);
    expect(fallbackClusters("\u{1F468}‍\u{1F469}")).toEqual(["\u{1F468}‍\u{1F469}"]);
  });
});
describe("a list of 2 fonts in the canvas shaping", () => {
  const noO = buildTtf(false, false, "hvar", characters.filter(([code]) => code !== 0x6f));
  const advance = fontAdvance({ faces: [{ family: "Base", data: noO }, { family: "Full", data: buildTtf() }], engine: exact });
  const listed = (text: string): number => advance(text, "16px Base, Full");
  const parts = ["A", "T", "V", "o", "Á", " ", "o ", " o"];

  /** This function gives the largest difference of the rope and one measure over seeded texts and edits. */
  const worstGap = (widthOf: (text: string) => number): number => {
    let worst = 0;
    for (let index = 0; index < 200; index++) {
      const source = random(2026 + index);
      const textOf = (length: number): string => Array.from({ length }, () => source.pick(parts)).join("");
      let text = Text.from(textOf(source.int(4, 40)), widthOf, { chunk: 8 });
      for (let edit = 0; edit < 4; edit++) {
        const flat = text.toString();
        const start = source.int(0, flat.length);
        // An edit keeps a mark with its base, so the text stays valid at each offset
        text = text.insert(flat[start] === "́" ? start + 1 : start, textOf(source.int(1, 4)));
        worst = Math.max(worst, Math.abs(text.width - widthOf(text.toString())));
      }
    }
    return worst;
  };

  it("keeps the separator law at each edit", () => {
    expect(worstGap(listed)).toBeLessThanOrEqual(1e-6);
  });

  it("finds a break of the law in a measure that looks over a space", () => {
    expect(worstGap((text) => listed(text) + (text.includes("o A") ? 1 : 0))).toBeGreaterThan(0.5);
  });
});

describe("the fallback of fontAdvance", () => {
  const faces = [{ family: "Test", data: buildTtf() }];
  const plain = fontAdvance({ faces, engine: exact });
  const guarded = (fallback: AdvanceFn, shaping?: "dom" | "canvas"): AdvanceFn => fontAdvance({ faces, engine: exact, fallback, ...(shaping === undefined ? {} : { shaping }) });

  it("gets no call for a text with no risk", () => {
    const { calls, fallback } = stub();
    expect(Object.is(guarded(fallback)("AoT AV", CSS), plain("AoT AV", CSS))).toBe(true);
    expect(calls).toEqual([]);
  });

  it("gets each flagged word alone, and the model measures the rest", () => {
    const { calls, fallback } = stub();
    const width = guarded(fallback)("AoT xy AV", CSS);
    expect(calls).toEqual(["xy"]);
    expect(width).toBe(plain("AoT ", CSS) + 14.5 + plain(" AV", CSS));
  });

  it("gets the whole word when one part of it is flagged", () => {
    const { calls, fallback } = stub();
    guarded(fallback)("Axz AV", CSS);
    expect(calls).toEqual(["Axz"]);
  });

  it("gets the CSS font of the text", () => {
    const fonts: string[] = [];
    guarded((_, font) => (fonts.push(font), 1))("x", CSS);
    expect(fonts).toEqual([CSS]);
  });

  it("gets no call under the shaping dom", () => {
    const { calls, fallback } = stub();
    expect(guarded(fallback, "dom")("AoT xy", CSS)).toBe(fontAdvance({ faces, engine: exact, shaping: "dom" })("AoT xy", CSS));
    expect(calls).toEqual([]);
  });

  it("gets no call when another face of the list has the glyph", () => {
    const { calls, fallback } = stub();
    const noO = buildTtf(false, false, "hvar", characters.filter(([code]) => code !== 0x6f));
    const two = [{ family: "First", data: noO }, { family: "Second", data: buildTtf() }];
    const font = "16px First, Second";
    expect(fontAdvance({ faces: two, engine: exact, fallback })("AoT", font)).toBe(fontAdvance({ faces: two, engine: exact })("AoT", font));
    expect(calls).toEqual([]);
  });

  it("gives the empty text the width 0", () => {
    const { calls, fallback } = stub();
    expect(guarded(fallback)("", CSS)).toBe(0);
    expect(calls).toEqual([]);
  });
});

// These tests need the pinned font files in the folder `TYPESET_FONTS`. Each font with no file is skipped.
const folder = process.env["TYPESET_FONTS"];
const bytesOf = (name: string): Uint8Array | undefined => {
  const file = join(folder ?? "", `${name}.ttf`);
  return folder !== undefined && existsSync(file) ? readFileSync(file) : undefined;
};
const cells: readonly (readonly [ScriptId, string])[] = [
  ["latin", "noto-sans"], ["latin", "source-sans-3"], ["latin-extended", "noto-sans"], ["latin-extended", "source-sans-3"], ["greek", "noto-sans"], ["cyrillic", "noto-sans"],
  ["arabic", "noto-sans-arabic"], ["hebrew", "noto-sans-hebrew"], ["devanagari", "noto-sans-devanagari"], ["emoji", "noto-emoji"],
];
const lengths: readonly LengthClass[] = ["word", "line", "paragraph"];
const names = Object.keys(engines) as EngineName[];
const present = cells.filter(([, name]) => bytesOf(name) !== undefined);
const SIZE = 16;

describe.skipIf(present.length !== cells.length)("the fallback on the corpus", () => {
  it("gets a call only for a flagged word, and leaves each other width equal to measureWidth", () => {
    let ordinary = 0;
    let flagged = 0;
    for (const [script, name] of present) {
      const data = bytesOf(name)!;
      const fonts = names.map((engine) => readFont(data, { instance: { wght: 400, wdth: 100 }, deltas: engines[engine].deltas, metrics: engines[engine].metrics }));
      const css = `${SIZE}px Face`;
      const faces = [{ family: "Face", data }];
      // One fallback for each engine, so that each font is read once
      const recorder = stub();
      const advances = names.map((engine) => fontAdvance({ faces, engine: engines[engine], fallback: recorder.fallback }));
      for (const [index, length] of lengths.flatMap((value) => Array.from({ length: 10 }, (_, i) => [i, value] as const))) {
        const { text } = generateSample(2026, script, length, index);
        const engine = engines[names[index % names.length]!];
        const font = fonts[index % names.length]!;
        const options = { script: scriptTag(text), shaping: "canvas" as const, rounding: engine.rounding, sum: engine.sum };
        const words = canvasWords(text).filter((word) => shapingRisks(font, word, options).length > 0);
        recorder.calls.length = 0;
        const width = advances[index % names.length]!(text, css);
        expect(recorder.calls, text).toEqual(words);
        if (words.length > 0) flagged++;
        else {
          ordinary++;
          expect(Object.is(width, measureWidth(font, text, SIZE, options)), `${script} ${name} ${index} ${length}`).toBe(true);
        }
      }
    }
    expect(ordinary).toBeGreaterThan(0);
    expect(flagged).toBeGreaterThan(0);
  }, 120_000);

  it("measures each word of a mixed text with its own script", () => {
    const data = bytesOf("noto-sans-devanagari")!;
    const font = readFont(data, { instance: { wght: 400, wdth: 100 } });
    const advance = fontAdvance({ faces: [{ family: "Face", data }], engine: exact });
    const width = (text: string, script: string): number => measureWidth(font, text, SIZE, { script, shaping: "canvas", rounding: "exact", sum: "exact" });
    expect(advance("Hello नमस्ते", `${SIZE}px Face`)).toBe(width("Hello", "latn") + width(" ", "DFLT") + width("नमस्ते", "deva"));
    expect(width("नमस्ते", "deva")).not.toBe(width("नमस्ते", "latn"));
  });

  const rows: readonly (readonly [string, EngineRules])[] = [["exact", exact], ["pixel", engines.freetype]];
  it.each(rows)("keeps a rope of mixed text with a fallback within 1e-6 px of the flat width, with rounding %s", (_, engine) => {
    const faces = ["noto-sans", "noto-sans-devanagari", "noto-emoji"].map((name, i) => ({ family: `Face${i}`, data: bytesOf(name)! }));
    const css = `${SIZE}px Face0, Face1, Face2`;
    const { calls, fallback } = stub();
    const advance = fontAdvance({ faces, engine, fallback });
    const widthOf = (value: string): number => advance(value, css);
    const flaggedWords = ["\u{1F1FA}\u{1F1F8}", "1️⃣", "কাজ", "\u{1F468}‍\u{1F467}"];
    const applied = (text: Text, edit: Edit): Text => {
      if (edit.kind === "insert") return text.insert(edit.at, edit.text);
      if (edit.kind === "delete") return text.remove(edit.at, edit.at + edit.length);
      return text.replace(edit.at, edit.at + edit.length, edit.text);
    };
    for (let index = 0; index < 200; index++) {
      const latin = generateSample(2026, "latin", "line", index);
      const devanagari = generateSample(2026, "devanagari", "word", index);
      const base = `${latin.text} ${devanagari.text} ${flaggedWords[index % flaggedWords.length]} ${latin.text}`;
      let text = Text.from(base, widthOf, { chunk: 8 });
      for (const edit of generateEdits({ seed: latin.seed, script: index % 2 === 0 ? "latin" : "devanagari", base, count: 3 })) {
        text = applied(text, edit);
        const flat = text.toString();
        expect(Math.abs(text.width - widthOf(flat)), `${index} ${JSON.stringify(flat)}`).toBeLessThanOrEqual(1e-6);
      }
    }
    expect(calls.length).toBeGreaterThan(0);
  }, 120_000);
});
