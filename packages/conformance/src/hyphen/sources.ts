/** The commit of the repository `hyphenation/tex-hyphen` that holds the pattern files. */
export const texHyphenCommit = "5684c0f51c0b81133db2efbe60a408b4155a3ff5";

/** The folder of the pattern files in that repository. */
const patternFolder = "hyph-utf8/tex/generic/hyph-utf8/patterns/tex";

/** The source of a word list. */
export interface WordList {
  /** The name of the list, with its version. */
  readonly name: string;
  /** The place of the list. */
  readonly url: string;
  /** The SHA-256 of the file that gave the sample in `data/hyphen`. */
  readonly sha256: string;
  /** The terms of the list. */
  readonly license: string;
  /** This value is `true` when the list does not come from the project of the patterns. */
  readonly independent: boolean;
}

/**
 * The least rates of a language set on its word list: a ratchet. A new set must hold or raise both rates. So a gain in `found` does not
 * hide a loss in `confirmed`, the share of correct hyphens.
 */
export interface RateFloor {
  /** The least share of the places of the list that the set gives. */
  readonly found: number;
  /** The least share of the places of the set that the list holds. */
  readonly confirmed: number;
}

/** A language set: a pattern file, the name of its license, a word list and the floors of its rates. */
export interface HyphenFile {
  readonly language: string;
  /** The file name in the folder of the pattern files. */
  readonly name: string;
  readonly sha256: string;
  readonly license: string;
  readonly list: WordList;
  readonly floor: RateFloor;
}

/** This function gives a fault for each rate of a language that is below its floor. */
export function floorFaults(language: string, rates: RateFloor, floor: RateFloor): string[] {
  return (["found", "confirmed"] as const).filter((name) => rates[name] < floor[name]).map((name) => `${language}: ${name} ${rates[name]} is below the floor ${floor[name]}`);
}

/** The language sets. */
export const hyphenFiles: readonly HyphenFile[] = [
  {
    language: "en-us",
    name: "hyph-en-us.tex",
    sha256: "f4ffcd96c5cbc886bdad23f95dcae8edc3cd3620eae62f7946eceda97c4e68f8",
    license: "the all-permissive notice of Gerard D.C. Kuiken",
    list: {
      name: "Moby Hyphenator II",
      url: "https://www.gutenberg.org/files/3204/files/mhyph.txt",
      sha256: "eeb30474c86b8af3469035ec1a0913e35905325ca885290db9dfed9881e230ac",
      license: "public domain",
      independent: true,
    },
    floor: { found: 0.7575, confirmed: 0.9537 },
  },
  {
    language: "de",
    name: "hyph-de-1996.tex",
    sha256: "374ad1ce3263f8a2791ec070ef9b516c532dae64456f3fb656e617e8ae53a9d3",
    license: "MIT",
    list: {
      name: "German Wiktionary, kaikki.org extract of 2026-10-30",
      url: "https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz",
      sha256: "39ea559834e4cbcd2f1cc686037fc6ddc4590f29af94fd143292146ad9bf24c5",
      license: "CC BY-SA 4.0",
      independent: true,
    },
    floor: { found: 0.9607, confirmed: 0.9904 },
  },
  {
    language: "fr",
    name: "hyph-fr.tex",
    sha256: "526cad6fe8f52fcd3caa3fcaf667cb1740cfc14bca198680e00dc343a84594de",
    license: "MIT",
    list: {
      name: "Lexique 3.83, column orthosyll",
      url: "http://www.lexique.org/databases/Lexique383/Lexique383.zip",
      sha256: "e181d132b3b0d3d87efc98d376968441b517353933011cebea5366321a6024e6",
      license: "CC BY-SA 4.0",
      independent: true,
    },
    floor: { found: 0.8278, confirmed: 0.9993 },
  },
];

/**
 * The TUGboat list of hyphen exceptions for US English. It is a second list that does not come from Moby. The training of `en-us`
 * scores each set on it, so a gain does not come only from the rules of one dictionary.
 */
export const tugboatExceptions: WordList = {
  name: "TUGboat hyphenation exceptions for US English (ushyphex.tex, 2021)",
  url: "https://mirrors.ctan.org/info/digests/tugboat/hyphenex/ushyphex.tex",
  sha256: "9392bd6e14b2f34ebc31d2ba4eddb7d1266bf563bfd89c6161f63cfd7f00ef5c",
  license: "free use, change and distribution, by the notice of the TeX Users Group",
  independent: true,
};

/**
 * Webster's Unabridged Dictionary of 1913, from Project Gutenberg. It marks the syllables of each headword. It does not come from Moby,
 * from `ushyphmax.tex` or from the TUGboat list. The patterns of Liang come from another dictionary of Merriam-Webster, so the
 * convention is related. Its syllables are not exactly hyphens, and its spellings are of 1913.
 */
export const webster1913: WordList = {
  name: "Webster's Unabridged Dictionary of 1913 (Project Gutenberg 29765)",
  url: "https://www.gutenberg.org/files/29765/29765-0.txt",
  sha256: "4d9c7a6f3b27add378aea8db3afc4d9190c2f4a6bd4341755b514155ab91873a",
  license: "public domain",
  independent: true,
};

/** This function gives the URL of a pattern file at the pinned commit. */
export function hyphenUrl(file: HyphenFile): string {
  return `https://raw.githubusercontent.com/hyphenation/tex-hyphen/${texHyphenCommit}/${patternFolder}/${file.name}`;
}
