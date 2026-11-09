import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hyphenate as frHyphenate } from "@mark1russell7/typeset/hyphen/fr";
import { hyphenator, type PatternSet } from "@mark1russell7/typeset/hyphen";
import { describe, expect, it } from "vitest";
import { gnDigraphConflicts, gnDigraphSplits, referenceRules, rulesOf, type LanguageRules } from "./classes.ts";
import { hyphenPaths } from "./gate.ts";
import { makeLayer, marked, withLayer, type Layer } from "./layer.ts";
import { parseLexique, type ReferenceList } from "./lexique.ts";
import { parseWords } from "./words.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const paths = hyphenPaths(root);

/** This function gives a row of the TSV file of Lexique 3.83, with the word, its phonetic form and its syllables. */
const row = (word: string, phonetic: string, syllables: string): string => {
  const cells = Array.from({ length: 35 }, () => "");
  cells[0] = word;
  cells[1] = phonetic;
  cells[27] = syllables;
  return cells.join("\t");
};

describe("parseLexique", () => {
  it("keeps the words of letters whose syllables give the same letters, with all phonetic forms one time", () => {
    const text = ["ortho", row("couvent", "kuv", "cou-vent"), row("couvent", "kuv@", "cou-vent"), row("couvent", "kuv", "cou-vent"), row("aujourd'hui", "oZuRdHi", "au-jour-d'hui"), row("abc", "abk", "a-bd")].join("\n");
    const list = parseLexique(text);
    expect(list.name).toBe("Lexique 3.83");
    expect(list.words).toEqual(parseWords("cou-vent"));
    expect(list.phonetic.get("couvent")).toEqual(["kuv", "kuv@"]);
    expect(list.syllables.get("couvent")).toBe("cou-vent");
  });
});

describe("marked", () => {
  it("puts a hyphen at each offset", () => {
    expect(marked("stagnent", [])).toBe("stagnent");
    expect(marked("stagnent", [1, 4])).toBe("s-tag-nent");
  });
});

describe("makeLayer", () => {
  const words = parseWords("ga-gner ig-ni-tion Gagner");
  const list: ReferenceList = {
    name: "test",
    words,
    syllables: new Map(words.map((word) => [word.word, marked(word.word, word.places)])),
    phonetic: new Map([
      ["gagner", ["gaNe"]],
      ["ignition", ["iNisj§"]],
      ["Gagner", ["gaNe"]],
    ]),
  };
  const rules: LanguageRules = { ...referenceRules["fr"]!, classes: [], guards: [{ name: "gn-digraph", defects: gnDigraphSplits, conflicts: gnDigraphConflicts }] };
  const pinned: PatternSet = { patterns: "g1n", exceptions: "", left: 1, right: 1 };

  it("makes an entry for each lowercase word with a defect, without the hyphens of the defects, and keeps the evidence", () => {
    const layer = makeLayer("fr", pinned, list, rules);
    // The set splits gagner and ignition at gn. In gagner, the list does not have the place: a defect. In ignition, the list has it: a conflict.
    expect(layer).toEqual({ schema: "typeset-hyphen-layer/1", language: "fr", list: "test", entries: [{ word: "gagner", hyphens: "gagner", rules: ["gn-digraph"], syllables: "ga-gner", phonetic: ["gaNe"] }] });
  });

  it("gives the entries as exceptions after the exceptions of the set", () => {
    const layer = makeLayer("fr", pinned, list, rules);
    expect(withLayer(pinned, layer).exceptions).toBe("gagner");
    expect(withLayer({ ...pinned, exceptions: "ta-ble" }, layer).exceptions).toBe("ta-ble gagner");
    expect(withLayer(pinned, undefined)).toBe(pinned);
    expect(hyphenator(withLayer(pinned, layer))("gagner")).toEqual([]);
  });
});

describe("the layer of each language", () => {
  for (const [language, rules] of Object.entries(referenceRules)) {
    const layer = JSON.parse(readFileSync(paths.layer(language), "utf8")) as Layer;
    const source = readFileSync(paths.source(language), "utf8");
    const data = JSON.parse(/hyphenator\((\{.*\})\)/u.exec(source)![1]!) as PatternSet;
    const hyphenate = ({ fr: frHyphenate } as Readonly<Record<string, (word: string) => readonly number[]>>)[language]!;
    // The TeX set of fr has no exceptions, so the set with no exceptions is the pinned set.
    const pinned = hyphenator({ ...data, exceptions: "" });
    const offsets = (text: string): number[] => parseWords(text)[0]!.places.slice();

    it(`${language}: the module holds each entry of the layer as an exception`, () => {
      expect(data.exceptions).toBe(layer.entries.map((entry) => entry.hyphens).join(" "));
      for (const entry of layer.entries) expect(hyphenate(entry.word)).toEqual(offsets(entry.hyphens));
    });

    it(`${language}: each entry corrects a defect of the pinned set, so the layer flips the result of the word`, () => {
      const names = new Set(rulesOf(rules).map((rule) => rule.name));
      for (const entry of layer.entries) {
        const word = parseWords(entry.syllables)[0]!;
        expect(entry.rules.length).toBeGreaterThan(0);
        for (const name of entry.rules) {
          expect(names.has(name)).toBe(true);
          const rule = rulesOf(rules).find((each) => each.name === name)!;
          expect(rule.defects(word, entry.phonetic, pinned(entry.word)).length).toBeGreaterThan(0);
          expect(rule.defects(word, entry.phonetic, hyphenate(entry.word))).toEqual([]);
        }
      }
      if (language === "fr") {
        expect(pinned("stagnent")).toEqual([4]);
        expect(hyphenate("stagnent")).toEqual([]);
      }
    });

    it(`${language}: each entry keeps its evidence from the reference list`, () => {
      expect(layer).toMatchObject({ schema: "typeset-hyphen-layer/1", language, list: "Lexique 3.83" });
      const sorted = layer.entries.map((entry) => entry.word);
      expect(sorted).toEqual([...sorted].sort());
      for (const entry of layer.entries) {
        expect(entry.syllables.replaceAll("-", "")).toBe(entry.word);
        expect(entry.phonetic.length).toBeGreaterThan(0);
        expect(entry.hyphens.replaceAll("-", "")).toBe(entry.word);
      }
    });
  }
});
