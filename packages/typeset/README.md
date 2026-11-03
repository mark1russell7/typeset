# @mark1russell7/typeset

This package measures text and breaks it into lines. Each area has its own subpath.

| Subpath | What it has |
| --- | --- |
| `@mark1russell7/typeset/breaking` | The paragraph model of boxes, glue and penalties, and the greedy, total fit and balanced line breakers. |

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

The repository [mark1russell7/typeset](https://github.com/mark1russell7/typeset) has the report of the breakers in `docs/BREAKING.md`.
