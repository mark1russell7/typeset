import { generateSample, type LengthClass } from "@typeset/corpus";
import { describe, expect, it } from "vitest";
import { complexBreaks, graphemes, lineBreaks, unicodeVersion, wordBreaks } from "../segmentation.ts";

const offsets = (text: string): readonly number[] => lineBreaks(text).map((place) => place.offset);
const parts = (text: string): readonly string[] => {
  let start = 0;
  return offsets(text).map((end) => {
    const part = text.slice(start, end);
    start = end;
    return part;
  });
};

describe("lineBreaks", () => {
  it("gives no place in an empty text", () => {
    expect(lineBreaks("")).toEqual([]);
  });

  it("breaks after spaces, and ends with a required place", () => {
    expect(lineBreaks("ab cd")).toEqual([
      { offset: 3, required: false },
      { offset: 5, required: true },
    ]);
  });

  it("requires a break after a line feed, and keeps CR LF together", () => {
    expect(lineBreaks("a\r\nb")).toEqual([
      { offset: 3, required: true },
      { offset: 4, required: true },
    ]);
  });

  it("breaks between ideographs, and not inside a Latin word", () => {
    expect(parts("日本語word")).toEqual(["日", "本", "語", "word"]);
  });

  it("keeps a combining mark and an emoji sequence with the base", () => {
    expect(parts("é \u{1F468}‍\u{1F469}")).toEqual(["é ", "\u{1F468}‍\u{1F469}"]);
  });

  it("keeps the regional indicators of a flag in pairs", () => {
    expect(parts("\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}")).toEqual(["\u{1F1EB}\u{1F1F7}", "\u{1F1E9}\u{1F1EA}"]);
  });

  it("keeps a price and an opening bracket with the next word", () => {
    expect(parts("$1,000.50 (ok)")).toEqual(["$1,000.50 ", "(ok)"]);
  });

  it("gives offsets in UTF-16 units for a character over U+FFFF", () => {
    expect(offsets("\u{20000}\u{20001}")).toEqual([2, 4]);
  });
});

describe("the hook complex of lineBreaks", () => {
  const words = new Intl.Segmenter("und", { granularity: "word" });
  /** The characters of class SA in the Thai block of `LineBreak.txt`. */
  const thaiRun = /[ก-ฺเ-๎]+/gu;
  const withHook = (text: string): readonly number[] => lineBreaks(text, { complex: complexBreaks }).map((place) => place.offset);

  /** The places that the test expects: the places with no hook, plus the word boundaries inside each Thai run. */
  function expected(text: string): number[] {
    const places = new Set(offsets(text));
    for (const run of text.matchAll(thaiRun)) {
      for (const part of words.segment(run[0])) if (part.index > 0) places.add(run.index + part.index);
    }
    return [...places].sort((a, b) => a - b);
  }

  it("divides a Thai sentence into its words", () => {
    const text = "ภาษาไทยเป็นภาษาที่ไม่มีการเว้นวรรค";
    expect(offsets(text)).toEqual([text.length]);
    let start = 0;
    const found = withHook(text).map((end) => text.slice(start, (start = end)));
    expect(found).toEqual(["ภาษา", "ไทย", "เป็น", "ภาษา", "ที่", "ไม่มี", "การ", "เว้น", "วรรค"]);
  });

  it("gives the word boundaries inside the Thai runs of each Thai sample of the corpus, and no other change", () => {
    let inside = 0;
    for (const lengthClass of ["word", "line", "paragraph"] as const satisfies readonly LengthClass[]) {
      for (let index = 0; index < 40; index++) {
        const text = generateSample(1, "thai", lengthClass, index).text;
        const want = expected(text);
        expect(withHook(text), `${lengthClass} ${index}`).toEqual(want);
        inside += want.length - offsets(text).length;
      }
    }
    expect(inside).toBeGreaterThan(0);
  });

  it("finds places inside a Lao, a Khmer and a Myanmar run only with the hook", () => {
    for (const text of ["ພາສາລາວເປັນພາສາທີ່ສວຍງາມ", "ភាសាខ្មែរជាភាសាដ៏ស្រស់ស្អាត", "မြန်မာဘာသာစကားသည်လှပသည်"]) {
      expect(offsets(text), text).toEqual([text.length]);
      expect(withHook(text).length, text).toBeGreaterThan(1);
    }
  });

  it("gives no place before a combining mark, and none from a hook offset outside the run", () => {
    // The run "กิน" starts at 3. Its offset 1 is before the mark U+0E34, and 99 is outside the run.
    const text = "ab กิน cd";
    expect(offsets(text)).toEqual([3, 7, 9]);
    expect(lineBreaks(text, { complex: () => [1, 2, 3, 99] }).map((place) => place.offset)).toEqual([3, 5, 7, 9]);
  });
});

describe("the segments", () => {
  it("keeps a family emoji in one grapheme", () => {
    expect(graphemes("a\u{1F468}‍\u{1F469}b")).toEqual(["a", "\u{1F468}‍\u{1F469}", "b"]);
  });

  it("gives the word boundaries with the end of the text", () => {
    expect(wordBreaks("can't stop")).toEqual([5, 6, 10]);
    expect(wordBreaks("")).toEqual([]);
  });
});

describe("unicodeVersion", () => {
  it("names the version of the table", () => {
    expect(unicodeVersion).toBe("17.0.0");
  });
});
