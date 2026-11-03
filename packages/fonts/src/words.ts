/**
 * The words of the text of a canvas. Blink shapes the text of `fillText` and `measureText` one word at a time, so no GSUB
 * context and no pair kerning goes across two words. This module follows `NextWordEndIndex` of
 * `third_party/blink/renderer/platform/fonts/plain_text_node.cc` and the CJK table of `character_property_data.h`.
 * The Chromium Authors wrote these files under a BSD-style license.
 */

/** The single code points of the CJK table of Blink. */
const cjkValues: ReadonlySet<number> = new Set([
  0x2c7, 0x2ca, 0x2cb, 0x2d9, 0x2020, 0x2021, 0x2030, 0x203b, 0x203c, 0x2042, 0x2047, 0x2048, 0x2049, 0x2051, 0x20dd, 0x20de, 0x2100, 0x2103,
  0x2105, 0x2109, 0x210a, 0x2113, 0x2116, 0x2121, 0x212b, 0x213b, 0x2150, 0x2151, 0x2152, 0x217f, 0x2189, 0x2307, 0x2312, 0x23ce, 0x2423, 0x25a0,
  0x25a1, 0x25a2, 0x25aa, 0x25ab, 0x25b1, 0x25b2, 0x25b3, 0x25b6, 0x25b7, 0x25bc, 0x25bd, 0x25c0, 0x25c1, 0x25c6, 0x25c7, 0x25c9, 0x25cb, 0x25cc,
  0x25ef, 0x2605, 0x2606, 0x260e, 0x2616, 0x2617, 0x26a0, 0x2713, 0x271a, 0x273f, 0x2740, 0x2756, 0x2763, 0x2b1a, 0xfe10, 0xfe11, 0xfe12, 0xfe19,
  0xff1d, 0x1f100, 0x1f200, 0x1f237, 0x1f32c, 0x1f336, 0x1f37d, 0x1f43f, 0x1f54f, 0x1f93b, 0x1f946,
]);

/** The ranges of the CJK table of Blink, as pairs of the first and the last code point. */
const cjkRanges: readonly number[] = [
  0x2e80, 0x2fdf, 0x31c0, 0x31ef, 0x3400, 0x4dbf, 0x4e00, 0x9fff, 0xf900, 0xfaff, 0x20000, 0x2ffff, 0x2156, 0x215a, 0x2160, 0x216b, 0x2170, 0x217b,
  0x23be, 0x23cc, 0x2460, 0x2492, 0x249c, 0x24ff, 0x25ce, 0x25d3, 0x25e2, 0x25e6, 0x2600, 0x2603, 0x2660, 0x266f, 0x2672, 0x267d, 0x2776, 0x277f,
  0x2ff0, 0x302d, 0x3031, 0x312f, 0x3190, 0x31bf, 0x3200, 0x33ff, 0x4dc0, 0x4dff, 0xf860, 0xf862, 0xfe30, 0xfe6f, 0xff00, 0xff0c, 0xff0e, 0xff1a,
  0xff1f, 0xffef, 0x16fe0, 0x16fff, 0x17000, 0x187ff, 0x18800, 0x18aff, 0x1b000, 0x1b0ff, 0x1b100, 0x1b12f, 0x1b170, 0x1b2ff, 0x1f110, 0x1f129,
  0x1f130, 0x1f149, 0x1f150, 0x1f169, 0x1f170, 0x1f189, 0x1f202, 0x1f219, 0x1f21b, 0x1f22e, 0x1f230, 0x1f231, 0x1f23b, 0x1f24f, 0x1f252, 0x1f2ff,
  0x1f321, 0x1f32a, 0x1f394, 0x1f39f, 0x1f3cd, 0x1f3ce, 0x1f3d4, 0x1f3df, 0x1f3f1, 0x1f3f2, 0x1f3f5, 0x1f3f7, 0x1f4fd, 0x1f4fe, 0x1f53e, 0x1f54a,
  0x1f568, 0x1f573, 0x1f576, 0x1f579, 0x1f57b, 0x1f58f, 0x1f591, 0x1f594, 0x1f597, 0x1f5a3, 0x1f5a5, 0x1f5e7, 0x1f5e9, 0x1f5fa, 0x1f650, 0x1f67f,
  0x1f6c6, 0x1f6cb, 0x1f6cd, 0x1f6cf, 0x1f6d3, 0x1f6d4, 0x1f6d9, 0x1f6db, 0x1f6e0, 0x1f6ea, 0x1f6ed, 0x1f6f3, 0x1f6fd, 0x1f6ff, 0x1f900, 0x1f90b,
  0x1fac9, 0x1facc,
];

const emojiPresentation = /\p{Emoji_Presentation}/u;
const modifierLike = /[\p{M}\p{Lm}\p{Sk}]/u;
const continuesEmoji = /[‍\p{Emoji_Component}\p{Extended_Pictographic}]/u;
const commonOrInherited = /[\p{Script=Common}\p{Script=Inherited}]/u;

/**
 * This function tells if Blink starts a CJK word at the code point `codePoint`. Blink also marks the pictographs of the
 * RGI emoji sequences. This function uses `Emoji_Presentation` for them, so some text-style pictographs are missing.
 */
export function isCjkIdeographOrSymbol(codePoint: number): boolean {
  if (codePoint < 0x2c7) return false;
  if (cjkValues.has(codePoint)) return true;
  for (let i = 0; i < cjkRanges.length; i += 2) if (codePoint >= cjkRanges[i]! && codePoint <= cjkRanges[i + 1]!) return true;
  return emojiPresentation.test(String.fromCodePoint(codePoint));
}

/** This function tells if Blink ends a word before the character `character`: a space, a tab or a zero width space. */
function isDelimiter(character: string): boolean {
  return character === " " || character === "\t" || character === "​";
}

/**
 * This function divides the text of a canvas into the words that Blink shapes one at a time. Each space, tab and zero
 * width space is a word alone. Each CJK character starts a word, with its marks and the CJK characters of the script
 * Common after it.
 */
export function canvasWords(text: string): string[] {
  const characters = [...text];
  const words: string[] = [];
  let start = 0;
  while (start < characters.length) {
    const end = wordEnd(characters, start);
    words.push(characters.slice(start, end).join(""));
    start = end;
  }
  return words;
}

/** This function gives the index after the last character of the word that starts at `start`. */
function wordEnd(characters: readonly string[], start: number): number {
  const first = characters[start]!;
  if (start + 1 === characters.length || isDelimiter(first)) return start + 1;
  let end = start + 1;
  if (!isCjkIdeographOrSymbol(first.codePointAt(0)!)) {
    for (; end < characters.length; end++) {
      const character = characters[end]!;
      if (isDelimiter(character) || (isCjkIdeographOrSymbol(character.codePointAt(0)!) && !modifierLike.test(character))) return end;
    }
    return end;
  }
  let hasScript = !commonOrInherited.test(first);
  for (; end < characters.length; end++) {
    const character = characters[end]!;
    if (modifierLike.test(character) || continuesEmoji.test(character)) continue;
    if (isCjkIdeographOrSymbol(character.codePointAt(0)!)) {
      if (commonOrInherited.test(character)) continue;
      if (!hasScript) {
        hasScript = true;
        continue;
      }
    }
    return end;
  }
  return end;
}
