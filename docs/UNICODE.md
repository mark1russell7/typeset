# Unicode conformance

The subpath `@mark1russell7/typeset/segmentation` gives the break positions of Unicode. The subpath `@mark1russell7/typeset/bidi` gives the bidi levels and the visual order of UAX #9. The CI job `conformance` scores both with the test files of Unicode.

## The rule

- The gate pins Unicode 17.0.0. `packages/conformance/src/sources.ts` has the version and the SHA-256 of each file.
- A file with a different SHA-256 stops the gate.
- A failed test stops the gate if `packages/conformance/data/reasons.json` has no reason for it.
- The gate also stops if the runtime has a different Unicode version.
- The gate also stops if `line-table.ts` or `bidi/table.ts` differs from the table of the property files.
- `ci-ok` needs this job, so a change that breaks a position cannot merge.

| Function | Algorithm | Test file |
|---|---|---|
| `graphemes` | UAX #29 grapheme clusters, through `Intl.Segmenter` | `GraphemeBreakTest.txt` |
| `wordBreaks` | UAX #29 word boundaries, through `Intl.Segmenter` | `WordBreakTest.txt` |
| `lineBreaks` | UAX #14 rules, in this package | `LineBreakTest.txt` |
| `canvasWords` | The word cache of Blink, not a Unicode algorithm | `WordBreakTest.txt`, as a report only |
| `resolveLevels`, by class | UAX #9 rules, in this package | `BidiTest.txt` |
| `resolveLevels`, by code point with `bidiClass` and `bracketOf` | UAX #9 rules with the table of this package | `BidiCharacterTest.txt` |

The gate scores the bidi files for the levels and for the order. It gives one score for each paragraph direction of a test, so a file has 6 scores. The levels of a `BidiCharacterTest.txt` test also fail when the paragraph level differs. The key of a reason is `<score>:<line>`, for example `bidiCharacter.rtl.order:300`.

## Change the version

1. Change the version and each SHA-256 in `packages/conformance/src/sources.ts`.
2. Change the exact version of Node in the job `conformance`, so that the runtime has the new Unicode version.
3. Compare the rules of UAX #14 with the rules in `packages/typeset/src/segmentation/line.ts`.
   Compare the rules of UAX #9 with the rules in `packages/typeset/src/bidi/resolve.ts`. Use the revision of the new version, not the latest page.
4. Start `pnpm --filter @typeset/conformance tables --folder <folder>` and commit the new table.

## Limits of the result

- The job uses one exact version of Node, so the pass rates are for the ICU of that version. The record of each run tells the Node, Unicode and ICU versions.
- `graphemes` and `wordBreaks` use `Intl.Segmenter`, so they follow the ICU of the runtime. A different runtime can give different positions.
- `lineBreaks` uses its own table, so it follows the pinned version on each runtime.
- The pin is one version older than the latest Unicode version, because the runtime has Unicode 17.0.
- The test files examine rule pairs. They do not examine real text, and they do not examine the tailoring of a locale.
- With no option, `lineBreaks` uses the default rules with no tailoring. The rule LB1 reads a character of class SA as AL or CM. So a Thai run has no break inside it, as `LineBreakTest` expects.
- The option `complex` adds the breaks inside each run of class SA (Thai, Lao, Khmer and Myanmar). The hook `complexBreaks` takes them from `Intl.Segmenter` (T12b).
- `complexBreaks` uses the dictionary of the runtime, so the entry ships no dictionary. The places follow the ICU of the runtime, as `wordBreaks` does. The gate examines the default only.

## The two sets of bidi classes

`./bidi` has the exact classes, from `DerivedBidiClass.txt` and `BidiBrackets.txt`. `./fonts` has no class table, because this table does not fit the weight limit of the entry. The two entries use the same rules in `bidi/resolve.ts`.

| Entry | Classes | Brackets | Paragraph direction | Removed characters |
|---|---|---|---|---|
| `./bidi` | The exact table | The exact table | `auto`, `0` or `1` | The value `removed` |
| `./fonts` | A guess from the script and the general category, with the exact format characters | The exact table | Level 0 | The level of the character before them |

- The test files score `./bidi` only. `./fonts` has no pass rate, because its classes are a guess. Its levels are internal, and `canvasSegments` applies them.
- A test compares the levels of `./fonts` with the exact table on the corpus. They are equal there.
- The guess gives wrong classes outside the common characters. For example, it does not know the exact class of an unassigned code point.

## Limits of the bidi result

- `resolveLevels` treats each paragraph as one line. The rules L1 and L2 apply to a line, so a layout that breaks a paragraph needs them for each line.
- The result stops at the rule L2. It does not apply the rules L3 and L4, so it does not mirror a character and it does not move a mark.
- `BidiTest.txt` has no brackets, and `B` is only at the end of a test. So the file does not examine the rule N0 or the rule P1.
- `BidiCharacterTest.txt` has one paragraph in each test. A unit test examines the rule P1.
- The two files do not examine the context `sos` in the rule N0. A unit test examines this context.
- `resolveText` counts code points, not UTF-16 units.
- `canvasSegments` splits a text at an explicit character or a direction mark. The sum `float32` thus shapes each part alone.
- This split changes 21 of the 252 entries of the sequence list, all in the group `bidi`, and no sample of the corpus.
- No gate compares these 21 entries with a browser under the sum `float32`. The sequence test applies the sum `exact`, which uses `canvasWords`.

## The differences of `canvasWords`

`canvasWords` has a different purpose. It copies the word cache of Blink, so that a sum of word widths is equal to the width of canvas `measureText`. It is not a UAX #29 function, and `paragraphOf` does not use its positions as line breaks.

`WordBreakTest` is therefore a report of the difference, not a gate of a pass rate. Each failed test goes in one class, and the gate stops on a class that has no reason in `reasons.json`.

| Class | Reason |
|---|---|
| `missing` | Blink ends a word only at a space, a tab, a zero width space or a CJK word start. So the boundaries of UAX #29 between letters, digits and punctuation are not there. |
| `extra` | Each space is a word alone, and a CJK or emoji character starts a word. UAX #29 keeps a mark or a joiner with the character before it. |
| `both` | The test has the 2 differences at different places. |
