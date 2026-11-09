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
- Blink splits the words by level only when ICU gives the text the direction `mixed`. `isMixed` of `./fonts` follows `ubidi_getDirection` of ICU.
- A text with an LRI, an FSI or a PDI and no RTL character is not mixed. So the kerning goes across the isolate, as in Chromium (T13c).
- The sum of the positions of one segment is exact. The sum of the segments is in single precision.
- The internal function `bidiLevels` gives the levels of a paragraph with the base level 0, as a canvas with the direction `inherit` has them. It uses the rules of `./bidi` with a guess of the classes. `UNICODE.md` tells the limits.
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
- The pages of Latin Extended (5.2 px) and Devanagari had other causes. T1e and T1d found them.

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

1. The job restores the pinned fonts from the store of the repository. They are the 11 Noto fonts of the corpus, the extra font and the fonts of the sequences. `docs/PINNED.md` tells the rule.
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
- Blink shapes U+00AD, LRM, RLM, LRE to RLO, U+FEFF and U+FFFC of a canvas as a zero width space. Each one is a word alone, so the kerning and the joining stop there.
- ALM and the isolates stay in their word. The joining type of an isolate is `U`, so an isolate stops the Arabic joining.
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

One difference from HarfBuzz stays, and it does not change a width:

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
- The other scripts and Source Sans 3 have no regression on the four arms. All 720 pages of Latin Extended are now within 0.01 px on the four arms. The worst error is 0 px.

## Error bounds against HarfBuzz (T4)

T4 measures the error of the fast path against HarfBuzz. The fast path is the table model of `@mark1russell7/typeset/fonts`. The prediction is `typeset-t4-harfbuzz-bounds`.

The reference is HarfBuzz from the package `harfbuzzjs` at the exact version 1.6.4. Only the private package `@typeset/widths` has it, as a development dependency. The record gives the version of HarfBuzz from `versionString()`.

### The tiers

Each tier is a set of options of `measureWidth`. `packages/widths/src/bounds.ts` gives them.

| Tier | Options | What it adds |
|---|---|---|
| `advances` | `kerning: false`, `features: []`, `joining: false`, `indic: false` | The sum of the advances only |
| `kerned` | `features: []`, `joining: false`, `indic: false` | The pair kerning |
| `model` | the defaults | The full model: GSUB, the Arabic joining, the Indic shaper and the kerning |

Each tier has each row of the table `engines`: `freetype`, `coretext` and `directwrite`. The fields `deltas` and `metrics` of the row go to `readFont`. The fields `rounding` and `sum` go to `measureWidth`.

### The measurement

1. The test `packages/widths/src/bounds.test.ts` reads the line samples of the corpus (seed 1, 40 for each script).
2. It measures each line with each font of `fontsFor` at the weight 400, and with Source Sans 3 at the weights 400 and 700.
3. The sizes are 8, 10, 12, 13.5, 14, 15.333, 16, 24, 48, 72 and 96 px.
4. HarfBuzz shapes each word of `canvasWords` alone, as Blink does for a canvas. The model uses the shaping `canvas`. Under the sum `float32`, HarfBuzz and the model shape each segment of `canvasSegments` alone, as `measureWidth` does.
5. HarfBuzz uses the instance `cssInstance(weight)`, the OpenType script tag of the sample and the direction of the script.
6. The model error is the width of the model with the read rules of HarfBuzz, under the rule of the engine row, minus the HarfBuzz width under the same rule, in 1/64 px.
7. The rounding effect is the HarfBuzz width under the rule minus the HarfBuzz width with no rounding.
8. The read effect is the model width with the read rules of the row minus the model width with the read rules of HarfBuzz. Thus the model error and the read effect add up to the total error.

The function `ruledWidth` of `bounds.ts` applies the fields `rounding` and `sum` of a row to the HarfBuzz advances in px, as `measureWidth` applies them. The check `ruleReplica` applies `ruledWidth` to the advances of the model and compares it with `measureWidth`. The test fails at a difference of 1/64 px or more. The claims of the prediction are on the model error.

The reference of each size is HarfBuzz at the scale of Blink: `trunc(fround(size) × 65536)`. Each position is then in 1/65536 px. The reference is more precise than each rule that it measures. The field `reference` of each cell is `size-scale`.

The read rules are the fields `deltas` and `metrics` of a row. HarfBuzz reads a font with `deltas: round` and `metrics: own`, and it cannot follow another read rule. The row `coretext` keeps the fraction of a delta, and the row `directwrite` takes the metrics of a component. For example, the glyph `i` of Source Sans 3 at weight 400 has 246 units under `own` and 247 under `component`. Thus the model error uses the read rules of HarfBuzz, and the read effect keeps the rest.

The read effect is the model of the engine rule against itself, with no external reference. This is an open gap. T4b measures each engine row against its real engine.

A line with a missing glyph stays in the statistics, because the model and HarfBuzz both use the glyph 0. The field `missing` of each cell gives the count of these lines.

### The record

The file `harfbuzz-bounds.json` (schema `typeset-harfbuzz-bounds/1`) has these fields:

- `harfbuzz`: the version of HarfBuzz and of `harfbuzzjs`. `runId` is the value of `GITHUB_RUN_ID`.
- `cells`: one cell for each script, font, weight, size, tier and engine row. A cell has `n`, `missing`, `worst` and `p99` of the model error. Its fields `rounding` and `readEffect` have the same statistics of the rounding effect and of the read effect. Its field `referencePrecision` has the largest difference of the upem reference and the size-scale reference in font units, and the count of samples over the bound.
- `worst` is the error with the largest absolute value, with its sign. `p99` is the 0.99 quantile of the absolute errors.
- Each statistic has a 95 % percentile bootstrap interval of `rigor-statistics`, with 2000 runs. A seed of `rigor-generators` comes from the name of the cell.
- `glyphMatch`: for the tier `model`, the share of the canvas words that have the glyphs of HarfBuzz, for each script and each font. Each share has its Wilson interval.
- `checks`: the results of the reference check, of the scaling check, of `engineRowsEqual`, of `ruleReplica`, of `roundingSameForEachTier` and of `readSum`. The check `readSum` gives the largest difference of the model error plus the read effect and the total error. HarfBuzz has no tiers, so the rounding effect of a cell does not change with its tier.
- `referencesDisagree`: the clusters on which two references disagree, and each word with the glyphs of each reference. T1f gives the decision on the one rule.
- `knownOpen`: the scripts with an open error. No script is open now. No test gates on it.

### The precision of the reference

The check `referencePrecision` shapes each sample also at the scale of the units per em. Then each position is a whole number of font units. For each cell, the difference of the two references must be at most 0.5 unit for each kerned glyph, plus the rounding of the size scale for each glyph. The record gives the count of samples over this bound. No test gates on it.

### The reference check

Before the record is read, two checks examine HarfBuzz as the reference:

- Noto Emoji has no `GPOS` table and no `kern` table. At the default instance and at the scale of the units per em, HarfBuzz must give the `hmtx` advance of each glyph of the emoji corpus. The test reads `hmtx` directly, not through the model.
- For each font of the set at the default instance, the HarfBuzz advance at the scale `round(size × 64)` must be `hmtx × size × 64 / unitsPerEm` at each size of the sweep. The tolerance is one unit of the scale and the rounding of the scale.

### CI

The workflow `fonts.yml` runs the test on the arm `linux-1` only, after the test of the measurer. HarfBuzz and the model run in Node, so the platform does not change the numbers. The step uploads `harfbuzz-bounds.json` as the artifact `harfbuzz-bounds`.

### The result

The committed record is `packages/widths/data/harfbuzz-bounds.json`, with one line for each cell. The check `engineRowsEqual` tells if the 3 engine rows give the same statistics. The command `pnpm --filter @typeset/widths bounds-table` writes this table from the record. Each tier has a column of the worst model error. The last column is the worst rounding effect. Each value is the worst over the fonts, the weights, the sizes and the engine rows, with its 95 % interval, in 1/64 px, and the place of the cell.

<!-- bounds-table:start -->
| Script | Model error, `advances` | Model error, `kerned` | Model error, `model` | Rounding effect | Read effect |
|---|---|---|---|---|---|
| arabic | 76873.7 [63074.3, 76873.7] (noto-sans-arabic 400, 96 px, coretext) | 76873.7 [63074.3, 76873.7] (noto-sans-arabic 400, 96 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-arabic 400, 96 px, coretext) | 748.3 [679.1, 748.3] (noto-sans-arabic 400, 13.5 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 8 px, freetype) |
| cyrillic | 1344.0 [1280.0, 1344.0] (noto-sans 400, 96 px, freetype) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 48 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 48 px, coretext) | -1945.6 [-1945.6, -1894.4] (noto-sans-mono 400, 14 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 8 px, freetype) |
| devanagari | -3904.0 [-3904.0, 2496.0] (noto-sans-devanagari 400, 96 px, freetype) | -3904.0 [-3904.0, 2496.0] (noto-sans-devanagari 400, 96 px, freetype) | 3136.0 [0.0, 3136.0] (noto-sans-devanagari 400, 96 px, freetype) | -1082.9 [-1082.9, -544.3] (noto-sans-devanagari 400, 48 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 8 px, freetype) |
| emoji | 0.0 [0.0, 0.0] (noto-emoji 400, 8 px, freetype) | 0.0 [0.0, 0.0] (noto-emoji 400, 8 px, freetype) | 0.0 [0.0, 0.0] (noto-emoji 400, 8 px, freetype) | -2335.6 [-2335.6, -2212.4] (noto-emoji 400, 15.333 px, freetype) | 0.0 [0.0, 0.0] (noto-emoji 400, 8 px, freetype) |
| greek | 3904.0 [3072.0, 3904.0] (noto-serif 400, 96 px, freetype) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 96 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 96 px, coretext) | 2048.0 [2022.4, 2048.0] (noto-sans-mono 400, 16 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 8 px, freetype) |
| han | 0.0 [0.0, 0.0] (noto-sans-sc 400, 8 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-sc 400, 8 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-sc 400, 8 px, coretext) | 2497.9 [2400.0, 2497.9] (noto-sans-sc 400, 13.5 px, freetype) | 21.7 [13.8, 21.7] (noto-sans-sc 400, 96 px, coretext) |
| hangul | -0.1 [-0.1, -0.1] (noto-sans-kr 400, 96 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-kr 400, 96 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-kr 400, 96 px, coretext) | -1624.6 [-1624.6, -1491.8] (noto-sans-kr 400, 13.5 px, freetype) | -58.3 [-58.3, -52.3] (noto-sans-kr 400, 96 px, coretext) |
| hebrew | 1984.0 [1408.0, 1984.0] (noto-sans-hebrew 400, 96 px, freetype) | -0.1 [-0.1, 0.0] (noto-sans-hebrew 400, 48 px, coretext) | -0.1 [-0.1, 0.0] (noto-sans-hebrew 400, 48 px, coretext) | -933.6 [-933.6, -527.6] (noto-sans-hebrew 400, 24 px, freetype) | -50.0 [-50.0, -42.2] (noto-sans-hebrew 400, 96 px, coretext) |
| kana | 832.0 [448.0, 832.0] (noto-sans-jp 400, 96 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-jp 400, 8 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-jp 400, 8 px, coretext) | 2489.9 [2400.0, 2489.9] (noto-sans-jp 400, 13.5 px, freetype) | 31.6 [15.8, 31.6] (noto-sans-jp 400, 96 px, coretext) |
| latin | 1728.0 [1408.0, 1728.0] (source-sans-3 700, 96 px, freetype) | 344.0 [184.3, 344.0] (noto-serif 400, 96 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 96 px, coretext) | -2022.4 [-2022.4, -1996.8] (noto-sans-mono 400, 14 px, freetype) | 40.6 [20.0, 40.6] (source-sans-3 700, 96 px, coretext) |
| latin-extended | 1216.0 [640.0, 1216.0] (noto-serif 400, 96 px, freetype) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 48 px, coretext) | -0.1 [-0.1, -0.1] (noto-sans-mono 400, 48 px, coretext) | -2022.4 [-2022.4, -1920.0] (noto-sans-mono 400, 14 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 8 px, freetype) |
| thai | 256.0 [128.0, 256.0] (noto-sans-thai 400, 96 px, freetype) | 256.0 [128.0, 256.0] (noto-sans-thai 400, 96 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 96 px, coretext) | -754.7 [-754.7, -563.7] (noto-sans-thai 400, 72 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 8 px, freetype) |

The source is the record of the CI run 41766190315.
<!-- bounds-table:end -->

The Fonts run 41766190315 gave this record, with HarfBuzz 15.0.0:

- The worst model error of the tier `model` is 0.13 in 1/64 px for each script except Devanagari.
- The worst error of Devanagari comes from one word. The two references disagree on that word. The model is correct, and the next section tells why.
- The glyph ids agree on 795 of 795 words of Latin Extended, and on 319 of 320 words of Devanagari. The run 41731795116 gave 783 of 795 before T1e.
- In 198 of the 2277 cells, each line sample has a missing glyph. These are all the cells of emoji, and the cells of Han in Noto Sans JP.
- HarfBuzz and the model both use the glyph 0 for a missing glyph. So a zero error in those cells tells less than in other cells.
- The largest precision error of the reference stays in its bound in all 2277 cells.
- The read effect has no external reference until T4b.

## Each engine row against its engine (T4b)

T4 compares the model with HarfBuzz. T4b compares each engine row with the real engine: the canvas of Chromium on the runner of the arm.

- Each arm of the Fonts workflow already measures the canvas, so T4b adds no browser code.
- `engineBoundCells` gives one cell for each arm, script, font, weight and size. Each cell has the worst error and the 0.99 quantile in 1/64 px, with 95 % intervals.
- The records have the 6 sizes of the corpus. The 5 other sizes of T4 have no canvas width, so T4b does not examine them.
- The model and Chrome agree on the word of T1f, so T4b keeps that word.
- The statistics leave out the records with a missing glyph, because the canvas then uses a fallback font. These are 2070 records on each arm, 8280 in all.
- All 552 cells give a worst error of 0 in 1/64 px. The pixel rounding of `linux-1` and `linux-2` hides small differences, so these 2 arms are a weaker test.

### The read effect

The read effect of T4 is the model width minus the model width with exact deltas. Until T4b, no external reference examined it.

- The effect that the canvas shows differs from the effect of the model by the model error.
- So a small effect tells nothing. `readCheck` examines only the cells with an effect above 1/64 px.
- The check holds when the model error of each such cell is at most 10 % of its effect.
- The effect comes before the rounding of the row, so the arms do not give the same evidence.

| Arm | Evidence |
|---|---|
| `windows-1` | Strong. The advances are not rounded, so the canvas shows the whole effect. |
| `linux-1`, `linux-2` | Weak. The rounding `pixel` hides the effect, so a small error proves little. |
| `macos-2` | None. CoreText uses exact deltas, so the effect is 0. |

The record gives the check for each arm in the field `readCheckOfArm`.

### The result

<!-- engine-table:start -->
| Script | `linux-1` | `linux-2` | `macos-2` | `windows-1` | Read effect |
|---|---|---|---|---|---|
| arabic | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans-arabic 400, 10 px, freetype) |
| cyrillic | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) |
| devanagari | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans-devanagari 400, 10 px, freetype) |
| emoji | 0.0 [0.0, 0.0] (noto-emoji 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-emoji 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-emoji 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-emoji 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-emoji 400, 10 px, freetype) |
| greek | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) |
| han | 0.0 [0.0, 0.0] (noto-sans-sc 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-sc 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-sc 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-sc 400, 10 px, directwrite) | -231.9 [-231.9, -58.2] (noto-sans-sc 400, 48 px, freetype) |
| hangul | 0.0 [0.0, 0.0] (noto-sans-kr 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-kr 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-kr 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-kr 400, 10 px, directwrite) | 2030.4 [1936.6, 2030.4] (noto-sans-kr 400, 48 px, freetype) |
| hebrew | 0.0 [0.0, 0.0] (noto-sans-hebrew 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-hebrew 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-hebrew 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-hebrew 400, 10 px, directwrite) | 1245.7 [1048.3, 1245.7] (noto-sans-hebrew 400, 48 px, freetype) |
| kana | 0.0 [0.0, 0.0] (noto-sans-jp 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-jp 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-jp 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-jp 400, 10 px, directwrite) | -214.2 [-214.2, -192.5] (noto-sans-jp 400, 48 px, freetype) |
| latin | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, directwrite) | 440.9 [405.0, 440.9] (source-sans-3 400, 48 px, directwrite) |
| latin-extended | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans 400, 10 px, freetype) |
| thai | 0.0 [0.0, 0.0] (noto-sans-thai 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 10 px, freetype) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 10 px, coretext) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 10 px, directwrite) | 0.0 [0.0, 0.0] (noto-sans-thai 400, 10 px, freetype) |

The source is the record of the CI run 41787004366.
<!-- engine-table:end -->

## The dotted circle after an independent vowel (T1f)

T1f examined U+0906 U+0948, the one word on which the model and Chrome disagree with HarfBuzz of the T4 record.

**The decision: the dotted circle is correct, and the model does not change.** The difference comes from the build of harfbuzzjs, and not from a version of HarfBuzz.

- **The rule exists.** `hb-ot-shaper-vowel-constraints.cc` of HarfBuzz 15.0.0 lists 21 Devanagari pairs, and U+0906 U+0948 is one of them. The commit that Chromium uses has the same entry.
- **harfbuzzjs does not run the rule.** Its `Makefile` sets `HB_TINY`. In `hb-config.hh`, that option sets `HB_MINI`, `HB_NO_LEGACY`, `HB_NO_OT_SHAPE_FALLBACK` and `HB_NO_OT_SHAPER_VOWEL_CONSTRAINTS`. `config-override.h` of harfbuzzjs 1.6.4 does not change them.
- **A local run agrees.** harfbuzzjs 1.6.4 puts no dotted circle on any of the 21 pairs. It puts one before a lone vowel sign, because that step of the Indic shaper is separate.
- **Chromium has the rule.** Chromium 156.0.8078.4 pins HarfBuzz at `f5efbbef`, 334 commits before 15.0.0. Its `BUILD.gn` does not set these options. Blink uses the shaper `ot`, because the flag `HarfRustShaping` has the status `test`.

Nobody ran a full build of HarfBuzz 15.0.0 for this work. The evidence for the full build is its source text and the result of Chrome.

`HB_TINY` also removes other rules. They do not change a width of the T4 record:

- The `kern` table and the AAT tables: none of the 12 fonts has them.
- The Hebrew fallback: it needs a font with no GPOS `mark`, and Noto Sans Hebrew has `mark`.
- The Thai fallback: it needs a font with no GSUB script `thai`, and Noto Sans Thai has it.
- The Arabic fallback: it needs a font with no joining forms, and Noto Sans Arabic has them.
- The fallback mark positions: they run only for a font with no GPOS, and they set the advance of a mark to 0. Noto Emoji is the one font with no GPOS. The 160 emoji samples of the corpus have no marks, so T4 does not examine this case.

The Devanagari row of the T4 table keeps this one word, so its worst error is a limit of the reference. A test in `indic.test.ts` pins the glyphs of the pair.

## The shaper fallback (T6)

The fast path does not shape all text. T6 detects text that the model cannot measure with trust, and it gives that text to a shaper of the host.

`packages/typeset` has no wasm and no new dependency for this work. The host supplies the shaper.

### Two corrections of the model

- A default ignorable takes no advance, and the kerning skips it. The set comes from `hb-unicode.hh`. It is not the Unicode property.
- A substitution that changes the glyph of a default ignorable keeps the glyph visible, as in HarfBuzz.
- A nonspacing mark takes no advance when the font has no GDEF glyph classes. This is the rule of the synthetic classes of HarfBuzz.
- A mark with a combining class after a base takes no advance when the font has no GPOS. This is the rule of the fallback mark position.
- Each rule uses the shaper of the script. The tables `noMarkZero` and `noFallbackPosition` in `font.ts` list the exceptions.

Noto Emoji is the one font of the 12 with no GPOS. Its script is `Zyyy`, so HarfBuzz uses the default shaper, and the fallback mark position is on.

The cmap of Noto Emoji has only three marks. U+FE0E and U+FE0F take no advance. U+20E3 has the class 0, so it keeps its advance of 2600. A mark that is not in the font takes no advance in both shapers.

A probe compared the model with HarfBuzz on fonts with their GPOS or GDEF removed. These are the results:

- 115 of 135 rows are equal under the default flags of the probe.
- Each of the 20 other rows starts with a mark. `HB_BUFFER_FLAG_BOT` makes HarfBuzz insert U+25CC there, and the model does not.
- With no flags, HarfBuzz and the model are equal on 615 of 615 rows.
- The Blink flags for U+25CC are not verified.

### What stays different from HarfBuzz

- The input of a GSUB rule does not skip a joiner. So a ligature across U+200D does not form in the model. The backtrack and the lookahead skip each joiner, except in the Indic shaper.
- The Indic path has no mark rule. A mark at the start of a word in the shaping `dom` has no base.
- The shaper of HarfBuzz for a script with no fallback position does not apply the `kern` table. The model applies it.
- HarfBuzz keeps the advance of a GDEF mark under the Hangul shaper. `Font.advance` gives 0.

### Shaping risks

The function `shapingRisks(font, text, options)` gives a list of `ShapingRisk`. Each risk has a code, an offset and a length in UTF-16 units.

| Code | Meaning |
| --- | --- |
| `missing-glyph` | The font has no glyph for a cluster after normalization. |
| `unshaped-script` | The model has no shaper for the script. |
| `emoji-zwj` | A pictograph sequence has U+200D. |
| `variation-selector` | A selector is present. The model does not read cmap format 14. |
| `keycap` | A digit, `#` or `*` comes before U+20E3. |
| `flag` | Two regional indicators are adjacent. |
| `tag` | A pictograph has a tag sequence. |
| `positioning` | A `kern` or `dist` lookup outside PairPos changes the width of a word. |

The list of scripts is Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Khmer, Myanmar, Tibetan, Mongolian, NKo and Mandaic. The list does not have other scripts of the Universal Shaping Engine, for example Balinese and Javanese.

An empty list is not a proof of a correct width.

The code `positioning` fires on no local font. In the six local fonts, one such lookup changes an advance, and it changes the advance of a mark. HarfBuzz zeroes that mark after GPOS, so the width stays the same. Only synthetic fixtures show this code.

### The fallback of `fontAdvance`

The option `fallback` of `fontAdvance` is a function with the form of `AdvanceFn`. Under the shaping `canvas`, it measures each word that `shapingRisks` flags.

- The model measures each other word. A flagged word goes whole to the fallback.
- A dispatch for each word keeps the separator law of the rope. A dispatch for each run breaks it.
- The shaping `dom` does not use the fallback. There, one word changes the shape of its neighbors.
- In a mixed text, the script tag of a word comes from the word alone. So one face measures `Hello नमस्ते` with `latn` and `deva`.
- A text of one script keeps one measurement and one tag when it has no risk.

### What is measured

- The file `packages/widths/src/sequences.ts` has the sequence list: joiners, variation selectors, keycaps, flags, tags, bidi controls, U+034F next to a kerning pair, and words of Bengali, Khmer and Mongolian.
- The first run against HarfBuzz found 5 words with no risk and a wrong width, all in Noto Sans Arabic. U+2066 to U+2069 did not break a join, and a joiner stopped the context of a GSUB rule. The model now does what HarfBuzz does.

- Six of the 12 fonts are the local record: Noto Emoji, Noto Sans, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans Hebrew and Source Sans 3.
- The model now hides U+034F, as HarfBuzz does. On 5040 corpus values, 8 values changed. Each is in Source Sans 3 and moves toward HarfBuzz. The largest change is 0.415 px at 12 px.
- In 1440 runs of 480 samples, no risk other than `missing-glyph` fired.
- `missing-glyph` fires on real samples. It flagged 94 runs of emoji in Noto Emoji, and 64 runs of `latin-extended` in Source Sans 3.
- So those samples go to the fallback when the host supplies one. A stub fallback got no call on samples with no risk.
- With a fallback, 200 edit sequences on mixed text stay within 1e-6 px of the flat width under the rules that `text.test.ts` covers. These rules have no `float32` sum.

### What is not measured

- The six other fonts are not examined. So Thai, Han, kana and Hangul have no false alarm record.
- A rope with the `float32` sum of `coretext` and `directwrite` goes above 1e-6 px. The worst value is 1.53e-4 px on mixed text.
- That drift is not from T6. A plain `measureWidth` of Latin text drifts to 2.29e-4 px with no fallback.
- There is no record of a real shaper as the fallback. The tests use a stub.
- The accuracy of a host shaper against Chrome is not measured. A later part of T6 gives that record.

## Font stacks (T11 and T11b)

A font stack is a list of corpus fonts in the order of a CSS `font-family` list. The file `packages/widths/src/stacks.ts` has the 5 stacks.

### The widths (T11)

- The Fonts job measures each stack text on a canvas with the CSS list of the stack. The model is `fontAdvance` with the same faces.
- A `covered` text has a glyph for each code point in a font of the list. A `drawn` text keeps the words as the corpus draws them.
- Chromium draws a code point that no font of the list has with a font of the system. The CSS list does not name that font.
- So an `uncovered` cell takes the canvas width of each missing run out of the error. The rest is the `residual`.
- The limit of each cell is 1.28/64 px.

### The line breaks (T11b)

- The Fonts job puts each stack text into a DOM box with the CSS list of the stack. The sizes are 10, 16 and 48 px.
- The box widths are 8 and 20 times the size. The line height is 1.25 times the size.
- The lines of Chromium come from the client rectangle of each grapheme cluster.
- The model is `layoutText` of `@mark1russell7/layout-contract`, with `fontAdvance` under the engine row of the arm.
- In an `uncovered` text, the model gets the canvas width of each missing run, after its cluster. Without it, the break has no defined answer.
- A record with different lines has a cause. `opportunity`: Chromium breaks at a position that is not white space.
- `width`: each line of Chromium ends at white space, so a width moves the break.
- `layoutText` 0.5.3 breaks only at white space. Chromium also breaks between ideographs, kana, Hangul syllables and Thai words, as UAX #14 and a dictionary tell.
- So a text of these scripts gives `opportunity` records until `layoutText` uses the break positions of `lineBreaks` (T12).
- A `width` record also has `widthLine`: the first different line of the model and its model width. Compare it with the box width.

### The first run of the breaks (42410280511)

The 4 arms give the same counts, with a difference of 3 records or less. These are the counts of `linux-1`:

| Stack | Covered: same, `opportunity`, `width` | Uncovered: same, `opportunity`, `width` |
|---|---|---|
| `latin-han` | 25 of 144, 119, 0 | 25 of 144, 119, 0 |
| `han-first` | 54 of 180, 126, 0 | 18 of 144, 126, 0 |
| `latin-arabic-emoji` | 118 of 180, 62, 0 | 65 of 144, 75, 4 |
| `latin-indic-thai` | 171 of 180, 9, 0 | 135 of 144, 9, 0 |
| `all-scripts` | 37 of 180, 143, 0 | 0 of 144, 144, 0 |

- Each `opportunity` record has a break of Chromium inside a word of the model. Each such break is in one of 3 classes.
- Han, kana and Hangul: Chromium breaks between two ideographs, two kana or two Hangul syllables. UAX #14 gives these breaks (class `ID`).
- Emoji and pictographs: Chromium breaks between two pictographs with no space. UAX #14 gives these breaks too.
- Thai: Chromium breaks between two Thai words. The dictionary of ICU finds the words. UAX #14 alone does not (class `SA`).
- The `width` records are in `latin-arabic-emoji` only: 4 of 144 uncovered on Linux, 3 on macOS and Windows, and 2 of 180 covered on macOS and Windows.
- In each `width` record, the model puts one more word on a line with Arabic, Latin and emoji words. Chromium puts it on the next line.

### The margins of the `width` records (42415353609)

The field `widthLine` gives the model width of the first different line. The box width minus that width is the margin. The records are in 3 classes.

| Class | Records | Margin | Cause |
|---|---|---|---|
| A space before a skin tone modifier | `drawn:19` in each arm, 3 sizes | 21 to 120 px | A break opportunity, not a width |
| Rounding of each segment | `mixed:15` on macOS and Windows, 2 sizes | -0.012 and -0.019 px | `layoutText` rounds each segment to 1/64 px |
| A system fallback font | `drawn:5` on Linux | 13 px | The stack does not cover the pictographs of the sample |

- `Intl.Segmenter` gives a space and a modifier after it (" 🏼") as one word segment. `layoutText` breaks only at a segment that is all white space. Thus the model has no break there. UAX #14 gives a break before the modifier, so Chromium breaks.
- The cause of those records was `width` because the old cause split the text at each white space. The cause uses the split of `layoutText` now, so these records are `opportunity` records. T12 and layout-contract#255 fix them.
- A negative margin tells that the model line is wider than the box: 200.0116 px in a box of 200 px. The sum of the rounded segments fits, but the line does not. The fix goes to `layoutText` of layout-contract.
- The `drawn` samples are the uncovered set. No font of the stack has their characters, so Chromium takes a font of the system. The model cannot know that font. These records stay in the uncovered cells.

### The gate of the stacks

- The report job of the Fonts workflow starts `packages/widths/src/stack-gate.ts` on the files of the 4 arms.
- A width cell fails above 1.28/64 px. An arm with no record of the stacks fails.
- A break cell passes when at least 97 of each 100 records have the same lines as Chromium.
- A cell under the bar fails, except a known gap of `breakGaps`. A gap names its items and their due date.
- A known gap holds only when the bar holds with the `opportunity` records counted as the same. A `width` record is never excused.
- A listed cell that passes the bar fails as a stale gap. So the list stays true.
- The Thai cells stay known gaps until T12b ships the Thai word breaks. A known gap is not a pass.
