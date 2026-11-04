import { describe, expect, it } from "vitest";
import { greedy, knuthPlass, linesOf, paragraphOf, worstRatio } from "../breaking.ts";
import { hyphenator, type PatternSet } from "../hyphen.ts";
import { hyphenate as german, source as germanSource } from "./de.ts";
import { hyphenate as english, source as englishSource } from "./en-us.ts";
import { hyphenate as french, source as frenchSource } from "./fr.ts";

/** This function shows the hyphen places of a word. */
const marked = (word: string, hook: (word: string) => readonly number[]): string => {
  let text = "";
  let start = 0;
  for (const offset of hook(word)) {
    text += `${word.slice(start, offset)}-`;
    start = offset;
  }
  return text + word.slice(start);
};

describe("the matcher of Liang", () => {
  // The example of Liang: the digits of each match come to the word, and the largest digit wins at each place.
  const set: PatternSet = { patterns: "1na n2at a1b .ab4 c1d4e", exceptions: "ta-ble", left: 1, right: 1 };

  it("takes the largest digit at each place, and an odd digit is a place", () => {
    expect(hyphenator({ ...set, patterns: "1b" })("abc")).toEqual([1]);
    expect(hyphenator({ ...set, patterns: "2b" })("abc")).toEqual([]);
    expect(hyphenator({ ...set, patterns: "1b ab3" })("abc")).toEqual([1, 2]);
    expect(hyphenator({ ...set, patterns: "1b a2b" })("abc")).toEqual([]);
    expect(hyphenator({ ...set, patterns: "a2b 1b" })("abc")).toEqual([]);
    expect(hyphenator({ ...set, patterns: "2b a3b" })("abc")).toEqual([1]);
    expect(hyphenator({ ...set, patterns: "3b a2b" })("abc")).toEqual([1]);
  });

  it("matches a dot only at the start or at the end of a word", () => {
    expect(hyphenator({ ...set, patterns: ".a1" })("aba")).toEqual([1]);
    expect(hyphenator({ ...set, patterns: "1a." })("aba")).toEqual([2]);
    expect(hyphenator({ ...set, patterns: "b1a." })("abab")).toEqual([]);
  });

  it("keeps the left and the right limits", () => {
    const patterns = "a1 b1 c1 d1 e1";
    expect(hyphenator({ ...set, patterns })("abcdef")).toEqual([1, 2, 3, 4, 5]);
    expect(hyphenator({ ...set, patterns, left: 2, right: 3 })("abcdef")).toEqual([2, 3]);
  });

  it("gives the places of an exception and no others", () => {
    expect(hyphenator({ ...set, patterns: "a1" })("table")).toEqual([2]);
    expect(hyphenator({ ...set, patterns: "a1" })("Table,")).toEqual([2]);
  });

  it("gives offsets in the word as the hook gets it", () => {
    const hook = hyphenator({ ...set, patterns: "a1" });
    expect(hook("(baba),")).toEqual([3]);
    expect(hook("BABA")).toEqual([2]);
    expect(hook("baba-baba")).toEqual([2, 7]);
    expect(hook("")).toEqual([]);
    expect(hook("1234")).toEqual([]);
  });

  it("reads a typographic apostrophe as the plain apostrophe of the patterns", () => {
    const hook = hyphenator({ ...set, patterns: "l'a1" });
    expect(hook("l'aba")).toEqual([3]);
    expect(hook("l’aba")).toEqual([3]);
  });

  it("keeps a run whole when its lowercase form has another length", () => {
    const hook = hyphenator({ ...set, patterns: "a1" });
    expect("İbaba".toLowerCase()).toHaveLength(6);
    expect(hook("İbaba")).toEqual([]);
  });
});

describe("the language sets", () => {
  it("hyphenates English words", () => {
    expect(marked("hyphenation", english)).toBe("hy-phen-ation");
    expect(marked("Typesetting", english)).toBe("Type-set-ting");
    expect(marked("associate", english)).toBe("as-so-ciate");
    expect(marked("project", english)).toBe("project");
  });

  it("hyphenates German words", () => {
    expect(marked("Wörterbuch", german)).toBe("Wör-ter-buch");
    expect(marked("Donaudampfschifffahrt", german)).toBe("Do-nau-dampf-schiff-fahrt");
  });

  it("hyphenates French words, with an apostrophe of each form", () => {
    expect(marked("hyphénation", french)).toBe("hy-phé-na-tion");
    expect(marked("l'ouverture", french)).toBe("l'ou-ver-ture");
    expect(marked("l’ouverture", french)).toBe("l’ou-ver-ture");
  });

  it("names the pinned commit, the license and the result of each set", () => {
    for (const source of [englishSource, germanSource, frenchSource]) {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(source.license).not.toBe("");
      expect(source.words.confirmed).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("fits the hook of paragraphOf, and the hyphens help the justified edge", () => {
    const text = "The hyphenation patterns give a typesetting program more places for a line break in justified paragraphs of international documentation.";
    const widthOf = (part: string): number => 8 * [...part].length;
    const options = { widthOf, stretch: 4, shrink: 8 / 3 };
    const plain = paragraphOf(text, options);
    const hyphens = paragraphOf(text, { ...options, hyphenate: english });
    const worst = (paragraph: typeof plain): number => worstRatio(paragraph, linesOf(paragraph, knuthPlass.breaks(paragraph, 240)), 240);
    expect(hyphens.items.length).toBeGreaterThan(plain.items.length);
    expect(linesOf(hyphens, greedy.breaks(hyphens, 240)).map((line) => line.text).join("").replaceAll(/[- ]/gu, "")).toBe(text.replaceAll(" ", ""));
    expect(worst(hyphens)).toBeLessThan(worst(plain));
  });
});
