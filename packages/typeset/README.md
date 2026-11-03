# @mark1russell7/typeset

This package measures text and breaks it into lines. Each area has its own subpath.

| Subpath | What it has |
| --- | --- |
| `@mark1russell7/typeset/breaking` | The paragraph model of boxes, glue and penalties, and the greedy, total fit and balanced line breakers. |
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
- The option `hyphenate` gives the offsets of the hyphen breaks of a word.

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
- The width model of the repository obeys the law for its shaping `dom` and `canvas`, with the sum `exact`.

The repository [mark1russell7/typeset](https://github.com/mark1russell7/typeset) has the report of the breakers in `docs/BREAKING.md`.
