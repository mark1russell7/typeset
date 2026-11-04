import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fontsFor, generateSample, scriptIds } from "@typeset/corpus";
import { measureWidth, readFont, shapingRisks, type MeasureOptions } from "@mark1russell7/typeset/fonts";
import { describe, expect, it } from "vitest";
import { blinkScale, tiers } from "./bounds.ts";
import { openReferenceFont, type ReferenceFont } from "./harfbuzz.ts";
import { ignorableCodePoints, sequenceEntries, type SequenceEntry, type SequenceGroup } from "./sequences.ts";
import { cssInstance, extraSource, fileName, scriptTags, sequenceSources } from "./sources.ts";

// These tests need the pinned font files in the folder `TYPESET_FONTS`. A font with no file is skipped.
const folder = process.env["TYPESET_FONTS"];
const out = process.env["TYPESET_SEQUENCES_OUT"];
const SIZE = 96;
const LIMIT = 1 / 64;

const present = (id: string): boolean => folder !== undefined && existsSync(join(folder, fileName(id)));
const bytesOf = (id: string): Uint8Array => readFileSync(join(folder!, fileName(id)));

const words = (reference: ReferenceFont, text: string, script: string): { word: string; width: number }[] =>
  reference.shapeWords(text, script, blinkScale(SIZE)).map(({ word, shaped }) => ({ word, width: shaped.advances.reduce((sum, advance) => sum + advance, 0) / 65536 }));

describe("the sequence list", () => {
  it("has at least 120 texts, and each group has a text", () => {
    expect(sequenceEntries.length).toBeGreaterThanOrEqual(120);
    const groups: readonly SequenceGroup[] = ["zwj", "variation", "keycap", "flag", "tag", "zwnj", "bidi", "hidden-kerning", "bengali", "khmer", "mongolian"];
    for (const group of groups) expect(sequenceEntries.some((entry) => entry.group === group), group).toBe(true);
    expect(new Set(sequenceEntries.map((entry) => entry.id)).size).toBe(sequenceEntries.length);
  });
});

describe.skipIf(folder === undefined)("the model against HarfBuzz on the sequence list", () => {
  it("is within 1/64 px at 96 px on each word with no risk", { timeout: 300_000 }, () => {
    const rows: { id: string; group: string; word: string; risks: string[]; model: number; harfbuzz: number }[] = [];
    const entriesOf = new Map<string, SequenceEntry[]>();
    for (const entry of sequenceEntries) if (present(entry.font)) entriesOf.set(entry.font, [...(entriesOf.get(entry.font) ?? []), entry]);
    for (const [id, entries] of entriesOf) {
      const bytes = bytesOf(id);
      const reference = openReferenceFont(bytes, cssInstance());
      const model = readFont(bytes, { instance: cssInstance(), deltas: "round", metrics: "own" });
      for (const entry of entries) {
        const options: MeasureOptions = { ...tiers.model, script: entry.script, shaping: "canvas", rounding: "exact", sum: "exact" };
        for (const { word, width } of words(reference, entry.text, entry.script)) {
          const risks = shapingRisks(model, word, options).map((risk) => risk.code);
          rows.push({ id: entry.id, group: entry.group, word, risks, model: measureWidth(model, word, SIZE, options), harfbuzz: width });
        }
      }
    }
    const differs = (row: (typeof rows)[number]): boolean => Math.abs(row.model - row.harfbuzz) > LIMIT;
    const violations = rows.filter((row) => row.risks.length === 0 && differs(row));
    const newFonts = ["bengali", "khmer", "mongolian"].map((group) => {
      const own = rows.filter((row) => row.group === group);
      return { group, words: own.length, differ: own.filter(differs).length };
    });
    if (out !== undefined) writeFileSync(out, `${JSON.stringify({ schema: "typeset-sequences/1", size: SIZE, limit: LIMIT, words: rows.length, violations, newFonts, rows }, null, 1)}\n`);
    expect(rows.length).toBeGreaterThan(0);
    expect(violations.map((row) => `${row.id} ${row.model} ${row.harfbuzz}`)).toEqual([]);
  });

  it("gives each new font words that differ from HarfBuzz, so the risks have work to do", { timeout: 120_000 }, () => {
    for (const source of sequenceSources.filter(({ id }) => present(id))) {
      const bytes = bytesOf(source.id);
      const reference = openReferenceFont(bytes, cssInstance());
      const model = readFont(bytes, { instance: cssInstance(), deltas: "round", metrics: "own" });
      const entries = sequenceEntries.filter((entry) => entry.font === source.id);
      const differ = entries.filter((entry) => {
        const options: MeasureOptions = { ...tiers.model, script: entry.script, shaping: "canvas", rounding: "exact", sum: "exact" };
        return Math.abs(measureWidth(model, entry.text, SIZE, options) - words(reference, entry.text, entry.script).reduce((sum, { width }) => sum + width, 0)) > LIMIT;
      });
      expect(differ.length / entries.length, source.id).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("gives each ignorable the width of HarfBuzz between two letters, at the units per em", { timeout: 300_000 }, () => {
    const mismatches: string[] = [];
    const cells = [...scriptIds.flatMap((script) => fontsFor(script).map((font) => [script, font.id as string] as const)), ["latin", extraSource.id] as const];
    const fonts = new Set<string>();
    for (const [script, id] of cells) {
      if (!present(id) || fonts.has(id)) continue;
      fonts.add(id);
      const bytes = bytesOf(id);
      const reference = openReferenceFont(bytes, cssInstance());
      const model = readFont(bytes, { instance: cssInstance(), deltas: "round", metrics: "own" });
      const [first, second] = [...generateSample(2026, script, "word", 0).text];
      const tag = scriptTags[script];
      for (const codePoint of ignorableCodePoints) {
        const text = `${first}${String.fromCodePoint(codePoint)}${second}`;
        const shaped = reference.shape(text, tag).advances.reduce((sum, advance) => sum + advance, 0);
        const width = measureWidth(model, text, reference.unitsPerEm, { ...tiers.model, script: tag, rounding: "exact", sum: "exact" });
        if (Math.abs(width - shaped) > 1e-6) mismatches.push(`${id} U+${codePoint.toString(16)} ${width} ${shaped}`);
      }
    }
    expect(fonts.size).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
