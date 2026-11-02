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

## The result of T1

The scored run is [41488797104](https://github.com/mark1russell7/typeset/actions/runs/41488797104), on `main`. It gives 20160 widths of 1920 samples in headless Chromium 156 on Linux, at a device scale of 1.

| Script | Worst error of the line class, in px | Bound |
|---|---|---|
| latin | 31.6 | 0.5 |
| greek | 32.0 | 0.5 |
| cyrillic | 30.4 | 0.5 |
| hebrew | 107.1 | 0.5 |
| latin-extended | 31.6 | 1.0 |
| han | 21.9 | 0.1 |
| kana | 31.9 | 0.1 |
| hangul | 29.9 | 0.1 |
| arabic | 604.3 | more than 2 |
| devanagari | 26.4 | more than 2 |
| thai | 11.0 | no bound |

- The WOFF2 widths are equal to the TrueType widths. The count of mismatches is 0.
- The bounds for Latin, Greek, Cyrillic, Hebrew, the marks and CJK do not hold. The prediction gives 4 hits of 7 outcomes.
- Each canvas width of this run is a whole number of px. Chromium on Linux rounds each advance and each kerning value to a whole px when the device scale is 1. A model of this rounding gives the same width for 710 of 720 Greek lines and 636 of 720 Latin lines.
- Noto Sans Hebrew, JP and KR are variable fonts. Their default instance is the weight 100. Chromium uses the weight 400, but the reader uses the default instance.
- T1b adds the instances of variable fonts and a rounding mode. It also compares the widths on Linux at the device scale 2, on macOS and on Windows.
