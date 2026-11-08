# Hyphenation

The subpaths `@mark1russell7/typeset/hyphen/<language>` give hyphen places for the hook `hyphenate` of `paragraphOf`. Each language has its own subpath, so an application pays only for the languages that it imports.

```ts
import { knuthPlass, paragraphOf } from "@mark1russell7/typeset/breaking";
import { hyphenate } from "@mark1russell7/typeset/hyphen/en-us";

const paragraph = paragraphOf(text, { widthOf, hyphenate, stretch: 4, shrink: 2.5 });
const breaks = knuthPlass.breaks(paragraph, 480);
```

## The entries

| Subpath | What it has |
| --- | --- |
| `./hyphen` | `hyphenator(set)`, the small matcher of Liang, and the types `PatternSet` and `HyphenSource`. It has no language data. |
| `./hyphen/en-us` | American English. |
| `./hyphen/de` | German, with the spelling of 1996. |
| `./hyphen/fr` | French. |

- Each language subpath exports `hyphenate` for the hook, and `source` with the origin and the result of the set.
- The root entry, `./breaking` and each other entry have no language set. A test of `packages/conformance` bundles each entry and examines its input files.
- `hyphenate` finds each run of letters of a word, so a word can have punctuation and capitals. The offsets are offsets in the word as the hook gets it.
- The table of a set comes at the first use of `hyphenate`, so an import costs no time.
- A run with a lowercase form of another length stays whole, because its offsets are not known.

## The sets

The patterns come from the project `hyphenation/tex-hyphen`, at the commit `5684c0f51c0b81133db2efbe60a408b4155a3ff5`. `packages/conformance/src/hyphen/sources.ts` has the SHA-256 of each file.

| Language | File | License of the patterns | Minified bytes | Gzip bytes |
| --- | --- | --- | --- | --- |
| `en-us` | `hyph-en-us.tex` | The all-permissive notice of Gerard D.C. Kuiken | 33537 | 18202 |
| `de` | `hyph-de-1996.tex` | MIT | 281320 | 123851 |
| `fr` | `hyph-fr.tex` | MIT | 12755 | 5568 |

- These weights include the matcher. The matcher alone is 884 minified bytes and 539 gzip bytes.
- The weights use the measure of the weight gate: a bundle for the browser by esbuild, minified, then gzip at level 9.
- The header of each pattern file stays at the top of its module as a legal comment. The bundles keep this comment, so the license stays with the data. The weights include it.
- The `gzip` bytes come from the zlib of Node 24. Another zlib can give other bytes, so the gate allows a difference of 1 %. The minified bytes are exact.

## The word lists

Each set has a test on a sample of 10000 words of a word list from another project. The patterns do not come from these lists.

| Language | Word list | License of the list | Confirmed | Found |
| --- | --- | --- | --- | --- |
| `en-us` | Moby Hyphenator II | Public domain | 0.9537 | 0.7575 |
| `de` | German Wiktionary, `kaikki.org` extract of 2026-10-30 | CC BY-SA 4.0 | 0.9904 | 0.9607 |
| `fr` | Lexique 3.83, column `orthosyll` | CC BY-SA 4.0 | 0.9993 | 0.8279 |

The two values are different measures:

- `confirmed` is the share of the places of the set that the list holds. It tells how often a hyphen of the set is correct.
- `found` is the share of the places of the list that the set gives. The left and right limits of the set remove places from this count.

The test gates `confirmed` at 0.95 or more, because a wrong hyphen is an error and a place that is not used is only a lost choice. The patterns of TeX leave out correct places by design, so `found` stays lower. It has no gate.

A dictionary and a pattern set can use different rules for a word. The lists also have errors, so these values are not exact measures of correctness.

`data/hyphen/NOTICE.md` in `packages/conformance` tells the sources of the samples. That package is private, so the samples are not part of the npm package.

## The gate

The CI job `conformance` also holds the gate of the sets. The gate stops in these cases:

- The SHA-256 of a pattern file differs from `sources.ts`.
- A committed module differs from the module of its pinned file.
- A field of `packages/conformance/data/hyphen.json` differs from a new measure, or a weight differs from the record.

The test `packages/conformance/src/hyphen/hyphen.test.ts` also fails when a value in the record or in `source` is stale.

## How to change a set

1. Change the commit or the file and each SHA-256 in `packages/conformance/src/hyphen/sources.ts`.
2. Start `pnpm --filter @typeset/conformance tables --folder <folder>`. It writes the modules and the record.
3. Commit the modules and the record.

To draw new samples, start `pnpm --filter @typeset/conformance draw --folder <folder>` with the three word lists in the folder. The gate does not start this command.

To add a language:

1. Add an entry to `sources.ts`.
2. Add the subpath to `exports` and to `publishConfig.exports` in `packages/typeset/package.json`.
3. Add the entry to `tsdown.config.ts`.
4. Add a sample in `packages/conformance/data/hyphen`.
5. Do the steps above.
