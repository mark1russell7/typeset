import type { FontId, ScriptId } from "@typeset/corpus";

/** The commit of `google/fonts` that gives the font files. A pinned commit gives the same files each time. */
export const fontsCommit = "6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec";

/** The source of one font file of the corpus. */
export interface FontSource {
  readonly id: FontId;
  /** The path of the file in `google/fonts`. */
  readonly path: string;
  /** The SHA-256 of the file, in hexadecimal. The fetch fails when the file has a different hash. */
  readonly sha256: string;
}

/** The sources of the 11 fonts of the corpus. Each font is a variable font, and the width uses its default instance. */
export const fontSources: readonly FontSource[] = [
  { id: "noto-sans", path: "ofl/notosans/NotoSans[wdth,wght].ttf", sha256: "bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d" },
  { id: "noto-serif", path: "ofl/notoserif/NotoSerif[wdth,wght].ttf", sha256: "4d8e6761424656867019081a1a01336f3cb086982682698714054fc33f782713" },
  { id: "noto-sans-mono", path: "ofl/notosansmono/NotoSansMono[wdth,wght].ttf", sha256: "2cb2adb378a8f574213e23df697050b83c54c27df465a2015552740b2769a081" },
  { id: "noto-sans-arabic", path: "ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf", sha256: "63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e" },
  { id: "noto-sans-hebrew", path: "ofl/notosanshebrew/NotoSansHebrew[wdth,wght].ttf", sha256: "7ef36a2c3593758cdb622e1bdef4f84523e92fbc3ccc667438dd80ff54c2de88" },
  { id: "noto-sans-devanagari", path: "ofl/notosansdevanagari/NotoSansDevanagari[wdth,wght].ttf", sha256: "14ec4af41f27482216d1c2229f417ff9b1425e1babb014e57d1d40d03229853e" },
  { id: "noto-sans-thai", path: "ofl/notosansthai/NotoSansThai[wdth,wght].ttf", sha256: "5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8" },
  { id: "noto-sans-sc", path: "ofl/notosanssc/NotoSansSC[wght].ttf", sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da" },
  { id: "noto-sans-jp", path: "ofl/notosansjp/NotoSansJP[wght].ttf", sha256: "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f" },
  { id: "noto-sans-kr", path: "ofl/notosanskr/NotoSansKR[wght].ttf", sha256: "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252" },
  { id: "noto-emoji", path: "ofl/notoemoji/NotoEmoji[wght].ttf", sha256: "de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551" },
];

/** This function gives the download URL of a font source at the pinned commit. */
export function sourceUrl(source: FontSource): string {
  return `https://raw.githubusercontent.com/google/fonts/${fontsCommit}/${source.path.split("/").map(encodeURIComponent).join("/")}`;
}

/** This function gives the local file name of a font source: its identifier with the extension `.ttf`. */
export function fileName(id: FontId): string {
  return `${id}.ttf`;
}

/** The OpenType script tag of each script of the corpus. The emoji have no tag, so they use `DFLT`. */
export const scriptTags: Readonly<Record<ScriptId, string>> = {
  latin: "latn",
  "latin-extended": "latn",
  greek: "grek",
  cyrillic: "cyrl",
  arabic: "arab",
  hebrew: "hebr",
  devanagari: "deva",
  thai: "thai",
  han: "hani",
  kana: "kana",
  hangul: "hang",
  emoji: "DFLT",
};
