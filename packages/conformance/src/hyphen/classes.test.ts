import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hyphenate as frHyphenate } from "@mark1russell7/typeset/hyphen/fr";
import { hyphenator, type PatternSet } from "@mark1russell7/typeset/hyphen";
import { describe, expect, it } from "vitest";
import { classReport, countDefects, gnDigraphConflicts, gnDigraphSplits, muteEDefects, muteEPlace, parseForms, referenceRules, restTarget, rulesOf, type ReferenceClass, type ReferenceRule } from "./classes.ts";
import { hyphenPaths, type MissRecord } from "./gate.ts";
import { countMisses, coveredPlaces, parseWords, scoreWords, share } from "./words.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const paths = hyphenPaths(root);
const missRecord = JSON.parse(readFileSync(paths.misses, "utf8")) as MissRecord;

/** This function gives the place of the class in a word with hyphens at the places of the list. */
const placeOf = (entry: string, phonetic: readonly string[] = []): number | undefined => muteEPlace(parseWords(entry)[0]!, phonetic);

describe("muteEPlace", () => {
  it("puts the last place in the class when the last syllable is an onset and a mute e, es or ent", () => {
    expect(placeOf("a-che-mi-ne")).toBe(6);
    expect(placeOf("a-bor-da-bles")).toBe(6);
    expect(placeOf("a-bais-sent", ["abEs"])).toBe(5);
    expect(placeOf("lon-gue")).toBe(3);
    expect(placeOf("ban-ques")).toBe(3);
  });

  it("keeps out a word where the e is not mute", () => {
    expect(placeOf("né")).toBeUndefined();
    expect(placeOf("ca-fé")).toBeUndefined();
    expect(placeOf("an-née")).toBeUndefined();
    expect(placeOf("a-dap-tée")).toBeUndefined();
    expect(placeOf("ca-fés")).toBeUndefined();
  });

  it("keeps out a last syllable with another vowel, or with no onset", () => {
    expect(placeOf("a-ca-dé-mie")).toBeUndefined();
    expect(placeOf("a-bu-saient", ["abyzE"])).toBeUndefined();
    expect(placeOf("cré-e")).toBeUndefined();
    expect(placeOf("pa-ye")).toBeUndefined();
    expect(placeOf("a-gui-chant")).toBeUndefined();
  });

  it("keeps out ent when a phonetic form of the word ends with the vowel @ or with nt, or when the word has no form", () => {
    expect(placeOf("mo-ment", ["mOm@"])).toBeUndefined();
    expect(placeOf("cou-vent", ["kuv", "kuv@"])).toBeUndefined();
    expect(placeOf("cou-vent", ["kuv"])).toBe(3);
    expect(placeOf("a-bais-sent")).toBeUndefined();
    expect(placeOf("es-ta-bli-sh-ment", ["EstabliSmEnt"])).toBeUndefined();
    expect(placeOf("res-tent", ["REst"])).toBe(3);
  });
});

describe("parseForms", () => {
  it("reads a word and its phonetic forms on each line", () => {
    const forms = parseForms("abaissent abEs\r\ncouvent kuv kuv@\n\n");
    expect([...forms]).toEqual([
      ["abaissent", ["abEs"]],
      ["couvent", ["kuv", "kuv@"]],
    ]);
  });
});

describe("muteEDefects", () => {
  it("gives each hyphen at or after the place of the class", () => {
    const [word] = parseWords("s-tag-nent");
    expect(muteEDefects(word!, ["stagn"], [4])).toEqual([4]);
    expect(muteEDefects(word!, ["stagn"], [1])).toEqual([]);
    expect(muteEDefects(word!, ["stagn@"], [4])).toEqual([]);
  });
});

describe("the rule gn-digraph", () => {
  it("counts a split of the digraph gn as a defect only when the list does not have the place", () => {
    const [gagner] = parseWords("ga-gner");
    expect(gnDigraphSplits(gagner!, ["gaNe"], [3])).toEqual([3]);
    expect(gnDigraphConflicts(gagner!, ["gaNe"], [3])).toEqual([]);
    expect(gnDigraphSplits(gagner!, ["gaNe"], [2])).toEqual([]);
  });

  it("counts a split at a place of the list as a conflict, not as a defect", () => {
    const [ignition] = parseWords("ig-ni-tion");
    expect(gnDigraphSplits(ignition!, ["iNisj§"], [2])).toEqual([]);
    expect(gnDigraphConflicts(ignition!, ["iNisj§"], [2])).toEqual([2]);
  });

  it("does not apply when no phonetic form has the sound N", () => {
    const [stagner] = parseWords("s-tag-ner");
    expect(gnDigraphSplits(stagner!, ["stagne"], [4])).toEqual([]);
    expect(gnDigraphConflicts(stagner!, ["stagne"], [4])).toEqual([]);
  });
});

/** This function gives a class of the test with a place that a hook gives. */
const testClass = (place: ReferenceClass["place"]): ReferenceClass => ({ name: "test", place, defects: () => [] });

describe("classReport", () => {
  it("leaves out the places of the class and explains the misses", () => {
    const words = parseWords("ta-ble cha-pi-tre fa-ble-ment");
    // The set finds cha-pi and fa-ble, and it misses ta-ble, pi-tre and ble-ment. The word fablement is not in the class.
    const hyphenate = (word: string): readonly number[] => (word === "chapitre" ? [3] : word === "fablement" ? [2] : []);
    const reference = testClass((word) => (word.word === "fablement" ? undefined : word.places.at(-1)));
    const report = classReport(words, hyphenate, () => [], 2, 2, reference, () => []);
    const full = scoreWords(words, hyphenate, 2, 2);
    // The places within the limits: ta-ble 2, cha-pi-tre 3 and 5, fa-ble-ment 2 and 5. The set finds 3 and 2 of fablement.
    expect(full).toMatchObject({ listed: 5, both: 2 });
    expect(report).toMatchObject({ found: share(2, 5), leftOut: 2, foundRest: share(2, 3), target: restTarget, explained: 2 });
    expect(report.rest).toMatchObject({ misses: 1, other: 1 });
  });

  it("does not count a place of the class outside the limits", () => {
    const report = classReport(parseWords("a-ble"), () => [], () => [], 2, 2, testClass((word) => word.places.at(-1)), () => []);
    expect(report).toMatchObject({ leftOut: 0, explained: 0 });
  });
});

describe("countDefects", () => {
  it("counts the defects with the layer and with the pinned set alone, and lists each word with a conflict", () => {
    const words = parseWords("ga-gner ig-ni-tion");
    const rule: ReferenceRule = { name: "gn-digraph", defects: gnDigraphSplits, conflicts: gnDigraphConflicts };
    const phonetic = (word: string): readonly string[] => (word === "gagner" ? ["gaNe"] : ["iNisj§"]);
    const pinned = (word: string): readonly number[] => (word === "gagner" ? [3] : [2]);
    const layered = (): readonly number[] => [2];
    expect(countDefects(words, [rule], layered, pinned, phonetic)).toEqual({ "gn-digraph": { defects: 0, pinnedDefects: 1, conflicts: ["ignition"] } });
  });
});

describe("the reference rules of each language on its word list", () => {
  for (const [language, rules] of Object.entries(referenceRules)) {
    const source = readFileSync(paths.source(language), "utf8");
    const data = JSON.parse(/hyphenator\((\{.*\})\)/u.exec(source)![1]!) as PatternSet;
    const words = parseWords(readFileSync(paths.words(language), "utf8"));
    const hyphenate = ({ fr: frHyphenate } as Readonly<Record<string, (word: string) => readonly number[]>>)[language];
    const forms = parseForms(readFileSync(paths.forms(rules.forms), "utf8"));
    const phoneticOf = (word: string): readonly string[] => forms.get(word) ?? [];
    const record = missRecord.languages[language]!;

    for (const reference of rules.classes) {
      it(`${language}: the record holds the report of the class ${reference.name}`, () => {
        expect(hyphenate).toBeDefined();
        const report = classReport(words, hyphenate!, coveredPlaces(data), data.left, data.right, reference, phoneticOf);
        const misses = countMisses(words, hyphenate!, coveredPlaces(data), data.left, data.right);
        expect(report.explained + report.rest.misses).toBe(misses.shift + misses.silent + misses.other);
        expect(record.classes[reference.name]).toEqual(report);
      });
    }

    it(`${language}: the file of forms has each word of the sample that the rules read, each with a phonetic form`, () => {
      expect([...forms.keys()]).toEqual(words.map((word) => word.word).filter(rules.reads));
      for (const phonetic of forms.values()) expect(phonetic.length).toBeGreaterThan(0);
    });

    it(`${language}: the record holds the defects and the conflicts of each rule on the sample, and the module has no defect`, () => {
      const sample = record.reference!.sample;
      expect(Object.keys(sample)).toEqual(rulesOf(rules).map((rule) => rule.name));
      for (const rule of rulesOf(rules)) {
        let defects = 0;
        const conflicts: string[] = [];
        for (const word of words) {
          const given = hyphenate!(word.word);
          defects += rule.defects(word, phoneticOf(word.word), given).length;
          if ((rule.conflicts?.(word, phoneticOf(word.word), given) ?? []).length > 0) conflicts.push(word.word);
        }
        expect(sample[rule.name]).toMatchObject({ defects, conflicts });
        expect(defects).toBe(0);
        expect(record.reference!.full.rules[rule.name]!.defects).toBe(0);
      }
    });

    it(`${language}: the conflicts of each rule on the full list are within the limit of the rule`, () => {
      for (const rule of rulesOf(rules)) {
        if (rule.conflictLimit === undefined) continue;
        expect(record.reference!.full.rules[rule.name]!.conflicts.length).toBeLessThanOrEqual(rule.conflictLimit);
      }
    });

    it(`${language}: the pinned set alone has the defects that the record gives on the sample`, () => {
      // The TeX set of fr has no exceptions, so the set with no exceptions is the pinned set.
      const pinned = hyphenator({ ...data, exceptions: "" });
      for (const rule of rulesOf(rules)) {
        const defects = words.reduce((sum, word) => sum + rule.defects(word, phoneticOf(word.word), pinned(word.word)).length, 0);
        expect(record.reference!.sample[rule.name]!.pinnedDefects).toBe(defects);
      }
    });
  }
});
