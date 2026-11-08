# Changes of `@mark1russell7/typeset`

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
