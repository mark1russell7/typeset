# typeset

Fast, exact and incremental text measurement and line breaking, for every layout engine.

The goal is to solve text measurement fully: each method is measured, each error has a stated bound, and each result is repeatable.

## The idea

A `Text` value knows its own size. It is a tree of pieces (a rope), and each piece keeps a summary: its width, its first and last glyph, and its break opportunities. The width is a monoid:

```
w(a + b) = w(a) + w(b) + kern(last(a), first(b))
```

Thus a concatenation adds two numbers, and an edit updates only the path from the changed piece to the root. No text is measured again.

- **Advances come from the font file.** The package reads the advance of each glyph and the kerning pairs once per font. A canvas is not necessary.
- **Sizes scale.** Without hinting, an advance scales linearly with the font size, so one table serves all sizes. A test checks this for each font.
- **Fonts can change.** Each font has an epoch. When a font loads or changes, its cache is dropped and built again.
- **Line breaks are searches.** Prefix sums of the advances give each greedy break in O(log n). Other breakers (Knuth-Plass total fit, balanced) use the same summaries.
- **Hard scripts fall back.** Complex scripts, ligatures and contextual forms go to a shaper (HarfBuzz). The fast path states where it applies.

## Status

T7, T9, T1 and T1b are done. They are the corpus generator (`packages/corpus`), the bench (`packages/bench`) and the font tables (`packages/fonts`). The font tables read variable fonts, and CI compares them on four platforms. [docs/BENCH.md](docs/BENCH.md) and [docs/FONTS.md](docs/FONTS.md) tell how they work. [docs/ROADMAP.md](docs/ROADMAP.md) has the plan.

## License

MIT
