# Roadmap

Each item has a prediction before its code: the claims, how each claim is measured, its base and its noise.

| Id | Item | Priority | Status | Depends on |
|---|---|---|---|---|
| T1 | Font tables: read the glyph advances and the kerning pairs from a font file (TrueType, OpenType, WOFF2); a font epoch; a bench against canvas `measureText` on a corpus of fonts | P1 | done | T9 |
| T1b | Variable fonts (`fvar`, `avar`, `HVAR`) at the weight of the CSS; a rounding mode to whole px; the comparison on Linux at the device scale 2, on macOS and on Windows, with a bound for each platform | P1 | done | T1 |
| T1c | The errors that remain after T1b: a model of the rounding on Linux at each device scale; the Latin, kana and Source Sans 3 errors on macOS and Windows | P2 | later | T1b |
| T2 | The `Text` rope: the width monoid, concatenation, slice and edit with summary updates; property tests (the rope width is equal to the width of the flat string) | P1 | later | T1 |
| T3 | Line breaking on the rope: greedy by prefix sums, Knuth-Plass total fit, balanced; the measures line count, raggedness and time | P1 | later | T2 |
| T4 | Error bounds: the error of the fast path against a shaper (HarfBuzz) for each script and font, in 1/64 px; size scaling and hinting per font | P1 | later | T1 |
| T5 | The bound fast path: width at most length × maximum advance of a declared character set, plus a margin per character | P2 | later | T1 |
| T6 | Shaper fallback for complex scripts, ligatures, bidi and emoji | P2 | later | T4 |
| T7 | A text corpus generator (scripts, lengths, fonts, edit sequences) and the CI bench | P1 | done | |
| T8 | An adapter for the `/text` measurer interface of `@mark1russell7/layout-contract` | P1 | later | T2 |
| T9 | Use the rigor homes: `rigor-generators` for the random numbers of the corpus, `rigor-statistics` for the statistics of the bench | P1 | done | T7 |
