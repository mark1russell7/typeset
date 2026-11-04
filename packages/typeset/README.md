# @mark1russell7/typeset

This package measures text and breaks it into lines. Each area has its own subpath.

| Subpath | What it has |
| --- | --- |
| `@mark1russell7/typeset/breaking` | The paragraph model of boxes, glue and penalties, and the greedy, total fit and balanced line breakers. |
| `@mark1russell7/typeset/fonts` | The font model: it reads a font file and gives the width of a text as a browser engine gives it. |
| `@mark1russell7/typeset/hyphen` | `hyphenator`: the matcher of Liang, with no language data. |
| `@mark1russell7/typeset/hyphen/en-us`, `/de`, `/fr` | The hyphen patterns of one language, for the hook `hyphenate`. |
| `@mark1russell7/typeset/measurer` | `fontAdvance`: the advance function of a layout engine, from the font files of the host. |
| `@mark1russell7/typeset/text` | The `Text` rope: a text with its width, and edits that measure only the changed parts. |

## Line breaking

```ts
import { greedy, knuthPlass, linesOf, paragraphOf } from "@mark1russell7/typeset/breaking";

const widthOf = (text: string): number => 8 * [...text].length;
const paragraph = paragraphOf("The quick brown fox jumps over the lazy dog", { widthOf });
const lines = linesOf(paragraph, knuthPlass.breaks(paragraph, 120));
```

- Each breaker takes any width function. The function gives the width of a run of text in any unit.
- `greedy` fills each line as a browser does. `knuthPlass` chooses the breaks with the least sum of demerits. `balanced` keeps the greedy line count with more equal lines.
- The option `hyphenate` gives the offsets of the hyphen breaks of a word. A language subpath gives a function for this option.
- The options `stretch` and `shrink` make a justified paragraph. Total fit then uses the adjustment ratio of Knuth and Plass.
- `worstRatio` measures the justified edge. `docs/BREAKING.md` in the repository defines it.

```ts
import { knuthPlass, linesOf, paragraphOf, worstRatio } from "@mark1russell7/typeset/breaking";
import { hyphenate } from "@mark1russell7/typeset/hyphen/en-us";

const paragraph = paragraphOf("The quick brown fox jumps over the lazy dog", { widthOf, hyphenate, stretch: 4, shrink: 2.5 });
const lines = linesOf(paragraph, knuthPlass.breaks(paragraph, 120));
const edge = worstRatio(paragraph, lines, 120);
```

### The sizes and the licenses of the language sets

Each set is on its own subpath, so an application pays only for the sets that it imports. The bytes are for one bundled set with the matcher, minified, at gzip level 9.

| Subpath | Gzip bytes | Source file of `tex-hyphen` | License |
| --- | --- | --- | --- |
| `./hyphen/en-us` | 18202 | `hyph-en-us.tex` | The all-permissive notice of Gerard D.C. Kuiken |
| `./hyphen/de` | 123851 | `hyph-de-1996.tex` | MIT |
| `./hyphen/fr` | 5568 | `hyph-fr.tex` | MIT |

The license of a pattern file applies to its data. The header of each file stays at the top of its module and in a bundle. `docs/HYPHENATION.md` in the repository has the sources and the results.

## The Text rope

```ts
import { Text } from "@mark1russell7/typeset/text";

const widthOf = (text: string): number => 8 * [...text].length;
const text = Text.from("The quick brown fox", widthOf);
const edited = text.insert(4, "very ").remove(0, 4);
console.log(edited.toString(), edited.width);
```

- Each edit gives a new rope. The old rope does not change, and the two share the parts that the edit does not touch.
- An edit uses the width function of the order of `log n` times, on the changed leaves and on short windows.
- The width is exact when the width function obeys the separator law: `width(p + s + q) = width(p + s) + width(s + q) - width(s)`.
- The separator `s` is a space or a tab. The option `separators` changes the set.
- The font model of `./fonts` obeys the law for its shaping `dom` and `canvas`, with the sum `exact`.

## The font model and the measurer

```ts
import { readFileSync } from "node:fs";
import { createMeasurer, layoutText } from "@mark1russell7/layout-contract/text";
import { fontAdvance } from "@mark1russell7/typeset/measurer";

const advance = fontAdvance({ faces: [{ family: "Noto Sans", data: readFileSync("NotoSans.ttf") }], engine: "freetype" });
const layout = layoutText("The quick brown fox", { font: "16px Noto Sans", measurer: createMeasurer(advance), lineHeight: 20, wrapWidth: 80 });
```

- The host gives the bytes of each font file. The package has no font file.
- `fontAdvance` reads the CSS font, and finds the face with the CSS rules of the family, the style and the weight.
- Each run of the text gets the first family with a glyph for its first character.
- The width of a run is `measureWidth` of `./fonts`, with the script of the run and the rules of one engine of `engines`.
- The engine rows are `freetype` (Chromium on Linux), `coretext` (macOS) and `directwrite` (Windows).
- `readFont` reads TrueType, OpenType and WOFF2 files. A WOFF2 file needs a Brotli decompress function, for example `brotliDecompressSync` of `node:zlib`.

The repository [mark1russell7/typeset](https://github.com/mark1russell7/typeset) has the report of the breakers in `docs/BREAKING.md`.
