import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { glyphAdvances, indicSyllables, readFont } from "./index.ts";

describe("the Indic syllables", () => {
  it("divides a word into consonant syllables", () => {
    // na, ma, and sa virama ta e: a halant joins two consonants in one syllable
    expect(indicSyllables("नमस्ते")).toEqual([
      { text: "न", type: "consonant" },
      { text: "म", type: "consonant" },
      { text: "स्ते", type: "consonant" },
    ]);
  });

  it("gives the vowel, standalone, symbol, broken and other syllables", () => {
    expect(indicSyllables("अर्थ")).toEqual([
      { text: "अ", type: "vowel" },
      { text: "र्थ", type: "consonant" },
    ]);
    expect(indicSyllables("१२")).toEqual([
      { text: "१", type: "standalone" },
      { text: "२", type: "standalone" },
    ]);
    expect(indicSyllables("ऽ")).toEqual([{ text: "ऽ", type: "symbol" }]);
    expect(indicSyllables("ि")).toEqual([{ text: "ि", type: "broken" }]);
    expect(indicSyllables("a")).toEqual([{ text: "a", type: "non-indic" }]);
  });
});

// The test needs the pinned file `noto-sans-devanagari.ttf` in the folder `TYPESET_FONTS`. The restore command of `@typeset/pinned` gets it.
const fontFile = join(process.env["TYPESET_FONTS"] ?? "", "noto-sans-devanagari.ttf");
const present = process.env["TYPESET_FONTS"] !== undefined && existsSync(fontFile);

describe.skipIf(!present)("the Indic shaper with Noto Sans Devanagari", () => {
  const font = present ? readFont(readFileSync(fontFile), { instance: { wght: 400, wdth: 100 } }) : undefined;
  // The glyph ids of HarfBuzz 11 for the same text, with the names of the glyphs in the comments
  const glyphs = (codePoints: readonly number[], indic = true) => glyphAdvances(font!, String.fromCodePoint(...codePoints), { script: "deva", shaping: "canvas", indic }).glyphs;

  it("puts a dotted circle before a sign with no base", () => {
    // uni093F uni25CC: the pre-base matra then goes before the dotted circle
    expect(glyphs([0x93f])).toEqual([32, 789]);
    // uni25CC uni094D uni0915: a virama at the start of a word
    expect(glyphs([0x94d, 0x915])).toEqual([789, 103, 56]);
    // uni0905 uni25CC uni093E: the vowel constraint stops a sequence that looks like the letter aa
    expect(glyphs([0x905, 0x93e])).toEqual([5, 789, 31]);
    // uni0906 uni25CC uni0948: Chrome gives this result, and harfbuzzjs does not because its build leaves out the rule (T1f)
    expect(glyphs([0x906, 0x948])).toEqual([6, 789, 41]);
  });

  it("makes the reph and moves it after the base", () => {
    // uni0915 uni0930094D
    expect(glyphs([0x930, 0x94d, 0x915])).toEqual([56, 506]);
    // uni0930 uni094D: a ra and a virama with no consonant after them make no reph
    expect(glyphs([0x930, 0x94d])).toEqual([82, 103]);
    // uni093F0930094D.04 uni0915 NullMark: the reph and the pre-base matra make a ligature
    expect(glyphs([0x930, 0x94d, 0x915, 0x93f])).toEqual([590, 56, 785]);
  });

  it("moves the pre-base matra before the syllable", () => {
    // uni093F.04 uni0915
    expect(glyphs([0x915, 0x93f])).toEqual([545, 56]);
    // uni093F.12 uni0938094D uni0915: the matra goes before the half form
    expect(glyphs([0x938, 0x94d, 0x915, 0x93f])).toEqual([553, 256, 56]);
    // uni093F.10 uni0915094D0937: the matra goes before the conjunct
    expect(glyphs([0x915, 0x94d, 0x937, 0x93f])).toEqual([551, 90]);
    // Without the Indic shaper, the matra stays after the consonant
    expect(glyphs([0x915, 0x93f], false)).not.toEqual([545, 56]);
  });

  it("makes the half forms of the consonants before the base", () => {
    // uni0938094D uni0924
    expect(glyphs([0x938, 0x94d, 0x924])).toEqual([256, 71]);
    // uni0928094D uni0926
    expect(glyphs([0x928, 0x94d, 0x926])).toEqual([245, 73]);
    // uni0915 uni094D: a virama at the end of a word makes no half form
    expect(glyphs([0x915, 0x94d])).toEqual([56, 103]);
  });

  it("makes the ligatures of ra and the vowel signs u and uu", () => {
    // uni09300941 and uni09300942
    expect(glyphs([0x930, 0x941])).toEqual([493]);
    expect(glyphs([0x930, 0x942])).toEqual([494]);
  });
});
