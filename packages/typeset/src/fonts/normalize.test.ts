import { describe, expect, it } from "vitest";
import { normalForms, normalizeCodePoints } from "./normalize.ts";

const codes = (text: string): number[] => Array.from(text, (character) => character.codePointAt(0)!);
const hex = (values: readonly number[]): string => values.map((value) => value.toString(16)).join(" ");
const fontWith = (text: string) => {
  const set = new Set(codes(text));
  return (codePoint: number): boolean => set.has(codePoint);
};
const plain = (text: string, font: string): string => hex(normalizeCodePoints(codes(text), { hasGlyph: fontWith(font), shortCircuit: true }));

describe("normalizeCodePoints", () => {
  it("composes a base and a mark when the font has the composite", () => {
    expect(plain("ư", "ưư")).toBe("1b0");
    expect(plain("ư", "ư")).toBe("75 31b");
  });

  it("decomposes a base before its mark, sorts the marks and composes the first mark that fits", () => {
    expect(plain("Ư̆", "Ư̆ŬƯ")).toBe("1af 306");
  });

  it("keeps a character with a glyph when no mark is near it", () => {
    expect(plain("éa", "ééa")).toBe("e9 61");
  });

  it("decomposes a character with no glyph when the font has its parts", () => {
    expect(plain("é", "é")).toBe("65 301");
  });

  it("decomposes each character without the short circuit", () => {
    expect(hex(normalizeCodePoints(codes("é"), { hasGlyph: fontWith("éé"), shortCircuit: false }))).toBe("65 301");
  });

  it("keeps a character of the set kept", () => {
    expect(hex(normalizeCodePoints(codes("ऱ"), { hasGlyph: fontWith("ऱऱ"), shortCircuit: false, kept: new Set([0x931]) }))).toBe("931");
  });

  it("does not move a mark over a base that keeps its form", () => {
    expect(plain("ẹ́", "ẹ́")).toBe("e9 323");
  });

  it("blocks a composition after a mark with the same class", () => {
    expect(plain("ā́", "ā́āḿ")).toBe("101 301");
    expect(plain("ā́", "ā́á")).toBe("61 304 301");
  });

  it("does not block a composition after a mark with a smaller class", () => {
    expect(plain("ạ́", "ạ́á")).toBe("e1 323");
  });

  it("stops at a mark with the class 0", () => {
    expect(plain("aः́", "aः́á")).toBe("61 903 301");
  });

  it("puts the shadda before a vowel, as HarfBuzz does", () => {
    expect(plain("بَّ", "بَّ")).toBe("628 651 64e");
  });
});

describe("normalForms", () => {
  it("gives each part and each composite of a set", () => {
    const forms = normalForms(new Set(codes("Ŭư")), fontWith("Uư̆ŬƯư"));
    expect(hex([...forms.parts.get(0x16c)!])).toBe("55 306");
    expect(forms.composites.get(0x75)).toEqual([0x1b0]);
    expect(forms.composites.get(0x55)).toEqual(expect.arrayContaining([0x16c, 0x1af]));
    expect(forms.codePoints.has(0x1af)).toBe(true);
  });

  it("gives no composite when the font has no glyph for it", () => {
    expect(normalForms(new Set(codes("ư")), fontWith("ư")).composites.size).toBe(0);
  });
});
