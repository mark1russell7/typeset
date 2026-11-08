/**
 * The sequence list of T6: text that the corpus generator does not make. The list covers joiners, variation selectors,
 * keycaps, flags, tags, bidi controls and letters of 3 scripts outside the model. It stays out of `@typeset/corpus`, so
 * the fingerprint of the corpus does not change.
 */

/** The groups of the list. */
export type SequenceGroup = "zwj" | "variation" | "keycap" | "flag" | "tag" | "zwnj" | "bidi" | "hidden-kerning" | "bengali" | "khmer" | "mongolian";

/** One text of the list. */
export interface SequenceEntry {
  readonly id: string;
  readonly group: SequenceGroup;
  /** The identifier of the font of the text. */
  readonly font: string;
  /** The OpenType script tag of the text. */
  readonly script: string;
  readonly text: string;
}

const ZWJ = "‍";
const ZWNJ = "‌";
const VS15 = "︎";
const VS16 = "️";
const KEYCAP = "⃣";
const CGJ = "͏";

/** This function gives the two regional indicators of a country code. */
function flag(code: string): string {
  return Array.from(code, (letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join("");
}

/** This function gives a subdivision flag: the black flag, one tag for each letter, and the cancel tag. */
function subdivision(code: string): string {
  const tags = Array.from(code, (letter) => String.fromCodePoint(0xe0000 + letter.charCodeAt(0))).join("");
  return `\u{1f3f4}${tags}\u{e007f}`;
}

/** The people and the objects of the joined emoji. */
const people = ["\u{1f468}", "\u{1f469}", "\u{1f9d1}"];
const roles = ["\u{1f4bb}", "\u{1f52c}", "\u{1f680}", "\u{1f3a8}", "\u{1f373}", "\u{1f33e}", "\u{1f527}"];

/** The emoji that take a variation selector. */
const presentation = ["☀", "☁", "☂", "☃", "☎", "☔", "☕", "❤", "✈", "✉", "⌚", "⌛"];

/** The letters and the controls of the bidi group. Each control stands between two letters. */
const bidiControls = ["‎", "‏", "؜", "‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩"];
const bidiFonts = [["noto-sans", "latn", "AV"], ["noto-sans-hebrew", "hebr", "אב"], ["noto-sans-arabic", "arab", "بن"]] as const;

/** The text of the group `zwnj`: the two joiners inside words of the scripts that join. */
const joined = [
  ["noto-sans-arabic", "arab", "می"], ["noto-sans-arabic", "arab", "ها"], ["noto-sans-arabic", "arab", "به"],
  ["noto-sans-arabic", "arab", "لا"], ["noto-sans-arabic", "arab", "سم"],
  ["noto-sans-devanagari", "deva", "क्ष"], ["noto-sans-devanagari", "deva", "द्य"],
  ["noto-sans-devanagari", "deva", "र्क"], ["noto-sans-devanagari", "deva", "त्र"],
] as const;

/** The kerning pairs of Source Sans 3 around U+034F. `docs/FONTS.md` gives the widths of the first pair. */
const kerningPairs = ["wō", "wo", "AV", "To", "Yo", "Va", "LT", "Fo"];

const bengaliWords = [
  "বাংলা", "ভাষা", "কাজ", "মানুষ", "শিক্ষা", "স্বাধীনতা", "বিজ্ঞান", "জীবন", "পৃথিবী", "রবীন্দ্রনাথ", "সাহিত্য", "কবিতা", "গান", "নদী", "আকাশ",
  "বন্ধু", "ক্ষমতা", "প্রকৃতি", "সন্ধ্যা", "উদ্যোগ", "কর্ম", "ধর্ম", "বর্ষা", "গ্রাম", "শহর", "দেশ", "রাষ্ট্র", "মন্ত্রী", "চন্দ্র", "সূর্য",
];
const khmerWords = [
  "ភាសា", "ខ្មែរ", "ប្រទេស", "កម្ពុជា", "អក្សរ", "សៀវភៅ", "មនុស្ស", "ស្រុក", "ភ្នំពេញ", "ទន្លេ", "ព្រះ", "សាលា", "រៀន", "ក្រុម", "ស្រី",
  "ប្រុស", "ផ្ទះ", "ទឹក", "ភ្លៀង", "ស្អាត", "អរគុណ", "សួស្តី", "ពិភពលោក", "ច្បាប់", "រដ្ឋ", "កុមារ", "គ្រូ", "សិស្ស", "ដំណើរ", "ប្រវត្តិ",
];
const mongolianWords = [
  "ᠮᠣᠩᠭᠣᠯ", "ᠬᠡᠯᠡ", "ᠪᠢᠴᠢᠭ", "ᠤᠯᠤᠰ", "ᠠᠷᠠᠳ", "ᠨᠠᠷᠠ", "ᠰᠠᠷᠠ", "ᠡᠵᠡᠨ", "ᠬᠦᠮᠦᠨ", "ᠮᠣᠷᠢ", "ᠲᠡᠮᠦᠷ", "ᠲᠡᠩᠷᠢ", "ᠦᠰᠦᠭ", "ᠨᠣᠮ", "ᠠᠭᠤᠯᠠ",
  "ᠤᠰᠤ", "ᠭᠠᠯ", "ᠰᠠᠢᠨ", "ᠬᠠᠭᠠᠨ", "ᠡᠬᠡ", "ᠠᠪᠤ", "ᠬᠦᠦ", "ᠣᠬᠢᠨ", "ᠨᠠᠰᠤ", "ᠬᠠᠷᠠ", "ᠴᠠᠭᠠᠨ", "ᠦᠨᠡᠨ", "ᠪᠠᠶᠠᠷ", "ᠡᠳᠦᠷ", "ᠰᠠᠷ",
];

/** This function gives an entry of the group `group` for each text, with an index in its identifier. */
function entries(group: SequenceGroup, font: string, script: string, texts: readonly string[]): SequenceEntry[] {
  return texts.map((text, index) => ({ id: `${group}/${font}/${index}`, group, font, script, text }));
}

/** The sequence list. Its order is part of the record, so a new text goes at the end of its group. */
export const sequenceEntries: readonly SequenceEntry[] = [
  ...entries("zwj", "noto-emoji", "DFLT", [
    ...people.flatMap((person) => roles.map((role) => `${person}${ZWJ}${role}`)),
    `\u{1f468}${ZWJ}\u{1f469}${ZWJ}\u{1f467}`,
    `\u{1f468}${ZWJ}\u{1f469}${ZWJ}\u{1f467}${ZWJ}\u{1f466}`,
    `❤${VS16}${ZWJ}\u{1f525}`,
    `\u{1f3f3}${VS16}${ZWJ}\u{1f308}`,
  ]),
  ...entries("variation", "noto-emoji", "DFLT", presentation.flatMap((base) => [`${base}${VS15}`, `${base}${VS16}`])),
  ...entries("keycap", "noto-emoji", "DFLT", [..."0123456789#*"].flatMap((base) => [`${base}${VS16}${KEYCAP}`, `${base}${KEYCAP}`])),
  ...entries("flag", "noto-emoji", "DFLT", [
    ...["US", "GB", "JP", "DE", "FR", "IN", "BR", "CA", "CN", "KR", "MX", "ZA", "EG", "NG", "SE", "NO", "IT", "ES", "AU", "NZ"].map(flag),
    flag("U"),
    `${flag("US")}${flag("J")}`,
  ]),
  ...entries("tag", "noto-emoji", "DFLT", ["gbeng", "gbsct", "gbwls", "usca", "ustx"].map(subdivision)),
  ...joined.flatMap(([font, script, pair], index) => {
    const [first, ...rest] = pair;
    return [ZWNJ, ZWJ].map((joiner, kind) => ({ id: `zwnj/${font}/${index}/${kind}`, group: "zwnj" as const, font, script, text: `${first}${joiner}${rest.join("")}` }));
  }),
  ...bidiFonts.flatMap(([font, script, pair]) =>
    entries("bidi", font, script, bidiControls.map((control) => {
      const [first, second] = pair;
      return `${first}${control}${second}`;
    })),
  ),
  ...entries("hidden-kerning", "source-sans-3", "latn", kerningPairs.map((pair) => {
    const [first, second] = pair;
    return `${first}${CGJ}${second}`;
  })),
  ...entries("bengali", "noto-sans-bengali", "beng", bengaliWords),
  ...entries("khmer", "noto-sans-khmer", "khmr", khmerWords),
  ...entries("mongolian", "noto-sans-mongolian", "mong", mongolianWords),
];

/** The code points of the ignorable gate of T6. Each one stands between two letters of each font. */
export const ignorableCodePoints: readonly number[] = [
  0xad, 0x34f, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
  0x2066, 0x2067, 0x2068, 0x2069, 0xfe00, 0xfe0e, 0xfe0f, 0xfeff, 0xe0001, 0xe0020, 0xe0100,
];

/**
 * This function tells if a Chrome probe measures the entry: a mark in Noto Emoji, U+034F next to a kerning pair, or a
 * control of the group `bidi`. The probe of the group `bidi` reads the order of the sum `float32` in Blink (T13b).
 */
export function isProbed(entry: SequenceEntry): boolean {
  return entry.group === "hidden-kerning" || entry.group === "bidi" || (entry.font === "noto-emoji" && /\p{M}/u.test(entry.text));
}
