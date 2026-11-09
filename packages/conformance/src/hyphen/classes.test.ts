import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hyphenate as frHyphenate } from "@mark1russell7/typeset/hyphen/fr";
import type { PatternSet } from "@mark1russell7/typeset/hyphen";
import { describe, expect, it } from "vitest";
import { classReport, muteEPlace, parseForms, referenceClasses, restTarget } from "./classes.ts";
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

  it("keeps out ent when a phonetic form of the word ends with the vowel @, or when the word has no form", () => {
    expect(placeOf("mo-ment", ["mOm@"])).toBeUndefined();
    expect(placeOf("cou-vent", ["kuv", "kuv@"])).toBeUndefined();
    expect(placeOf("cou-vent", ["kuv"])).toBe(3);
    expect(placeOf("a-bais-sent")).toBeUndefined();
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

describe("classReport", () => {
  it("leaves out the places of the class, counts the defects and explains the misses", () => {
    const words = parseWords("ta-ble cha-pi-tre fa-ble-ment");
    // The set finds cha-pi and fa-ble, and it misses ta-ble, pi-tre and ble-ment. The word fablement is not in the class.
    const hyphenate = (word: string): readonly number[] => (word === "chapitre" ? [3] : word === "fablement" ? [2] : []);
    const place = (word: { readonly word: string; readonly places: readonly number[] }): number | undefined => (word.word === "fablement" ? undefined : word.places.at(-1));
    const report = classReport(words, hyphenate, () => [], 2, 2, place);
    const full = scoreWords(words, hyphenate, 2, 2);
    // The places within the limits: ta-ble 2, cha-pi-tre 3 and 5, fa-ble-ment 2 and 5. The set finds 3 and 2 of fablement.
    expect(full).toMatchObject({ listed: 5, both: 2 });
    expect(report).toMatchObject({ found: share(2, 5), leftOut: 2, foundRest: share(2, 3), target: restTarget, defects: 0, explained: 2 });
    expect(report.rest).toMatchObject({ misses: 1, other: 1 });
    const defect = classReport(words, (word) => (word === "table" ? [2] : []), () => [], 2, 2, place);
    expect(defect.defects).toBe(1);
  });

  it("does not count a place of the class outside the limits", () => {
    const words = parseWords("a-ble");
    const report = classReport(words, () => [], () => [], 2, 2, (word) => word.places.at(-1));
    expect(report).toMatchObject({ leftOut: 0, explained: 0, defects: 0 });
  });
});

describe("the classes of each language on its word list", () => {
  for (const [language, classes] of Object.entries(referenceClasses)) {
    const source = readFileSync(paths.source(language), "utf8");
    const data = JSON.parse(/hyphenator\((\{.*\})\)/u.exec(source)![1]!) as PatternSet;
    const words = parseWords(readFileSync(paths.words(language), "utf8"));
    const hyphenate = ({ fr: frHyphenate } as Readonly<Record<string, (word: string) => readonly number[]>>)[language];

    for (const reference of classes) {
      it(`${language}: the record holds the report of the class ${reference.name}`, () => {
        expect(hyphenate).toBeDefined();
        const forms = parseForms(readFileSync(paths.forms(reference.forms), "utf8"));
        const report = classReport(words, hyphenate!, coveredPlaces(data), data.left, data.right, (word) => reference.place(word, forms.get(word.word) ?? []));
        const misses = countMisses(words, hyphenate!, coveredPlaces(data), data.left, data.right);
        expect(report.explained + report.rest.misses).toBe(misses.shift + misses.silent + misses.other);
        expect(missRecord.languages[language]!.classes[reference.name]).toEqual(report);
      });

      it(`${language}: the file of forms of the class ${reference.name} has each word of the sample with the ending ent`, () => {
        const forms = parseForms(readFileSync(paths.forms(reference.forms), "utf8"));
        expect([...forms.keys()]).toEqual(words.map((word) => word.word).filter((word) => word.endsWith("ent")));
        for (const phonetic of forms.values()) expect(phonetic.length).toBeGreaterThan(0);
      });
    }
  }
});
