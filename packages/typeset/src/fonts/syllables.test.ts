import { random as createRandom, type Random } from "@mark1russell7/rigor-generators";
import { generateCorpus } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { indicLetters, letterSyllables } from "./indic.ts";

// The search of typeset 0.6 (main 7d0540f), word for word: a regular expression of each rule, tried at each end from the
// longest end. It is quadratic, and the machine replaces it. This test keeps the two equal.
const c = "[cR]";
const n = "(?:w?r)?(?:nn?)?";
const z = "[wj]";
const reph = "(?:Rh|f)";
const sm = "[st]";
const cn = `${c}j?${n}`;
const matraGroup = `${z}*(?:m|${sm}?q)n?h?`;
const syllableTail = `(?:${z}?${sm}${sm}?w?)?a*`;
const halantGroup = `(?:${z}?h(?:jn?)?)`;
const finalHalantGroup = `(?:${halantGroup}|hw)`;
const complexSyllableTail = `(?:${halantGroup}${cn})*k?(?:${finalHalantGroup}|(?:${matraGroup})*)${syllableTail}`;
const machine: readonly (readonly [RegExp, number])[] = (
  [
    [`[fS]?${cn}${complexSyllableTail}`, 0],
    [`${reph}?v${n}(?:j|${complexSyllableTail})`, 1],
    [`(?:[fS]?p|${reph}?d)${n}${complexSyllableTail}`, 2],
    [`yn?${syllableTail}`, 3],
    ["t", 5],
    [`${reph}?${n}${complexSyllableTail}`, 4],
    ["[^]", 5],
  ] as const
).map(([rule, type]) => [new RegExp(`^(?:${rule})$`), type] as const);

function regexSyllables(text: string): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf("x", at + 1);
    let end = next < 0 ? text.length : next;
    let type = 5;
    for (; end > at; end--) {
      const found = machine.find(([rule]) => rule.test(text.slice(at, end)));
      if (found !== undefined) {
        type = found[1];
        break;
      }
    }
    if (end === at) end = at + 1;
    out.push([end - at, type]);
    at = end;
  }
  return out;
}

/** All category letters, and a second alphabet with more of the letters of long consonant syllables. */
const alphabets = ["xcvnhwjmsapdrqfRkySt", "cccRhhhjwmmnnqsSfvra"];

function randomLetters(random: Random): string {
  const alphabet = alphabets[random.below(alphabets.length)]!;
  return Array.from({ length: random.below(40) }, () => alphabet[random.below(alphabet.length)]!).join("");
}

describe("the linear syllable search", () => {
  it("gives the syllables of the regular expressions on 10,000 random strings of category letters", () => {
    const random = createRandom(16);
    for (let trial = 0; trial < 10_000; trial++) {
      const text = randomLetters(random);
      expect(letterSyllables(text), `seed ${random.seed}, trial ${trial}, text ${text}`).toEqual(regexSyllables(text));
    }
  });

  it("gives the syllables of the regular expressions on each Devanagari text of the corpus", () => {
    const samples = generateCorpus({ seed: 1, perCell: 5, scripts: ["devanagari"] });
    expect(samples.length).toBe(20);
    for (const sample of samples) {
      const text = indicLetters(sample.text);
      expect(letterSyllables(text), sample.id).toEqual(regexSyllables(text));
    }
  });

  it("divides a word of 2000 code points with no break into 1000 syllables", () => {
    // The bench gates the time of this word: a test of time is not reliable on a shared machine.
    expect(letterSyllables(indicLetters("कि".repeat(1000))).length).toBe(1000);
  });
});
