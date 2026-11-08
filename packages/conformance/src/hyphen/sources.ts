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

/** A language set: a pattern file, the name of its license, and a word list. */
export interface HyphenFile {
  readonly language: string;
  /** The file name in the folder of the pattern files. */
  readonly name: string;
  readonly sha256: string;
  readonly license: string;
  readonly list: WordList;
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
  },
];

/** This function gives the URL of a pattern file at the pinned commit. */
export function hyphenUrl(file: HyphenFile): string {
  return `https://raw.githubusercontent.com/hyphenation/tex-hyphen/${texHyphenCommit}/${patternFolder}/${file.name}`;
}
