# Line breaking

The subpath `@mark1russell7/typeset/breaking` breaks a paragraph into lines. It has one model of the paragraph and three breakers. Each breaker takes any width function.

## The model

- A paragraph is a list of items: boxes, glue and penalties, as Knuth and Plass define them.
- A box is text that the breaker does not break. Glue is a space between two boxes. A penalty is a break opportunity with a cost.
- `paragraphOf(text, { widthOf })` makes the items with the break opportunities of CSS `white-space: normal`.
- The hyphenation hook `hyphenate` gives the offsets of a word where a hyphen break is possible. Each offset becomes a flagged penalty.
- The subpaths `@mark1russell7/typeset/hyphen/<language>` give a function for that hook. `docs/HYPHENATION.md` tells each language set.
- `paragraphOf(text, { widthOf, stretch, shrink })` puts the stretch and the shrink on each glue. Without these options, the glue has no such fields.
- The breakers read only the items. Thus a new width function, for example the Arabic widths of T1d, changes only the widths of the items.
- A builder for the classes of UAX 14 makes the same items. The breakers do not change.

## The breakers

| Breaker | What it does |
| --- | --- |
| `greedy` | It fills each line while the next box fits, as `text-wrap: wrap` in a browser. |
| `knuthPlass` (`totalFit()`) | It chooses the breaks with the least sum of demerits over all the lines, for a ragged edge or a justified edge. |
| `balanced` (`balancedBreaker()`) | It keeps the line count of greedy and finds the least width that gives that count, as `text-wrap: balance`. |

- A box that is wider than the line stays whole on its own line in each breaker.
- `linesOf(paragraph, breaks)` gives the text and the width of each line. `raggedness` and `spread` measure the lines.

## The report

`node packages/typeset/src/breaking/report.ts` compares the breakers on the corpus. It uses a width function of the code points, so it needs no font file.

- The cases are seed 1, 20 samples for each cell. The scripts are Latin, extended Latin, Greek and Cyrillic, the lengths are paragraph and page, and the wrap widths are 120, 240 and 480 px. That is 480 cases.
- The greedy breaker gives the same lines as `layoutText` of `@mark1russell7/layout-contract/text` 0.2.21 on 480 of 480 cases.
- Total fit gives a raggedness that is not more than greedy on 479 of 480 cases. The median reduction is 8.9 %. It is 6.7 % at 120 px, 10.8 % at 240 px and 10.7 % at 480 px.
- Total fit gives the same line count as greedy on these cases.
- Balanced gives the line count of greedy on 480 of 480 cases. Its spread is not more than the greedy spread on 475 of 480 cases.

The bench cases of the breakers are in `packages/bench/src/cases/breaking.ts`.

## Why total fit gains only 8.9 %

The prediction `typeset-t3-breakers` expected a median reduction of at least 30 %. The result is 8.9 %. These are the reasons:

- Raggedness is the mean of `r²`. It is the square of the mean `r` plus the variance of `r` between the lines.
- Greedy puts the most text into the lines before the last line. Thus no breaker with the same line count gets a smaller mean `r`.
- Total fit keeps the line count of greedy on these cases. Thus it can remove only the variance part.
- Under greedy, the mean part is 67 % to 70 % of the raggedness on paragraphs and pages at 120 px to 480 px. The ceiling of the reduction is thus near 30 %.
- Total fit removes approximately a third of the variance part. The median reduction is 4.8 % to 12.9 % for each length class and width.
- On short texts of 3 to 6 lines, the median reduction is 0. Few break choices are possible there.

Total fit earns its cost where the variance part is large: long paragraphs at wide measures (12.9 % on a page at 480 px), and text with hyphen breaks. A justified edge, with stretch and shrink of the glue, is a different measure. The next section tells it.

## The justified edge

A line of a justified paragraph fills the full width: its glue stretches or shrinks. Total fit then uses the adjustment ratio of Knuth and Plass.

### The adjustment ratio

`adjustmentRatio(items, start, end, width)` gives the ratio `r` of one line. The free width `w` is the line width minus the natural width of the line.

| Free width | Ratio `r` |
| --- | --- |
| `w = 0` | 0 |
| `w > 0` | `w` divided by the sum of the stretch of the glue of the line |
| `w < 0` | `w` divided by the sum of the shrink of the glue of the line |

- A line with no stretch or no shrink for its free width has an infinite ratio, with the sign of `w`.
- At `r = 1`, the line uses as much stretch as its glue has. At `r = -1`, the line uses all its shrink.
- A line with `r < -1` needs more shrink than its glue has. Such a line is not feasible.

### The cost of a line

This cost applies when a glue of the paragraph has stretch or shrink. Other paragraphs keep the ragged cost, and each breaker gives the same breaks as before stretch and shrink existed.

- The badness of a line is `100 |r|³`, with a limit of 10⁸. The demerits are `(linePenalty + badness)²` plus the square of the cost of the penalty.
- The last line does not stretch. A last line with `r > 0` has no badness, and a last line that shrinks has its usual badness.
- Total fit first counts the lines with `r < -1`, then it compares the demerits. Thus a line over its shrink is not a choice while a feasible set of breaks exists.
- If a paragraph has no feasible set, total fit uses the set with the fewest such lines. A word wider than the line is such a case.
- Greedy and balanced do not read stretch or shrink. They compare only natural widths.

The shrink of a glue must be at most its width. A greater shrink lets a longer line have a smaller width, and the breaker stops its search at the first line over the limit.

Total fit has no fitness classes and no tolerance. Thus it adds no cost between a tight line and a loose line, and each line with `r >= -1` stays a choice.

### The measure of the justified edge

`worstRatio(paragraph, lines, width)` is the measure of the justified edge. It gives the largest `|r|` of the lines of a paragraph.

- `adjustmentRatios(paragraph, lines, width)` gives `r` of each line. The ratio of the last line has an upper limit of 0, because that line does not stretch.
- A value of 0 is an exact edge. A value of 1 or less keeps each line within its stretch and its shrink.
- A smaller value is better. A breaker with a smaller mean of `worstRatio` has fewer lines with wide or narrow spaces.

### The result

`justifyReport()` in `packages/typeset/src/breaking/report.ts` compares the breakers on a fixed set of corpus paragraphs. The test `justify.test.ts` holds the order of these results.

- The cases are seed 14, 60 paragraphs of each of the scripts Latin, extended Latin, Greek and Cyrillic, and the widths 300, 480 and 600 px. That is 240 paragraphs and 720 cases.
- The stretch of each glue is half of a space. The shrink is a third of a space.

| Breaks | Mean of `worstRatio` | Cases with `worstRatio` of 1 or less |
| --- | --- | --- |
| Total fit, with stretch and shrink | 2.915 | 155 of 720 |
| Total fit, with the ragged cost | 4.576 | |
| Greedy | 5.390 | 14 of 720 |

These cases do not use hyphens, so the result shows only the glue.

## The termination of the breakers

A page of Han text has a break place after each character, and it has no glue. Before 0.5.1, the search of total fit read each later break of a line that was too wide at a penalty. Thus the steps grew as the cube of the length of a text with no glue. The search stops at such a line when the line is too wide also without the text of its penalty. A later break of the line can only be wider. A test of `justify.test.ts` breaks a paragraph of 20000 characters with no glue.

The gate `termination.test.ts` holds the class of this defect. It is a property of `fast-check` for each breaker: greedy, total fit and balanced. Each input is a seeded corpus text of one of the 12 scripts, in one of 3 families:

- `no-glue`: a box for each character, with a free break between two boxes.
- `all-penalty`: a box for each character, with a break that adds a hyphen.
- `wide-boxes`: a box for each word, on a line of 1 to 4 characters.

The gate counts the item reads of the breaker. The bound is 8 times the item count times the square of the line length, so it is linear in the item count. With the search before 0.5.1, total fit reads more than the bound on its first input.
