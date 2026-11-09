# Changes of `@mark1russell7/typeset`

## 0.5.3

This version adds the hyphen set of Spanish (T14f, PR 133). Before 1.0.0, a new feature increases PATCH. The other entries do not change.

### The new entry `./hyphen/es`

- `./hyphen/es` holds `hyph-es.tex` (MIT) of Javier Bezos, with the limits 2 and 2. It is 15349 `gzip` bytes in the weight gate.
- The site gives Spanish in the section "Justified lines".
- The gate of the repository scores the set on a sample of the Spanish Wiktionary, one form for each lemma. Confirmed is 0.9984 and found is 0.9483.
- On the entries with a hint of an editor, confirmed is 0.9802 and found is 0.8593. `docs/HYPHENATION.md` of the repository tells the groups of hints.

Runtime dependencies: no change against `0.5.2` (`@mark1russell7/collections` `^0.10.0`, `@mark1russell7/rigor-generators` `^0.1.0`).

## 0.5.2

This version corrects 18 words of the hyphen set of `fr` (T14d, PR 117). Before 1.0.0, a fix increases PATCH. The public API does not change.

### The fix (T14d)

- The TeX patterns of `fr` gave a wrong hyphen place in 18 words of Lexique 3.83, of the class `mute-e`, for example `restent` and `stagnent`.
- `./hyphen/fr` holds these 18 words as exceptions. Each exception gives the places of the reference rules, with the evidence of each word in `data/hyphen/fr-layer.json` of the repository.
- The gate of the repository counts the defects of the set on all of Lexique 3.83 at each run. The count is 0.
- Other words do not change. The found rate on the word list of `fr` goes from 0.8279 to 0.8278.

Runtime dependencies: no change against `0.5.1` (`@mark1russell7/collections` `^0.10.0`, `@mark1russell7/rigor-generators` `^0.1.0`).

## 0.5.1

This version corrects a defect of the total-fit breaker (T15b). Before 1.0.0, a fix increases PATCH. The public API does not change.

### The fix (T15b)

- On a text with no glue, total fit did not end in practice: its steps grew as the cube of the length. A page of Han text has a break after each character and no glue.
- The search stops at a line that is too wide also without the text of its penalty. A later break of that line can only be wider.
- The breaks do not change: the 300 corpus paragraphs of `justify.test.ts` give the same breaks as before.
- A property test of `fast-check` holds each breaker to a count of item reads that is linear in the item count. The inputs are text with no glue, all penalties and wide boxes, in 12 scripts.

Runtime dependencies: no change against `0.5.0` (`@mark1russell7/collections` `^0.10.0`, `@mark1russell7/rigor-generators` `^0.1.0`). `fast-check` is a dev dependency only.

## 0.5.0

This version changes the widths of `fontAdvance` for a list of fonts (T11, PR 66). Before 1.0.0, a change of behavior increases MINOR. The public API does not change.

### The change of behavior (T11)

- Each cluster takes the first font of the list that holds it, as Blink falls back. In 0.4.0, a mark that the first font lacks got the `.notdef` advance of that font.
- Script runs and emoji runs come before the fallback clusters. A mark of a script keeps its own run, and an emoji run starts at a lone skin tone modifier.
- A font holds a cluster also by its composed form (NFC), as the normalizer of HarfBuzz composes it.
- The measurer before this change gave 96 of 120 stack cells more than 1.28/64 px from a Chromium canvas with the same family list. The final head of PR 66 gives 0 of 120.

Runtime dependencies: no change against `0.4.0` (`@mark1russell7/collections` `^0.10.0`, `@mark1russell7/rigor-generators` `^0.1.0`).

## 0.4.0

The release train changes the range of `@mark1russell7/collections` to a version outside the old range. The public types name @mark1russell7/collections, so its new version outside the old range can change them.

### Breaking

- The range `^0.9.3` of `@mark1russell7/collections` in `dependencies` does not hold `0.10.0`, so it changes.

Runtime dependencies: `@mark1russell7/collections` from `^0.9.3` to `^0.10.0`. `@mark1russell7/rigor-generators` `^0.1.0` does not change.

## 0.3.0

This version changes the canvas widths of `./fonts` for texts with bidi controls, and adds justified lines and the subpaths `./hyphen`. Before 1.0.0, a change of behavior increases MINOR.

### The change of behavior (T13c)

- The canvas model shapes U+00AD, LRM, RLM, LRE to RLO, U+FEFF and U+FFFC as a zero width space, as Blink does. Each one is a word alone, so the kerning and the joining stop there.
- `canvasWords` and `canvasSegments` of `./fonts/inspect` give these characters as words alone. In 0.2.0, LRE to RLO stayed in the word before them.
- `canvasSegments`, the pixel sum and the sum `float32` split a text by bidi level only when ICU gives it the direction `mixed`. A text with an LRI, an FSI or a PDI and no RTL character stays one run, and keeps its kerning.
- In 0.2.0, the Chromium probe of PR 92 measured errors of up to 65 px on these texts. In 0.3.0, the probe of PR 95 gives each of the 36 texts within 1/64 px on Linux, macOS and Windows.
- The score of the Fonts job fails when a probe row of the group `bidi` is more than 0.5 px off on an arm.

Runtime dependencies: no change against `0.2.0` (`@mark1russell7/collections` `^0.9.3`, `@mark1russell7/rigor-generators` `^0.1.0`).

### Justified lines and hyphen patterns (T14, PR 94)

- `Glue` has the optional fields `stretch` and `shrink`. With no stretch and no shrink, each breaker gives the same breaks as 0.2.0, on 300 corpus paragraphs.
- Total fit uses the adjustment ratio of Knuth and Plass. It does not choose a line that needs more shrink than its glue has, while a feasible set of breaks exists.
- `./breaking` exports `adjustmentRatio`, `adjustmentRatios` and `worstRatio`, the measure of the justified edge. `docs/BREAKING.md` defines it.
- The new subpath `./hyphen` gives `hyphenator`. The subpaths `./hyphen/en-us`, `./hyphen/de` and `./hyphen/fr` give the TeX patterns of tex-hyphen, pinned by commit and SHA-256.
- The `gzip` weight of each language: `en-us` 18202 bytes, `de` 123851 bytes, `fr` 5568 bytes. No set is in the root entry or in `./breaking`.

## 0.2.0

This version adds the subpath `./bidi` and three exports of `./segmentation`. It also changes the output of `canvasSegments` and of the sum `float32` of `./fonts` for some texts. Before 1.0.0, a change of behavior increases MINOR. The version 0.1.9 had the same code, and it was not published.

### The change of behavior

- `canvasSegments` of `./fonts/inspect` and the sum `float32` follow explicit controls, marks of direction and paired brackets. The old model ignored them.
- A text with one of these characters can get other segments and another width in single precision.
- On the corpus of the Fonts run 42481402694, each of the 224 cells of the engine has the same error on the 4 arms.
- The new order is the order of UAX #9, which Blink also uses. No browser has compared these texts yet. The roadmap item T13b adds that compare.

Runtime dependencies: no change against `0.1.8` (`@mark1russell7/collections` `^0.9.3`, `@mark1russell7/rigor-generators` `^0.1.0`).

### The full bidi algorithm in `./bidi` (T13)

- The new subpath `./bidi` has the rules P1 to L2 of UAX #9 for Unicode 17.0.0: explicit embeddings, isolates and paired brackets (rule N0).
- Its exports are `resolveText`, `resolveLevels`, `visualIndexes`, `visualOrder`, `bidiClass`, `bracketOf`, `removed`, `unicodeVersion` and the types `BidiClass`, `BidiParagraph`, `ParagraphDirection` and `ResolvedBidi`.
- `BidiTest.txt` passes 256747 of 256747 tests for the levels and for the order, in each paragraph direction. `BidiCharacterTest.txt` passes all 91707 tests. The record is CI run 42481403118.
- The canvas model of `./fonts` uses the same rules. The section above tells the change of behavior.
- The Fonts run 42481402694 compares the model with the base run on the 4 arms. Each of the 224 cells of the engine has the same error.

### The hook `complex` of `lineBreaks` (T12b)

- `lineBreaks(text, options)` takes the optional `LineBreakOptions`. Its hook `complex` gives the word places inside a run of class SA, for Thai, Lao, Khmer and Myanmar.
- `complexBreaks` is a hook from `Intl.Segmenter` of the runtime. With no hook, the places do not change.

### A batch form of `wordBreaks` (T12d)

- `wordBreaksOf(words)` gives the word boundaries of each word of a list in one pass. Each entry equals `wordBreaks` of its word.
- The Bench run 42485515480 times the 1465 words of 1000 short Latin labels: the batch takes 491.4 µs, and one call for each word takes 4668.0 µs, a ratio of 0.105.

### The weight against `0.1.8`

These are the `gzip` bytes of each entry, from the Bench run 42485515480 of the T12d pull request. The full rules make `./fonts` larger, and the root `.` exports `./fonts`.

| Entry | `gzip` bytes | Growth |
|---|---|---|
| `.` | 29583 | 1496 |
| `./breaking` | 1423 | 0 |
| `./fonts` | 22997 | 1516 |
| `./fonts/inspect` | 12051 | 1542 |
| `./measurer` | 24244 | 1515 |
| `./bidi` | 4070 | new |
| `./segmentation` | 5042 | 455 |
| `./text` | 3146 | 0 |

## 0.1.8

This version changes no export and no type. Its change is inside `./segmentation`. A change with no effect on the public API increases PATCH.

### A short path of `lineBreaks` (T12c)

- `lineBreaks` gives the places of a text with only ASCII letters, digits and spaces from a short path. The places do not change.
- The rules of UAX #14 also use a table of the ASCII classes, so they do not read the full table for a code point under 128.
- `LineBreakTest.txt` of Unicode 17.0.0 passes 19338 of 19338 tests. A property test compares the short path with the full rules on 12000 generated texts.
- The Bench run 42456960316 times the line places of 1000 short labels of the corpus. They take 74.9 µs, and a split at white space takes 61.2 µs, a ratio of 1.224. Before the change, the ratio was 9.37 (run 42445210578).

### The weight against `0.1.7`

These are the `gzip` bytes of each entry, from the Bench run 42456960316 of the T12c pull request.

| Entry | `gzip` bytes | Growth |
|---|---|---|
| `.` | 28087 | 0 |
| `./breaking` | 1423 | 0 |
| `./fonts` | 21481 | 0 |
| `./fonts/inspect` | 10509 | 0 |
| `./measurer` | 22729 | 0 |
| `./segmentation` | 4587 | 167 |
| `./text` | 3146 | 0 |

## 0.1.7

This version changes no export and no type. Its change is inside `./text`. A change with no effect on the public API increases PATCH.

### The rope of `./text` (T2b)

- The `Text` rope keeps its API and its `Summary`. Its tree uses the summary-tree functions of `@mark1russell7/collections` (`^0.9.3`), a new dependency.
- The local tree of the rope is gone. An edit finds its leaf by the length, changes the leaf, and joins the leaves at the seams.
- One insert in a rope of 99999 code units uses at most 2 width calls, on a rope that has the measures of its leaves. The record is `test/rope-calls.json`.
- The Fonts run 42440764598 examines the rope with the real fonts. `text.test.ts` passes 14 of 14 tests on each of the 4 arms.

### The weight against `0.1.6`

These are the `gzip` bytes of each entry, from the Bench run 42440764584 of the T2b pull request.

| Entry | `gzip` bytes | Growth |
|---|---|---|
| `.` | 28087 | 1607 |
| `./breaking` | 1423 | 0 |
| `./fonts` | 21481 | 0 |
| `./fonts/inspect` | 10509 | 0 |
| `./measurer` | 22729 | 0 |
| `./segmentation` | 4420 | 0 |
| `./text` | 3146 | 1650 |

The root entry `.` contains `./text`, so it grows by approximately the same bytes. The cap of `.` is 33648 bytes.

## 0.1.6

This version adds a public entry and two exports. It removes no export. Before `1.0.0`, a new feature increases PATCH.

### A new entry: `./segmentation`

- `./segmentation` gives `graphemes`, `wordBreaks`, `lineBreaks` and `unicodeVersion`. They follow UAX #29 and UAX #14 (T12).
- CI examines them against the official test files of Unicode. Each line of `GraphemeBreakTest`, `WordBreakTest` and `LineBreakTest` passes.
- The weight of the entry is 4420 `gzip` bytes and 10306 minified bytes (CI run 42422258304). Its limit in the weight gate is 10000 `gzip` bytes.
- `ParagraphOptions` has a new optional hook `breaks`. It gives the break places inside a word, for example from `lineBreaks`.

### Fixes (T16)

- The Indic syllable search is one linear pass. Before this fix, a long Devanagari word with no break took a time of the order of the square of its length.
- `./fonts/inspect` gives `indicSyllables` and the type `IndicSyllableType`.
- The font parse reads `16px/ 1.2 Arial` as the family `Arial`, not `1.2 Arial`.
- The cache of font instances has a bound of 256 instances.

### The weight against `0.1.5`

These are the `gzip` bytes of each entry, from the Bench run 42428838514 of the T16 pull request.

| Entry | `gzip` bytes | Growth |
|---|---|---|
| `.` | 26480 | 519 |
| `./breaking` | 1423 | 33 |
| `./fonts` | 21481 | 457 |
| `./fonts/inspect` | 10509 | 631 |
| `./measurer` | 22729 | 472 |
| `./segmentation` | 4420 | new |
| `./text` | 1496 | 0 |
