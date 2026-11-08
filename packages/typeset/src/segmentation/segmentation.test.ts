import { describe, expect, it } from "vitest";
import { graphemes, lineBreaks, unicodeVersion, wordBreaks } from "../segmentation.ts";

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
