import { describe, expect, it } from "vitest";
import { compareSets, formHook, isHeldOut, levelAnswers, listedForms, patgenPatterns, ratesOf, sharedForms, splitForms, texExceptionForms, translateFile, websterEntries, wordCounts } from "./train.ts";

describe("the forms of a list", () => {
  it("removes each word with two different forms and sorts the rest", () => {
    expect(listedForms(["pre-sent", "ta-ble", "pres-ent", "ab-sinth", "ta-ble"])).toEqual({ forms: ["ab-sinth", "ta-ble"], conflicts: 1 });
  });
});

describe("the split of the forms", () => {
  const forms = Array.from({ length: 2000 }, (_, index) => `w${index.toString(36)}-ord`);

  it("puts each form in one half, by a hash of the word and the seed", () => {
    const { train, heldOut } = splitForms(forms, "seed");
    expect(train.length + heldOut.length).toBe(forms.length);
    expect(heldOut.every((form) => isHeldOut(form.replaceAll("-", ""), "seed"))).toBe(true);
    expect(train.some((form) => isHeldOut(form.replaceAll("-", ""), "seed"))).toBe(false);
  });

  it("gives two halves of near the same size", () => {
    const { heldOut } = splitForms(forms, "seed");
    expect(heldOut.length).toBeGreaterThan(900);
    expect(heldOut.length).toBeLessThan(1100);
  });

  it("does not depend on the order of the list", () => {
    expect([...splitForms([...forms].reverse(), "seed").heldOut].sort()).toEqual([...splitForms(forms, "seed").heldOut].sort());
  });

  it("gives other halves for another seed", () => {
    expect(splitForms(forms, "other").heldOut).not.toEqual(splitForms(forms, "seed").heldOut);
  });
});

describe("the files of patgen", () => {
  it("gives the limits and one line for each letter in the translate file", () => {
    expect(translateFile(["ba-c", "ab"], 2, 3)).toBe(" 2 3\n a A \n b B \n c C \n");
  });

  it("gives the answers of one level", () => {
    expect(levelAnswers({ lengths: [2, 5], good: 1, bad: 2, threshold: 20 }, 1)).toBe("1 1\n2 5\n1 2 20\nn\n");
  });

  it("reads the patterns of an output file", () => {
    expect(patgenPatterns(".ab1c\r\n\n  2bc \n")).toBe(".ab1c 2bc");
  });
});

describe("the comparison of two sets", () => {
  // The list: "table" with a place at 2 ("ta-ble"), "absinth" with a place at 2 ("ab-sinth").
  const forms = ["ta-ble", "ab-sinth"];
  const candidate = (word: string): number[] => (word === "table" ? [2] : [2, 4]);
  const baseline = (word: string): number[] => (word === "table" ? [] : [2]);

  it("counts the places of the list within the limits, and the places of each set", () => {
    expect(wordCounts(forms, candidate, baseline, 2, 3)).toEqual([
      { listed: 1, given: [1, 0], both: [1, 0] },
      { listed: 1, given: [2, 1], both: [1, 1] },
    ]);
    expect(wordCounts(["t-able"], candidate, baseline, 2, 3)).toEqual([{ listed: 0, given: [1, 0], both: [0, 0] }]);
  });

  it("gives the rates of each side", () => {
    const counts = wordCounts(forms, candidate, baseline, 2, 3);
    expect(ratesOf(counts, 0)).toEqual({ found: 1, confirmed: 0.6667, fHalf: 0.7143 });
    expect(ratesOf(counts, 1)).toEqual({ found: 0.5, confirmed: 1, fHalf: 0.8333 });
  });

  it("gives a seeded paired bootstrap interval of each gain", () => {
    const counts = wordCounts(forms, candidate, baseline, 2, 3);
    const result = compareSets(counts, { runs: 200, seed: "test" });
    expect(result.words).toBe(2);
    expect(result.foundGain.estimate).toBeCloseTo(0.5, 10);
    expect(result.confirmedGain.estimate).toBeCloseTo(-1 / 3, 10);
    expect(result.foundGain.low).toBeLessThanOrEqual(result.foundGain.estimate);
    expect(result.foundGain.high).toBeGreaterThanOrEqual(result.foundGain.estimate);
    expect(compareSets(counts, { runs: 200, seed: "test" })).toEqual(result);
  });
});

describe("the exceptions of a TeX file", () => {
  it("keeps the lowercase forms of the list and counts the others", () => {
    const text = "% a comment {x}\n\\hyphenation{\nab-sinth % note\nta-ble Eng-lish\nre-cord's\n}\nmore-text";
    expect(texExceptionForms(text)).toEqual({ forms: ["ab-sinth", "ta-ble"], skipped: 2 });
  });
});

describe("the entries of Webster 1913", () => {
  it("reads the marks of the syllables after each headword", () => {
    const text = 'ABACUS\r\nAb"a*cus, n. E. pl.\r\n\r\nABBREVIATION\r\nAb*bre`vi*a"tion, n. Etym\r\nPRESENT\r\npre*sent", v. t.\r\nO\'CLOCK\r\nO\'clock", adv.\r\nCAFE\r\nCa*fé", n.\r\nTABLE\r\nThe word is a table.\r\n';
    expect(websterEntries(text)).toEqual(["ab-a-cus", "ab-bre-vi-a-tion", "pre-sent"]);
  });
});

describe("the hook of a list", () => {
  it("gives the places of each form within the limits, and none for a word out of the list", () => {
    const hook = formHook(["ab-bre-vi-a-tion", "ta-ble"], 2, 3);
    expect(hook("abbreviation")).toEqual([2, 5, 7, 8]);
    expect(hook("table")).toEqual([2]);
    expect(hook("chair")).toEqual([]);
  });

  it("keeps the forms whose word is in the other list", () => {
    expect(sharedForms(["ta-ble", "chair", "ab-sinth"], ["tab-le", "absinth"])).toEqual(["ta-ble", "ab-sinth"]);
  });
});
