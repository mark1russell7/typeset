# Font tables

The subpath `@mark1russell7/typeset/fonts` reads the widths of text from a font file. `@typeset/widths` compares those widths with canvas `measureText` in Chromium. The subpath `./measurer` gives those widths to the measurer of `@mark1russell7/layout-contract/text`.

## What the reader reads

- The reader reads TrueType, OpenType and WOFF2 files. A WOFF2 file needs a Brotli decompress function, for example `brotliDecompressSync` of `node:zlib`.
- It reads `head`, `hhea`, `maxp`, `hmtx`, `cmap` (formats 4 and 12), `GDEF`, the `kern` table (format 0) and the pair adjustments of the `kern` and `dist` features of `GPOS`.
- `measureWidth` adds the advances and the pair kerning, and scales the sum by the size divided by the units per em.
- A mark of `GDEF` has the advance 0, as in HarfBuzz. A lookup that ignores marks skips them.
- `measureWidth` applies the GSUB features, the joining forms of Arabic and the Indic shaper of Devanagari.

## Instances of variable fonts

A variable font has axes in `fvar`, for example the weight `wght`. Give the instance with the option `instance` of `readFont`, for example `{ wght: 400 }`.

- The reader normalizes each coordinate to the 2.14 grid, then applies the segment maps of `avar`.
- It adds the deltas of `HVAR` to the advances. It rounds each delta to whole font units, as FreeType does.
- It adds the VariationIndex deltas of the `GPOS` kerning from the store of `GDEF`. These deltas are not rounded, as in HarfBuzz.
- An axis that the instance does not give has its default value. A value outside the range of an axis is clamped.
- `font.at(instance)` gives the same font at a different instance, with no new read of the file.
- The epoch includes the coordinates of the instance, so each instance has a different epoch.
- The option `deltas: "exact"` keeps the fraction of each `HVAR` delta. The epoch then ends with `-exact`.
- A font with no `HVAR` table gets the advances of an instance from the phantom points of `gvar`. The advance delta is the x delta of the second phantom point minus the first.
- The reader counts the points of each glyph from `glyf` and `loca`, or from the transformed `glyf` table of a WOFF2 file.
- With `round`, the reader rounds the `gvar` advance delta to whole font units, and a half goes away from 0, as in HarfBuzz.
- The option `advances: "gvar"` uses the phantom points also when the font has `HVAR`. The epoch then ends with `-gvar`. The field `advanceSource` of the font tells the source.
- A composite glyph can have a component with the flag USE_MY_METRICS. The option `metrics: "component"` gives the glyph the advance of that component. The epoch then ends with `-metrics`.
- DirectWrite uses the advance of that component, and FreeType and CoreText use the advance of the glyph. In Source Sans 3, `i` is a composite glyph of `ı` and a dot. At 400, `ı` has 247 units and `i` has 246.
- The option `kerning: false` of `measureWidth` gives the sum of the advances with no pair kerning.
- Before the kerning, `measureWidth` applies the GSUB substitutions of the features `defaultFeatures`: `ccmp`, `locl`, `rlig`, `liga`, `clig`, `calt` and `rclt`.
- A browser applies these features when the page does not change them. The option `features` gives another list, and `[]` applies no feature of the list.
- The scripts `arab` and `syrc` also get the joining forms of the Arabic shaper of HarfBuzz. The option `joining: false` turns them off.
- `joiningForms` gives the form of each letter: `isol`, `fina`, `fin2`, `fin3`, `medi`, `med2` or `init`. It uses the state machine of `hb-ot-shaper-arabic.cc`.
- The state machine uses the joining type of each character. The table comes from `ArabicShaping.txt` of Unicode 18.0.0, for the Arabic and Syriac blocks.
- A mark is transparent, so the letters on the two sides of a mark join. A zero width non-joiner stops the joining.
- The lookups of a joining form apply only to the glyphs with that form. A mask for each glyph tells the form, as the feature masks of HarfBuzz do.
- `joiningStages` gives the order of HarfBuzz: `ccmp` and `locl`, then each form alone, then `rlig`, then `calt`, then the other features.
- A mark already has the advance 0 from `GDEF`, as HarfBuzz gives it for Arabic. The joining does not change this rule.
- The GSUB pass reads the lookup types 1 to 8 and the lookup flags. It does not read the `FeatureVariations` table.
- The GSUB pass shapes each word alone, and each space and each tab alone. Blink shapes the text of a canvas in the same words.
- Thus a GSUB context does not go across a space. Noto Sans KR has a `calt` context on the space. The browser does not apply it.

A browser uses the CSS weight for the axis `wght`, not the default instance of the font. For `font-weight: 400`, give `{ wght: 400 }`.

## The rounding mode

`measureWidth` has the option `rounding`.

- `exact` (the default) adds the advances with no rounding.
- `pixel` rounds each advance to 1/64 px and then to whole px, and rounds each kerning value to whole px. This mode gives the canvas widths of Chromium on Linux at the device scale 1.

## The sum of the advances

`measureWidth` has the option `sum`.

- `exact` (the default) adds the advances in double precision.
- `float32` gives the canvas widths of Blink with CoreText and DirectWrite. The option `shaping` then has no effect, because this sum always shapes each segment alone.
- With `float32`, each advance in single precision is cut to 1/65536 px. Blink gives HarfBuzz the advances in the 16.16 fixed point.
- HarfBuzz scales each kerning value at the scale of the size times 65536. It scales the value with `em_mult` and the variation delta with `em_scalef`.
- `canvasSegments` gives the segments of the text: the words of `canvasWords`, split where the bidi level changes, in the visual order.
- The sum of the positions of one segment is exact. The sum of the segments is in single precision.
- `bidiLevels` gives the levels of a paragraph with the base level 0, as a canvas with the direction `inherit` has them. It has no explicit embeddings and no brackets.
- The rounding `pixel` ignores the option `sum`. A sum of whole px is exact in single precision.

The fonts run 41562917143 on the head 65f5225 of typeset#36 measured the model of each arm:

| Arm | Engine row | Worst line | Worst paragraph | Worst page |
|---|---|---|---|---|
| `linux-1` | `freetype`, sum `exact` | 0.0000 px | 0.0000 px | 0.0000 px |
| `linux-2` | `freetype`, sum `exact` | 0.0000 px | 0.0000 px | 0.0000 px |
| `macos-2` | `coretext`, sum `float32` | 0.0000 px | 0.0000 px | 0.0000 px |
| `windows-1` | `directwrite`, sum `float32` | 0.0000 px | 0.0000 px | 0.0000 px |

- The numbers are for the 9 scripts Latin, Greek, Cyrillic, Arabic, Hebrew, Thai, Han, kana and Hangul, and for Source Sans 3 at 400 and 700.
- Before this change, the worst page on macOS and Windows was 0.10 to 3.01 px.
- The two Linux arms give the same summaries as the run 41556398022.
- The pages of Latin Extended (5.2 px) and Devanagari have other causes. T1e and T1d find them.

## The limit of the width

The function `widthBound(font, characters, options)` of `./fonts` gives a limit of the width with no measurement. For each text over the set `characters`, `measureWidth(font, text, size, options)` is at most `width(text.length, size)`. Give the same options to both functions. A text with another character has no limit.

Each output glyph comes from one input character, so the limit adds one maximum for each character:

- **Closure.** The roots are the glyphs of the set. Each GSUB rule of the features adds its output, and each ligature needs all its components. A rule in a context counts with no context, and each alternate counts.
- **Advance and count.** `advance` and `glyphs` are the largest sum of advances and the largest count of glyphs of one character. A multiple substitution adds its glyphs. A ligature counts for its first glyph.
- **Passes.** The plain shaper is one pass over the lookups. A shaper with stages gets 16 passes, because the largest shaper has 13 stages. A rule that expands its own glyph stops at this count.
- **Kerning.** `kerning` is the sum over the kerning lookups of the largest positive first value and second value, over the pairs of the closure.
- **Indic shaper.** Each character also gets a dotted circle, its decomposition, and each composite that a following mark can make. A composite is not always in the set: a nukta after U+0928 gives U+0929.

The joining shaper and `bidi.ts` change no code point. The value of `width` is `length` times the amount for one character, with these margins:

| Margin | Value | Reason |
| --- | --- | --- |
| `rounding: "pixel"`, each glyph | 0.5 + 1/128 px | FreeType rounds to 1/64 px, and Skia rounds to whole px |
| `rounding: "pixel"`, each glyph, when `kerning` is above 0 | 0.5 px | The model rounds the sum of the kerning of a glyph |
| `sum: "float32"`, each kerning position (two for each lookup) | 1.5 + 2^16 / `unitsPerEm` units of 1/65536 px, and 5 × 2^-24 × 2^15 font units | HarfBuzz rounds each value and delta, Blink cuts the scale, and a negative value gets no relative margin |
| `sum: "float32"`, all the text | × (1 + 2^-24)^(`length` + 6) | Each segment gets one rounding of the sum |
| Each row, all the text | × (1 + (2^13 + `length`) × 2^-53) | The double precision of the sums |

Use the limit as a fast path. When `width(text.length, size)` is at most the available width, the text fits, and no measurement is necessary. Measure the text only when the limit is above the available width. The limit is sound, not tight: it follows the widest character of the set. On the Latin, Greek, Cyrillic and Hebrew corpus at 16 px, the median of limit / width is below 2.3 with a proportional font. The test `packages/widths/src/bound.test.ts` examines all the scripts in the Fonts workflow.

## The font epoch

The epoch of a font is the revision of `head` and an FNV-1a hash of the data that gives the widths. This data is the units per em, the advances and the tables `cmap`, `GDEF`, `GPOS` and `kern`.

- A cache of widths can use the epoch as a key.
- The TrueType file and the WOFF2 file of one font give the same epoch. The checksum adjustment of `head` is not in the epoch, because `fontTools` changes it in a WOFF2 file.

## The comparison with the canvas

The workflow `fonts.yml` starts the comparison in CI, not on a local machine.

The comparison has four arms. Each arm is one job of the workflow.

| Arm | Runner | Device scale | Reference |
|---|---|---|---|
| `linux-1` | `ubuntu-latest` | 1 | `pixel`, only reported |
| `linux-2` | `ubuntu-latest` | 2 | `exact` |
| `macos-2` | `macos-latest` | 2 | `exact` |
| `windows-1` | `windows-latest` | 1 | `exact` |

1. `packages/widths/src/fetch.ts` downloads the 11 Noto fonts of the corpus and the extra font from `google/fonts` at a pinned commit. It checks the SHA-256 of each file.
2. On the arm `linux-1`, `fontTools` makes a WOFF2 file of each font.
3. `packages/widths/src/main.ts` measures each sample of the corpus (seed 1) with each font that covers its script, at each size from 10 px to 48 px. Each font uses the instance of the CSS weight 400.
4. It also measures the Latin samples with the extra font, Source Sans 3, at the weights 400 and 700. The default weight of this font is 200, and the corpus does not use it.
5. The command writes `font-widths.json` and uploads it as `font-widths-<arm>`.
6. The job `report` reads the files of all the arms with `packages/widths/src/score.ts`. It writes the outcomes of each prediction, `typeset-t1d-float-sum` included, to `outcomes.json`.

- The error is the table width minus the canvas width, in px. A record with a code point that the font has no glyph for is not in the numbers, because the canvas then uses a fallback font.
- Each record also has the width of the mode `pixel`.
- The page loads each font with the ranges of its axes as the descriptors of the FontFace. Thus Chromium uses the axis `wght`, not a synthetic bold.
- The field `woff2Mismatches` counts the widths of the WOFF2 files that are not equal to the widths of the TrueType files.
- Each platform has its own bounds. The score does not average the platforms. An arm with no file makes its outcomes fail.

### The fields that examine an arm

- `features.summary[group].shapedDefault` compares the default DOM width with the default model, with the GSUB pass. The DOM width is the reference.
- `features` is the DOM diagnostic of T1c. It measures the Latin lines, the kana lines and the lines of Source Sans 3 as DOM spans, in four feature settings. The settings are the default, no ligatures (`liga` and `calt` off), no kerning, and `text-spacing-trim: space-all`. Its `summary` compares each setting with the model that has the same features.
- `exactDeltaErrors` gives the worst line error of each script for the model with the `HVAR` deltas not rounded.
- `advanceModels` measures single characters and the space at 1000 px, for each font at the weights 400 and 700. It compares them with four models of the advances.
- The models are `HVAR` and `gvar`, each rounded and exact, and `componentRound`: rounded `HVAR` with `metrics: "component"`. The field `gvarAgainstHvar` gives the largest difference of the two exact models, in font units.
- The option `--engine` of `main.ts` selects the text engine of an arm: `freetype`, `coretext` or `directwrite`. `fonts.yml` gives it for each arm.
- The table `engines` of `@mark1russell7/typeset/fonts` gives the rules of each engine: the rounding of the deltas, the metrics of a composite glyph and the rounding of each advance.
- A caller spreads one row of `engines` into the options of `readFont` and of `measureWidth`. A new engine is a new row.
- `engineSummary` and `engineExtraSummary` give the line errors of the model of the engine of the arm. `summary` stays the model with no rounding.
- Each record has the field `float32`: the width with the sum `float32`. The model of an engine with the sum `float32` uses it.
- The option `shaping: "canvas"` of `measureWidth` shapes and kerns each word of `canvasWords` alone, as Blink does for the text of a canvas.
- `canvasWords` follows `NextWordEndIndex` of Blink. Each CJK character starts a word, so no kerning goes from one kana to the next kana.
- The records of the canvas use `shaping: "canvas"`. The model of the DOM diagnostic keeps `shaping: "dom"`, the default.
- Blink shapes all the text as one word when the space glyph is in a lookup of the font. No font of the corpus kerns the space, so the model does not examine this.
- `woff2GvarMismatches` compares the advances of the WOFF2 and TrueType files with `gvar` and the component metrics.
- `breakdown` gives the line errors of each font, weight and script, with the three worst samples and their texts.

- `fractions.line` counts the line widths on the grids of 1, 1/2, 1/4 and 1/64 px. Its `histogram` has 64 bins of 1/64 px. A width that the browser rounds is on a coarse grid.
- `instances` has one probe for each font and weight. The probe measures single characters at 200 px on the canvas. It finds the weight of the model from 100 to 900, in steps of 25, that is nearest to them.
- A probe holds when it finds the CSS weight and the model has that weight. The field `tied` counts the weights with the same error. Noto Sans Mono and Noto Emoji have advances that do not change with the weight, so they have ties.

## The result of T1

The scored run is [41488797104](https://github.com/mark1russell7/typeset/actions/runs/41488797104), on `main`. It gives 20160 widths of 1920 samples in headless Chromium 156 on Linux, at a device scale of 1.

| Script | Worst error of the line class, in px | Bound |
|---|---|---|
| latin | 31.6 | 0.5 |
| greek | 32.0 | 0.5 |
| cyrillic | 30.4 | 0.5 |
| hebrew | 107.1 | 0.5 |
| latin-extended | 31.6 | 1.0 |
| han | 21.9 | 0.1 |
| kana | 31.9 | 0.1 |
| hangul | 29.9 | 0.1 |
| arabic | 604.3 | more than 2 |
| devanagari | 26.4 | more than 2 |
| thai | 11.0 | no bound |

- The WOFF2 widths are equal to the TrueType widths. The count of mismatches is 0.
- The bounds for Latin, Greek, Cyrillic, Hebrew, the marks and CJK do not hold. The prediction gives 4 hits of 7 outcomes.
- Each canvas width of this run is a whole number of px. Chromium on Linux rounds each advance and each kerning value to a whole px when the device scale is 1. A model of this rounding gives the same width for 710 of 720 Greek lines and 636 of 720 Latin lines.
- Noto Sans Hebrew, JP and KR are variable fonts. Their default instance is the weight 100. Chromium uses the weight 400, but the reader uses the default instance.
- T1b adds the instances of variable fonts and a rounding mode. It also compares the widths on Linux at the device scale 2, on macOS and on Windows.
- With the instance 400 and the mode `pixel`, the T1 canvas widths agree on 720 of 720 lines for Latin Extended, Greek and Cyrillic. They agree on 240 of 240 for Hebrew, Han and Hangul. The remaining Latin errors come from ligatures.

## The result of T1b

The scored run is [41505142794](https://github.com/mark1russell7/typeset/actions/runs/41505142794), on `main`. The run on the pull request gave the same outcomes. The table gives the worst error of the line class, in px.

| Script | Bound | `linux-2` | `macos-2` | `windows-1` |
|---|---|---|---|---|
| latin | 0.5 | 31.6 | 2.689 | 2.689 |
| greek | 0.5 | 32.0 | 0.001 | 0.001 |
| cyrillic | 0.5 | 30.4 | 0.001 | 0.001 |
| hebrew | 0.5 | 14.588 | 0.391 | 0.001 |
| latin-extended | 1.0 | 31.6 | 0.001 | 0.001 |
| han | 0.1 | 4.95 | 0.169 | 0.000 |
| kana | 0.1 | 7.68 | 3.84 | 3.84 |
| hangul | 0.1 | 23.84 | 0.456 | 0.001 |
| Source Sans 3, weight 400 | 0.5 | 12.826 | 1.758 | 1.633 |
| Source Sans 3, weight 700 | 0.5 | 17.459 | 1.834 | 1.633 |

- The instance probe finds the CSS weight for each of the 13 fonts and weights, on each arm.
- The WOFF2 widths are equal to the TrueType widths. The count of mismatches is 0.
- On Linux at the device scale 2, each of the 4560 line widths is on the grid of 1/4 px. Thus Chromium on Linux also rounds the advances at this scale. The mode `pixel` models only the scale 1.
- On macOS and Windows, Greek, Cyrillic and Latin Extended agree to 0.001 px. Latin, kana and Source Sans 3 do not agree. T1c finds the causes. Ligatures are the first suspect for Latin.
- The prediction `typeset-t1b-instancing-platforms` gives 4 hits of 11 outcomes.

## The result of the T1c diagnostic

The fonts run 41510044683 on the head of typeset#24 measured the causes. The prediction `typeset-t1c-width-causes` hit 5 of 7 outcomes.

| Cause | macOS | Windows | Result |
|---|---|---|---|
| Latin with `liga` and `calt` off | 0.0153 px | 0.0153 px | Ligatures cause the Latin error of 2.689 px. |
| `HVAR` deltas not rounded, hangul and hebrew | 0.0009 and 0.0010 px | (0.001 px before) | Chrome on macOS does not round the deltas. |
| Source Sans 3 with `liga` and `calt` off, 400 and 700 | 0.17 and 0.32 px | 0.24 and 0.25 px | Ligatures cause most of the error. Approximately 0.3 px stays. |
| Kana, DOM against canvas | 3.83 px | 3.83 px | The kana error is in the canvas, not in the DOM. |
| Kana with kerning off | 0.26 px | 0.014 px | Kerning is not the cause of the kana error. |

- On Windows, the default DOM width of kana is within 0.015 px of the model. The canvas adds the 3.84 px.
- On Linux at the device scale 2, the DOM width is equal to the canvas width. The rounding at that scale causes the errors there.
- The model of the ligatures, the unrounded deltas on macOS and the kana canvas are the next T1c steps. Each step has its own prediction.

## The result of the GSUB pass

The fonts run 41520081253 on the head of typeset#25 measures the default model with the GSUB pass. The DOM width is the reference.

| Group | macOS | Windows | Result |
|---|---|---|---|
| Latin, default features | 0.0153 px | 0.0153 px | The GSUB pass gives the default DOM width. |
| Source Sans 3, 400 and 700 | 0.17 and 0.32 px | 0.24 and 0.25 px | No change. The error with kerning off is the same. |
| Kana, default DOM | 0.26 px | 0.015 px | No change. The GSUB pass does not change the kana lines. |
| Hangul, canvas lines | 0.46 px | 0.0014 px | No regression on Windows after the change to words. |

- The first run gave hangul an error of 48 px. The `calt` lookup 30 of Noto Sans KR changes the space between Hangul syllables.
- Blink shapes the text of a canvas word by word, with each space alone. Thus the GSUB pass shapes each word of `shapingWords` alone.
- The cause of the Source Sans 3 error is in the advances of the instance, not in GSUB or kerning. That cause is the next T1c step.
- The GSUB pass does not correct Arabic and Devanagari. These scripts need the joining forms and the Indic shaper. T1d adds the joining forms.

## The result of the instance advances

The fonts run 41527566935 measures single characters at 1000 px against each model of the advances. The fonts run 41541719153 on the head of typeset#27 measures the lines with the model of each arm.

| Platform | The model that matches each character | Source Sans 3 lines, 400 and 700 |
|---|---|---|
| Linux | rounded `HVAR` deltas | 12.8 and 17.7 px. The whole-px rounding of Linux gives this error. |
| macOS | exact `HVAR` deltas | 0.0008 and 0.0007 px, from 0.18 and 0.32 px |
| Windows | rounded `HVAR` deltas and the component metrics | 0.0007 px, from 0.24 px |

- The phantom points of `gvar` give the advances of `HVAR` in each of the 12 fonts. The worst difference is 0 font units.
- The glyph `i` of Source Sans 3 is a composite glyph of `ı`. DirectWrite uses the advance of `ı`, 247 units at 400. The glyph `i` has 246 units.
- The scripts of Windows and macOS have no regression. Each line error stays at 0.0014 px or less.

## The result of the engine table and the canvas words

The fonts run 41547699014 on the head of typeset#29 measures the model of the engine of each arm. The fonts run 41548747569 on the head of typeset#31 adds the canvas words.

| Arm | Engine | Worst line error of the 8 scripts and Source Sans 3 | Kana before | Kana after |
|---|---|---|---|---|
| `linux-1` | `freetype` | 0.0000 px | 4.0000 px | 0.0000 px |
| `linux-2` | `freetype` | 0.0000 px | 4.0000 px | 0.0000 px |
| `macos-2` | `coretext` | 0.0010 px | 3.8400 px | 0.0003 px |
| `windows-1` | `directwrite` | 0.0014 px | 3.8400 px | 0.0002 px |

- The 8 scripts are Latin, Latin Extended, Greek, Cyrillic, Hebrew, Thai, Han and Hangul.
- The kana error came from the shaping of the canvas. Blink shapes each kana as a word alone, so no kerning goes from one kana to the next kana.
- The DOM shapes all the run and kerns the kana. The model with `shaping: "dom"` stays at 0.0150 px on Windows.
- Devanagari stays open. It needs an Indic shaper. The next section has the result of Arabic.

## The result of the Arabic joining

The diagnosis of T1d measures each Arabic text of the corpus again, with the files of the fonts run 41548747569 on `main`. The model with no joining gives the same widths as the records.

| Arm | Lines within 0.01 px, no joining | Lines within 0.01 px, with joining | Worst line, with joining |
|---|---|---|---|
| linux-1 and linux-2 | 0 of 240 | 240 of 240 | 0 px |
| macos-2 and windows-1 | 0 of 240 | 240 of 240 | 0.0007 px |

- With no joining, the model is 28 % wider than the canvas on the average line. The isolated forms are wider than the joined forms.
- The marks of Noto Sans Arabic have the advance 0 in `hmtx` and the class 3 in `GDEF`. Thus the advances of the marks did not cause the error.
- The paragraphs and the pages have the same errors as the other scripts: 0.026 and 1.3 px on Windows. The canvas adds its widths in single precision.
- `GPOS` of Noto Sans Arabic has `kern`, `mark` and `mkmk`. The marks do not change an advance, and the font has no `curs` feature.

The fonts run 41553727572 on the head of typeset#34 confirms the diagnosis on the four arms of CI:

| Arm | Arabic lines within 0.01 px | Worst line | Worst paragraph | Worst page |
|---|---|---|---|---|
| `linux-1` | 240 of 240 | 0.0000 px | 0.0000 px | 0.0000 px |
| `linux-2` | 240 of 240 | 0.0000 px | 0.0000 px | 0.0000 px |
| `macos-2` | 240 of 240 | 0.0007 px | 0.0258 px | 1.2646 px |
| `windows-1` | 240 of 240 | 0.0007 px | 0.0258 px | 1.2646 px |

- The other scripts have no regression on the four arms.

## The Indic shaper

`indicShaper` gives the glyphs of a Devanagari word, as the Indic shaper of HarfBuzz gives them. The shaper uses the script tag `dev2` of the font. It has these steps:

1. The shaper puts a dotted circle in a vowel sequence that looks like a different vowel, for example `अ` and `ा`.
2. It normalizes the text. It decomposes the characters, and composes a nukta with its consonant again when the font has the glyph.
3. The syllable machine of HarfBuzz divides the text into syllables: consonant, vowel, standalone, symbol, broken and other clusters.
4. The shaper applies `locl` and `ccmp`. The lookups of `blwf`, `vatu`, `pstf` and `pref` then find the below-base and post-base consonants.
5. A broken cluster gets a dotted circle at its start.
6. The initial reordering finds the base consonant and the reph of each syllable. It sorts the glyphs by position and gives the masks of the features.
7. The shaper applies each basic feature in a stage alone: `nukt`, `akhn`, `rphf`, `rkrf`, `pref`, `blwf`, `abvf`, `half`, `pstf`, `vatu` and `cjct`.
8. The final reordering moves the pre-base matra after the last halant before the base. It moves the reph after the base.
9. The shaper applies `init`, `pres`, `abvs`, `blws`, `psts`, `haln` and the other features of the page in one stage. It does not apply `liga`.

- A lookup of an Indic feature matches only the glyphs of one syllable, as in HarfBuzz.
- Each glyph keeps the properties `SUBSTITUTED`, `LIGATED` and `MULTIPLIED` of HarfBuzz. The reordering uses them. A ligature has no category.
- The kerning also reads the `dist` feature of `GPOS`. Its pair lookup in Noto Sans Devanagari uses a mark filtering set.
- The option `indic: false` stops the shaper. Then Devanagari uses the one stage of the other scripts.
- HarfBuzz skips a ZWJ or a ZWNJ in some lookups. The model does not skip them. The corpus has no joiners.
- `indicSyllables` gives the syllables of a text. The tests use it with no font.


## The normalization (T1e)

HarfBuzz normalizes each text before GSUB. The model did this only in the Indic shaper. This caused the error of the Latin Extended pages, at most 5.2 px.

The steps come from `hb-ot-shape-normalize.cc`. `normalizeCodePoints` of `fonts/normalize.ts` applies them:

1. A character with a glyph and with no mark near it keeps its form. Each other character decomposes when the font has its parts.
2. The marks after a base go in the order of their combining classes. The shadda of Arabic and the points of Hebrew use the classes of HarfBuzz, not the canonical classes.
3. Each mark composes with its starter when the font has the glyph of the composite. A mark between them with the same class or a larger class blocks this.

An example: the text `u` and U+031B has two glyphs before this step. The font has a glyph for U+01B0, and that glyph is wider than the sum of the two glyphs.

- The script Hangul does not get this step. HarfBuzz uses the mode `NONE` for it.
- The form NFD of JavaScript gives the canonical order, so the module has a table only for Hebrew and Arabic.
- `widthBound` counts each part and each composite of the normalization, so it stays sound.

Two differences from HarfBuzz stay, and neither changes a width:

- HarfBuzz hides U+034F with a zero-width space glyph. The model keeps its own glyph with the advance 0.
- HarfBuzz moves some Arabic marks to the start of a mark run after the sort. The model keeps them in the sorted order. The glyphs are the same, in another order.

## The result of the Indic shaper

The diagnosis of T1d measures each Devanagari record of the fonts run 41568949837 again, with the model of the engine of each arm. The table gives the records within 0.01 px.

| Model | Arm | Words | Lines | Paragraphs | Pages |
|---|---|---|---|---|---|
| `main`, and the `dist` kerning alone | `linux-1` and `linux-2` | 216 of 240 | 187 of 240 | 7 of 240 | 1 of 240 |
| `main`, and the `dist` kerning alone | `macos-2` and `windows-1` | 216 of 240 | 174 of 240 | 6 of 240 | 0 of 240 |
| The shaper with no kerning | `linux-1` and `linux-2` | 240 of 240 | 234 of 240 | 210 of 240 | 56 of 240 |
| The shaper with no kerning | `macos-2` and `windows-1` | 240 of 240 | 234 of 240 | 192 of 240 | 30 of 240 |
| The shaper and the `dist` kerning | each arm | 240 of 240 | 240 of 240 | 240 of 240 | 240 of 240 |

- The glyphs of the model are the same as the glyphs of HarfBuzz for each of the 24442 canvas words of the Devanagari corpus.
- Without the shaper, the `dist` kerning does not change the fractions. With the shaper, the pages need it.
- The other scripts and Source Sans 3 have no regression on the four arms. The pages of Latin Extended keep their error of 5 px.
