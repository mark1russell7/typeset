# Unicode conformance

The subpath `@mark1russell7/typeset/segmentation` gives the break positions of Unicode. The CI job `conformance` scores these positions with the test files of Unicode.

## The rule

- The gate pins Unicode 17.0.0. `packages/conformance/src/sources.ts` has the version and the SHA-256 of each file.
- A file with a different SHA-256 stops the gate.
- A failed test stops the gate if `packages/conformance/data/reasons.json` has no reason for it.
- The gate also stops if the runtime has a different Unicode version.
- The gate also stops if `line-table.ts` differs from the table of the property files.
- `ci-ok` needs this job, so a change that breaks a position cannot merge.

| Function | Algorithm | Test file |
|---|---|---|
| `graphemes` | UAX #29 grapheme clusters, through `Intl.Segmenter` | `GraphemeBreakTest.txt` |
| `wordBreaks` | UAX #29 word boundaries, through `Intl.Segmenter` | `WordBreakTest.txt` |
| `wordBreaksOf` | The boundaries of `wordBreaks` for each word of a list, in one pass | A property test against `wordBreaks` of each word |
| `lineBreaks` | UAX #14 rules, in this package | `LineBreakTest.txt` |
| `canvasWords` | The word cache of Blink, not a Unicode algorithm | `WordBreakTest.txt`, as a report only |

## Change the version

1. Change the version and each SHA-256 in `packages/conformance/src/sources.ts`.
2. Change the exact version of Node in the job `conformance`, so that the runtime has the new Unicode version.
3. Compare the rules of UAX #14 with the rules in `packages/typeset/src/segmentation/line.ts`.
4. Start `pnpm --filter @typeset/conformance tables --folder <folder>` and commit the new table.

## Limits of the result

- The job uses one exact version of Node, so the pass rates are for the ICU of that version. The record of each run tells the Node, Unicode and ICU versions.
- `graphemes` and `wordBreaks` use `Intl.Segmenter`, so they follow the ICU of the runtime. A different runtime can give different positions.
- `wordBreaksOf` joins the words with line feeds, because UAX #29 breaks before and after a line feed. A word that ends in a carriage return gets its own pass.
- `lineBreaks` uses its own table, so it follows the pinned version on each runtime.
- The pin is one version older than the latest Unicode version, because the runtime has Unicode 17.0.
- The test files examine rule pairs. They do not examine real text, and they do not examine the tailoring of a locale.
- With no option, `lineBreaks` uses the default rules with no tailoring. The rule LB1 reads a character of class SA as AL or CM. So a Thai run has no break inside it, as `LineBreakTest` expects.
- The option `complex` adds the breaks inside each run of class SA (Thai, Lao, Khmer and Myanmar). The hook `complexBreaks` takes them from `Intl.Segmenter` (T12b).
- `complexBreaks` uses the dictionary of the runtime, so the entry ships no dictionary. The places follow the ICU of the runtime, as `wordBreaks` does. The gate examines the default only.

## The differences of `canvasWords`

`canvasWords` has a different purpose. It copies the word cache of Blink, so that a sum of word widths is equal to the width of canvas `measureText`. It is not a UAX #29 function, and `paragraphOf` does not use its positions as line breaks.

`WordBreakTest` is therefore a report of the difference, not a gate of a pass rate. Each failed test goes in one class, and the gate stops on a class that has no reason in `reasons.json`.

| Class | Reason |
|---|---|
| `missing` | Blink ends a word only at a space, a tab, a zero width space or a CJK word start. So the boundaries of UAX #29 between letters, digits and punctuation are not there. |
| `extra` | Each space is a word alone, and a CJK or emoji character starts a word. UAX #29 keeps a mark or a joiner with the character before it. |
| `both` | The test has the 2 differences at different places. |
