/** The Unicode version of the gate. The runtime of the gate must have this version, so `Intl.Segmenter` follows it. */
export const unicodeVersion = "17.0.0";

/** A file of the Unicode Character Database with its SHA-256. */
export interface UnicodeFile {
  readonly path: string;
  readonly sha256: string;
}

/** The test files of the gate. */
export const testFiles: Readonly<Record<"grapheme" | "word" | "line" | "bidi" | "bidiCharacter", UnicodeFile>> = {
  grapheme: { path: "auxiliary/GraphemeBreakTest.txt", sha256: "e2d134d2c52919bace503ebb6a551c1855fe1a1faec18478c78fff254a1793ec" },
  word: { path: "auxiliary/WordBreakTest.txt", sha256: "1de23a75f37904abc7d206239ee8d34f8fdf0fb4ab32a7174dfbabbde25419b2" },
  line: { path: "auxiliary/LineBreakTest.txt", sha256: "e69884e0dde6a8724873f885d68c52dc14518abf9ae4ca9e2283b8773db3b752" },
  bidi: { path: "BidiTest.txt", sha256: "888bdfc8090652272d1f859cdb00ae659e2dc6c26740be61ef1d03998a687620" },
  bidiCharacter: { path: "BidiCharacterTest.txt", sha256: "a3e6e905ab5afbe318a96df5401d0372a04cd73ef139ab5e3cf0ae241c255488" },
};

/** The property files of the generated table. */
export const propertyFiles: Readonly<Record<"lineBreak" | "eastAsianWidth" | "bidiClass" | "bidiBrackets", UnicodeFile>> = {
  lineBreak: { path: "LineBreak.txt", sha256: "e6a18fa91f8f6a6f8e534b1d3f128c21ada45bfe152eb6b1bcc5e15fd8ac92e6" },
  eastAsianWidth: { path: "EastAsianWidth.txt", sha256: "ea7ce50f3444a050333448dffef1cadd9325af55cbb764b4a2280faf52170a33" },
  bidiClass: { path: "extracted/DerivedBidiClass.txt", sha256: "4867b4b7f0731ed1bfcd34cc6251211ff1542541fce0734b6fbda139ee80b3a4" },
  bidiBrackets: { path: "BidiBrackets.txt", sha256: "dadbaf38a0d0246e5b805bf8725cb81b7c621f93d030595635f5ba2c2f179428" },
};

/** This function gives the URL of a file of the pinned version. */
export function fileUrl(file: UnicodeFile): string {
  return `https://www.unicode.org/Public/${unicodeVersion}/ucd/${file.path}`;
}
