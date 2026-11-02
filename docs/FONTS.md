# Font tables

`@typeset/fonts` reads the widths of text from a font file. `@typeset/widths` compares those widths with canvas `measureText` in Chromium.

## What the reader reads

- The reader reads TrueType, OpenType and WOFF2 files. A WOFF2 file needs a Brotli decompress function, for example `brotliDecompressSync` of `node:zlib`.
- It reads `head`, `hhea`, `maxp`, `hmtx`, `cmap` (formats 4 and 12), `GDEF`, the `kern` table (format 0) and the pair adjustments of the `kern` feature of `GPOS`.
- `measureWidth` adds the advances and the pair kerning, and scales the sum by the size divided by the units per em.
- A mark of `GDEF` has the advance 0, as in HarfBuzz. A lookup that ignores marks skips them.
- `measureWidth` does not shape the text. Thus it does not make ligatures, the joined forms of Arabic or the conjuncts of Devanagari. T4 measures that error.

## The font epoch

The epoch of a font is the revision of `head` and an FNV-1a hash of the data that gives the widths. This data is the units per em, the advances and the tables `cmap`, `GDEF`, `GPOS` and `kern`.

- A cache of widths can use the epoch as a key.
- The TrueType file and the WOFF2 file of one font give the same epoch. The checksum adjustment of `head` is not in the epoch, because `fontTools` changes it in a WOFF2 file.

## The comparison with the canvas

The workflow `fonts.yml` starts the comparison in CI, not on a local machine.

1. `packages/widths/src/fetch.ts` downloads the 11 Noto fonts of the corpus from `google/fonts` at a pinned commit, and checks the SHA-256 of each file.
2. `fontTools` makes a WOFF2 file of each font.
3. `packages/widths/src/main.ts` measures each sample of the corpus (seed 1) with each font that covers its script, at each size from 10 px to 48 px.
4. The command writes `font-widths.json`, with one record for each width and a summary for each script and each length class.

- The error is the table width minus the canvas width, in px. A record with a code point that the font has no glyph for is not in the numbers, because the canvas then uses a fallback font.
- The bounds of the prediction `typeset-t1-font-tables` are in `packages/widths/src/compare.ts`.
- The field `woff2Mismatches` counts the widths of the WOFF2 files that are not equal to the widths of the TrueType files.
