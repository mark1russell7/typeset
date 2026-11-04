/** The Unicode version of the gate. The runtime of the gate must have this version, so `Intl.Segmenter` follows it. */
export const unicodeVersion = "17.0.0";

/** A file of the Unicode Character Database with its SHA-256. */
export interface UnicodeFile {
  readonly path: string;
  readonly sha256: string;
}

/** The test files of the gate. */
export const testFiles: Readonly<Record<"grapheme" | "word" | "line", UnicodeFile>> = {
  grapheme: { path: "auxiliary/GraphemeBreakTest.txt", sha256: "e2d134d2c52919bace503ebb6a551c1855fe1a1faec18478c78fff254a1793ec" },
  word: { path: "auxiliary/WordBreakTest.txt", sha256: "1de23a75f37904abc7d206239ee8d34f8fdf0fb4ab32a7174dfbabbde25419b2" },
  line: { path: "auxiliary/LineBreakTest.txt", sha256: "e69884e0dde6a8724873f885d68c52dc14518abf9ae4ca9e2283b8773db3b752" },
};

/** The property files of the generated table. */
export const propertyFiles: Readonly<Record<"lineBreak" | "eastAsianWidth", UnicodeFile>> = {
  lineBreak: { path: "LineBreak.txt", sha256: "e6a18fa91f8f6a6f8e534b1d3f128c21ada45bfe152eb6b1bcc5e15fd8ac92e6" },
  eastAsianWidth: { path: "EastAsianWidth.txt", sha256: "ea7ce50f3444a050333448dffef1cadd9325af55cbb764b4a2280faf52170a33" },
};

/** This function gives the URL of a file of the pinned version. */
export function fileUrl(file: UnicodeFile): string {
  return `https://www.unicode.org/Public/${unicodeVersion}/ucd/${file.path}`;
}
