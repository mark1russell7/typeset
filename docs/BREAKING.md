# Line breaking

The package `@typeset/breaking` breaks a paragraph into lines. It has one model of the paragraph and three breakers. Each breaker takes any width function.

## The model

- A paragraph is a list of items: boxes, glue and penalties, as Knuth and Plass define them.
- A box is text that the breaker does not break. Glue is a space between two boxes. A penalty is a break opportunity with a cost.
- `paragraphOf(text, { widthOf })` makes the items with the break opportunities of CSS `white-space: normal`.
- The hyphenation hook `hyphenate` gives the offsets of a word where a hyphen break is possible. Each offset becomes a flagged penalty.
- The breakers read only the items. Thus a new width function, for example the Arabic widths of T1d, changes only the widths of the items.
- A builder for the classes of UAX 14 makes the same items. The breakers do not change.

## The breakers

| Breaker | What it does |
| --- | --- |
| `greedy` | It fills each line while the next box fits, as `text-wrap: wrap` in a browser. |
| `knuthPlass` (`totalFit()`) | It chooses the breaks with the least sum of demerits over all the lines, for a ragged right edge. |
| `balanced` (`balancedBreaker()`) | It keeps the line count of greedy and finds the least width that gives that count, as `text-wrap: balance`. |

- A box that is wider than the line stays whole on its own line in each breaker.
- `linesOf(paragraph, breaks)` gives the text and the width of each line. `raggedness` and `spread` measure the lines.

## The report

`node packages/breaking/src/report.ts` compares the breakers on the corpus. It uses a width function of the code points, so it needs no font file.

- The cases are seed 1, 20 samples for each cell. The scripts are Latin, extended Latin, Greek and Cyrillic, the lengths are paragraph and page, and the wrap widths are 120, 240 and 480 px. That is 480 cases.
- The greedy breaker gives the same lines as `layoutText` of `@mark1russell7/layout-contract/text` 0.2.21 on 480 of 480 cases.
- Total fit gives a raggedness that is not more than greedy on 479 of 480 cases. The median reduction is 8.9 %. It is 6.7 % at 120 px, 10.8 % at 240 px and 10.7 % at 480 px.
- Total fit gives the same line count as greedy on these cases.
- Balanced gives the line count of greedy on 480 of 480 cases. Its spread is not more than the greedy spread on 475 of 480 cases.

The bench cases of the breakers are in `packages/bench/src/cases/breaking.ts`.
