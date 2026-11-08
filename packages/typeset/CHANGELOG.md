# Changes of `@mark1russell7/typeset`

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
