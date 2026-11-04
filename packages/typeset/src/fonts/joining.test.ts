import { describe, expect, it } from "vitest";
import { Reader } from "./binary.ts";
import { defaultFeatures, glyphAdvances, joiningForms, joiningStages, measureWidth, type Font } from "./index.ts";
import { readSubstitutions, type GlyphFilter } from "./substitution.ts";

const forms = (text: string) => joiningForms([...text].map((character) => character.codePointAt(0)!));

describe("the joining forms", () => {
  it("gives the forms of dual-joining letters", () => {
    // beh, yeh, teh
    expect(forms("بيت")).toEqual(["init", "medi", "fina"]);
    expect(forms("بت")).toEqual(["init", "fina"]);
    expect(forms("ب")).toEqual(["isol"]);
  });

  it("does not join after a right-joining letter", () => {
    // dal, alef, reh: each joins only to the letter before it
    expect(forms("دار")).toEqual(["isol", "isol", "isol"]);
    // beh, alef, beh
    expect(forms("باب")).toEqual(["init", "fina", "isol"]);
  });

  it("skips the marks and stops at a letter that does not join", () => {
    // beh, fatha, teh: the mark is transparent
    expect(forms("بَت")).toEqual(["init", undefined, "fina"]);
    // beh, hamza, beh: the hamza does not join
    expect(forms("بءب")).toEqual(["isol", undefined, "isol"]);
    // A space and a Latin letter do not join
    expect(forms("ب ب")).toEqual(["isol", undefined, "isol"]);
  });

  it("joins through a tatweel and a zero width joiner, and not through a zero width non-joiner", () => {
    expect(forms("ـبـ")).toEqual(["init", "medi", "fina"]);
    expect(forms("ب‍")).toEqual(["init", "fina"]);
    expect(forms("ب‌ب")).toEqual(["isol", undefined, "isol"]);
  });

  it("gives the Syriac forms of alaph after dalath and after other letters", () => {
    // beth, alaph: the alaph is final
    expect(forms("ܒܐ")).toEqual(["init", "fina"]);
    // dalath, alaph: fin3
    expect(forms("ܕܐ")).toEqual(["isol", "fin3"]);
    // waw, alaph: fin2
    expect(forms("ܘܐ")).toEqual(["isol", "fin2"]);
    // beth, alaph, beth: an alaph between two letters is med2
    expect(forms("ܒܐܒ")).toEqual(["init", "med2", "isol"]);
  });
});

describe("the stages of the Arabic shaper", () => {
  it("puts ccmp and locl first, then each form alone, then rlig, then calt, then the other features", () => {
    expect(joiningStages(defaultFeatures, false)).toEqual([
      { features: ["ccmp", "locl"] },
      ...["isol", "fina", "fin2", "fin3", "medi", "med2", "init"].map((form) => ({ features: [form], form })),
      { features: ["rlig"] },
      { features: ["calt"] },
      { features: ["liga", "clig", "rclt"] },
    ]);
  });

  it("puts calt with the other features when the font has rclt, and leaves out the empty stages", () => {
    const stages = joiningStages(["liga", "calt", "rclt"], true);
    expect(stages.at(-1)).toEqual({ features: ["liga", "calt", "rclt"] });
    expect(stages.map((stage) => stage.features[0])).toEqual(["isol", "fina", "fin2", "fin3", "medi", "med2", "init", "liga"]);
  });
});

/** This function writes 16-bit words and 4-character tags as bytes. */
function bytesOf(...items: (number | string)[]): number[] {
  const out: number[] = [];
  for (const item of items) {
    if (typeof item === "string") for (const character of item) out.push(character.charCodeAt(0));
    else out.push((item >> 8) & 0xff, item & 0xff);
  }
  return out;
}

/**
 * This function builds a GSUB table for the script `arab`. The feature `init` changes the glyph 1 to 2. The feature
 * `fina` changes the glyph 1 to the glyphs 3 and 4. The feature `liga` makes the glyph 5 from the glyphs 2 and 3.
 */
function arabicGsub(): Reader {
  const scriptList = bytesOf(1, "arab", 8, 4, 0, 0, 0xffff, 3, 0, 1, 2);
  const tags = ["init", "fina", "liga"];
  const featureList = bytesOf(tags.length, ...tags.flatMap((tag, i) => [tag, 2 + tags.length * 6 + i * 6]), ...tags.flatMap((_, i) => [0, 1, i]));
  const subtables = [
    [1, bytesOf(2, 8, 1, 2, 1, 1, 1)],
    [2, bytesOf(1, 14, 1, 8, 2, 3, 4, 1, 1, 1)],
    [4, bytesOf(1, 18, 1, 8, 1, 4, 5, 2, 3, 1, 1, 2)],
  ] as const;
  const lookups = subtables.map(([type, subtable]) => [...bytesOf(type, 0, 1, 8), ...subtable]);
  const lookupList = bytesOf(lookups.length);
  let at = 2 + lookups.length * 2;
  for (const lookup of lookups) {
    lookupList.push(...bytesOf(at));
    at += lookup.length;
  }
  for (const lookup of lookups) lookupList.push(...lookup);
  const s = 10;
  const f = s + scriptList.length;
  const l = f + featureList.length;
  return new Reader(Uint8Array.from([...bytesOf(1, 0, s, f, l), ...scriptList, ...featureList, ...lookupList]));
}

const filter: GlyphFilter = { glyphClass: () => 1, markAttachClass: () => 0, inMarkSet: () => false };

describe("the feature masks of GSUB", () => {
  it("starts a lookup only at a glyph of the mask, and keeps the masks in step with the glyphs", () => {
    const [fina] = readSubstitutions(arabicGsub(), "arab", ["fina"], filter);
    const glyphs = [1, 1];
    const masks = [1, 2];
    fina!.apply(glyphs, masks, 2);
    expect(glyphs).toEqual([1, 3, 4]);
    expect(masks).toEqual([1, 2, 2]);
    const all = [1, 1];
    fina!.apply(all);
    expect(all).toEqual([3, 4, 3, 4]);
  });
});

describe("the joining in glyphAdvances", () => {
  const gsub = arabicGsub();
  // The glyphs: 0 .notdef, 1 beh, 2 initial beh, 3 and 4 the parts of the final beh, 5 a ligature, 6 a space
  const advances = [500, 600, 300, 250, 100, 450, 200];
  const font: Font = {
    epoch: "test",
    unitsPerEm: 1000,
    axes: [],
    instance: {},
    coordinates: [],
    advanceSource: "hmtx",
    numGlyphs: advances.length,
    hasPositioning: true,
    hasGlyphClasses: true,
    glyph: (codePoint) => (codePoint === 0x628 ? 1 : codePoint === 0x20 ? 6 : 0),
    advance: (glyph) => advances[glyph] ?? 0,
    glyphClass: () => 1,
    kerning: () => [],
    substitutions: (script, features) => readSubstitutions(gsub, script, features, filter),
    at: () => font,
  };

  it("applies each form only to its letters, and then the other features to all the glyphs", () => {
    expect(glyphAdvances(font, "بب", { script: "arab" }).glyphs).toEqual([5, 4]);
    expect(measureWidth(font, "بب", 1000, { script: "arab" })).toBe(450 + 100);
    expect(glyphAdvances(font, "ببب ب", { script: "arab", shaping: "canvas" }).glyphs).toEqual([2, 1, 3, 4, 6, 1]);
  });

  it("keeps the old shaping with the option joining false and for a script that does not join", () => {
    expect(glyphAdvances(font, "بب", { script: "arab", joining: false }).glyphs).toEqual([1, 1]);
    expect(glyphAdvances(font, "بب", { script: "latn" }).glyphs).toEqual([1, 1]);
  });
});
