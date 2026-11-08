import { random as createRandom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { graphemes, lineBreaks, unicodeVersion, wordBreaks, wordBreaksOf } from "../segmentation.ts";

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

describe("wordBreaksOf", () => {
  // The pieces of the words: Latin, digits, punctuation, white space, CR, LF, Thai, Han, emoji with ZWJ and a modifier, and marks.
  const pieces = ["a", "b", "Z", "9", ".", ",", "'", " ", "\t", "\r", "\n", "ก", "า", "สวัสดี", "日", "本", "\u{1F468}", "‍", "\u{1F3FD}", "́", "é"];
  const wordOf = (random: Random): string => Array.from({ length: random.below(9) }, () => pieces[random.below(pieces.length)]!).join("");

  it("gives no entry for no word, and an empty entry for an empty word", () => {
    expect(wordBreaksOf([])).toEqual([]);
    expect(wordBreaksOf(["", "ab", ""])).toEqual([[], [2], []]);
  });

  it("keeps the breaks of a word that ends in CR or that holds a line feed", () => {
    const words = ["ab\r", "\ncd", "e\nf", "g\r\n", "\r"];
    expect(wordBreaksOf(words)).toEqual(words.map((word) => wordBreaks(word)));
  });

  it("gives wordBreaks of each word for 2000 generated lists of words", () => {
    const random = createRandom(14);
    for (let trial = 0; trial < 2000; trial++) {
      const words = Array.from({ length: random.below(9) }, () => wordOf(random));
      expect(wordBreaksOf(words), `seed ${random.seed}, trial ${trial}, words ${JSON.stringify(words)}`).toEqual(words.map((word) => wordBreaks(word)));
    }
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
