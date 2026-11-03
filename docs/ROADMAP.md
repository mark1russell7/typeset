# Roadmap

Each item has a prediction before its code: the claims, how each claim is measured, its base and its noise.

| Id | Item | Priority | Status | Depends on |
|---|---|---|---|---|
| T1 | Font tables: read the glyph advances and the kerning pairs from a font file (TrueType, OpenType, WOFF2); a font epoch; a bench against canvas `measureText` on a corpus of fonts | P1 | done | T9 |
| T1b | Variable fonts (`fvar`, `avar`, `HVAR`) at the weight of the CSS; a rounding mode to whole px; the comparison on Linux at the device scale 2, on macOS and on Windows, with a bound for each platform | P1 | done | T1 |
| T1c | The errors that remain after T1b. The GSUB pass (typeset#25), the instance advances (typeset#27), the table of engine rules (typeset#29) and the words of a canvas (typeset#31) close them. Each script except Arabic and Devanagari is now at most 0.0014 px on each platform | P1 | done | T1b |
| T1d | Arabic joining forms and an Indic shaper in the model, so that the widths of Arabic and Devanagari text are correct. Arabic is done: 240 of 240 lines within 0.01 px on the four arms (typeset#34). On macOS and Windows, the sum `float32` of the canvas gives the paragraphs and the pages within 0.01 px. The Indic shaper for Devanagari is next | P1 | in progress | T1c |
| T2 | The `Text` rope: the width monoid, concatenation, slice and edit with summary updates; property tests (the rope width is equal to the width of the flat string) | P1 | later | T1 |
| T3 | Line breakers as strategies: greedy, Knuth-Plass total fit and balanced, with the measures line count, raggedness and time, on the corpus and in the CI bench. `@mark1russell7/typeset` 0.1.0 has them in the subpath `./breaking`, see [BREAKING.md](BREAKING.md). `layoutText` of `@mark1russell7/layout-contract` 0.3.2 uses them, with the same output as 0.2.21 and the option `breaker` (layout-contract#148). The rope (T2) makes it incremental | P1 | done | T1c |
| T4 | Error bounds: the error of the fast path against a shaper (HarfBuzz) for each script and font, in 1/64 px; size scaling and hinting per font | P1 | later | T1 |
| T5 | The bound fast path: width at most length × maximum advance of a declared character set, plus a margin per character | P2 | later | T1 |
| T6 | Shaper fallback for complex scripts, ligatures, bidi and emoji | P2 | later | T4 |
| T7 | A text corpus generator (scripts, lengths, fonts, edit sequences) and the CI bench | P1 | done | |
| T8 | An adapter for the `/text` measurer interface of `@mark1russell7/layout-contract` | P1 | later | T2 |
| T9 | Use the rigor homes: `rigor-generators` for the random numbers of the corpus, `rigor-statistics` for the statistics of the bench | P1 | done | T7 |
| S1 | The site on GitHub Pages: the font tables against canvas `measureText` in the browser, a sweep of the corpus, and the grid of a CI fonts run (typeset#35, typeset#37) | P1 | done | T1c |
