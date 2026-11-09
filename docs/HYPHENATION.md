# Hyphenation

The subpaths `@mark1russell7/typeset/hyphen/<language>` give hyphen places for the hook `hyphenate` of `paragraphOf`. Each language has its own subpath, so an application pays only for the languages that it imports.

```ts
import { knuthPlass, paragraphOf } from "@mark1russell7/typeset/breaking";
import { hyphenate } from "@mark1russell7/typeset/hyphen/en-us";

const paragraph = paragraphOf(text, { widthOf, hyphenate, stretch: 4, shrink: 2.5 });
const breaks = knuthPlass.breaks(paragraph, 480);
```

## The entries

| Subpath | What it has |
| --- | --- |
| `./hyphen` | `hyphenator(set)`, the small matcher of Liang, and the types `PatternSet` and `HyphenSource`. It has no language data. |
| `./hyphen/en-us` | American English. |
| `./hyphen/de` | German, with the spelling of 1996. |
| `./hyphen/fr` | French. |
| `./hyphen/es` | Spanish. |

- Each language subpath exports `hyphenate` for the hook, and `source` with the origin and the result of the set.
- The root entry, `./breaking` and each other entry have no language set. A test of `packages/conformance` bundles each entry and examines its input files.
- `hyphenate` finds each run of letters of a word, so a word can have punctuation and capitals. The offsets are offsets in the word as the hook gets it.
- The table of a set comes at the first use of `hyphenate`, so an import costs no time.
- A run with a lowercase form of another length stays whole, because its offsets are not known.

## The sets

The patterns come from the project `hyphenation/tex-hyphen`, at the commit `5684c0f51c0b81133db2efbe60a408b4155a3ff5`. `packages/conformance/src/hyphen/sources.ts` has the SHA-256 of each file.

| Language | File | License of the patterns | Minified bytes | Gzip bytes |
| --- | --- | --- | --- | --- |
| `en-us` | `hyph-en-us.tex` | The all-permissive notice of Gerard D.C. Kuiken | 33537 | 18202 |
| `de` | `hyph-de-1996.tex` | MIT | 281320 | 123851 |
| `fr` | `hyph-fr.tex` | MIT | 12943 | 5655 |
| `es` | `hyph-es.tex` | MIT | 46015 | 15349 |

- These weights include the matcher. The matcher alone is 884 minified bytes and 539 gzip bytes.
- The weights use the measure of the weight gate: a bundle for the browser by esbuild, minified, then gzip at level 9.
- The header of each pattern file stays at the top of its module as a legal comment. The bundles keep this comment, so the license stays with the data. The weights include it.
- The `gzip` bytes come from the zlib of Node 24. Another zlib can give other bytes, so the gate accepts a difference of 1 %. The minified bytes are exact.

## The word lists

Each set has a test on a sample of 10000 words of a word list from another project. The patterns do not come from these lists.

| Language | Word list | License of the list | Confirmed | Found | Found, all places | F0.5 |
| --- | --- | --- | --- | --- | --- | --- |
| `en-us` | Moby Hyphenator II | Public domain | 0.9537 | 0.7575 | 0.6559 | 0.9068 |
| `de` | German Wiktionary, `kaikki.org` extract of 2026-10-30 | CC BY-SA 4.0 | 0.9904 | 0.9607 | 0.9607 | 0.9843 |
| `fr` | Lexique 3.83, column `orthosyll` | CC BY-SA 4.0 | 0.9993 | 0.8278 | 0.7889 | 0.9595 |
| `es` | Spanish Wiktionary, `kaikki.org` extract of 2026-10-30 | CC BY-SA 4.0 | 0.9984 | 0.9483 | 0.8972 | 0.9880 |

The values are different measures:

- `confirmed` is the share of the places of the set that the list holds (precision). It tells how often a hyphen of the set is correct.
- `found` is the share of the places of the list that the set gives (recall). The left and right limits of the set remove places from this count, because the engine does not give a place there.
- `foundAll` is the same share over all places of the list, also the places outside the limits.
- `fHalf` is the F-score with beta 0.5. It gives `confirmed` more weight than `found`.

A wrong hyphen is an error on the page, but a missed place is only a looser line. So the objective of each set is precision first. A new set must keep `confirmed` at its floor or higher, and then find as many places as possible.

The test gates `confirmed` at 0.95 or more. Each language also has a floor for `confirmed` and for `found`, in the field `floor` of `hyphenFiles`. The floors are a ratchet: a new set must hold or raise both rates. So a gain in one rate does not hide a loss in the other. The gate and a test fail when a rate is below its floor.

A dictionary and a pattern set can use different rules for a word. The lists also have errors, so these values are not exact measures of correctness.

### The Spanish list and its hints

The header of `hyph-es.tex` names its authors, Javier Bezos and Francesc Carmona, and names no word list. Bezos wrote the patterns by hand from the rules of Spanish. So the Spanish Wiktionary is independent of the data of the set.

The hyphen fields of the Spanish list come from a module of rules. On each Spanish page, the template `pron-graf` uses the module `Módulo:generar-pron/es`, and the module makes the syllables from the title. An editor changes the result only with the hint `ayuda`. So most of the list is the output of rules, and a match on it shows that two sets of rules agree.

The gate splits the list in two parts with the pages dump of 2026-10-01, pinned by its SHA-256:

1. Part (a) has the entries with a hint, the judgement of an editor: 53640 entries of 6109 lemmas.
2. Part (b) has the entries that the module makes from the title alone.

The lemma of an inflected form is its word in `form_of` of the extract. The hints cluster under few lemmas: 60 % of the entries of (a) have the first part `des`. So each sample is by lemma. It has one seeded form of each lemma that it draws, and the bootstrap of (a) is over lemmas. The main sample has 10000 lemmas, and the sample of (a) has all 6109 lemmas of (a).

| Part | Words | Confirmed | Found | 95 % interval of confirmed | 95 % interval of found |
| --- | --- | --- | --- | --- | --- |
| (a), with a hint | 6109 | 0.9802 | 0.8593 | 0.9781 to 0.9822 | 0.8550 to 0.8636 |
| (b), from the module alone | 9527 | 0.9993 | 0.9542 | | |

The file `data/hyphen/es-hints.json` gives the counts of each group of hints, and the record gives the rates of each group on the sample of (a). A hint that marks a boundary goes to the group of its first part. A hint with other letters than the title is a respelling.

| Group | Entries of (a) | Words of the sample | Confirmed | Found | Confirmed, both RAE places | Found, both RAE places |
| --- | --- | --- | --- | --- | --- | --- |
| `des` | 32223 | 2459 | 0.9915 | 0.8646 | 1.0000 | 0.8720 |
| `a` | 4856 | 670 | 1.0000 | 0.9720 | 1.0000 | 0.9720 |
| `en` | 3279 | 251 | 1.0000 | 0.7874 | 1.0000 | 0.7874 |
| `de` | 2129 | 208 | 0.9829 | 0.8340 | 0.9829 | 0.8340 |
| `re` | 1446 | 144 | 1.0000 | 0.8131 | 1.0000 | 0.8131 |
| `in` | 989 | 258 | 1.0000 | 0.7532 | 1.0000 | 0.7532 |
| `sub` | 620 | 86 | 0.8498 | 0.7682 | 1.0000 | 0.9040 |
| other boundaries | 7560 | 1525 | 0.9834 | 0.8778 | | |
| respellings | 538 | 508 | 0.7258 | 0.7329 | | |

The *Ortografía de la lengua española* (RAE and ASALE, 2010) accepts two divisions of a prefixed word at the end of a line. Its part on the hyphen at the end of a line gives the division by syllables and the division by parts of the word. An example is `de-sam-pa-ro` and `des-am-pa-ro`. The hints of (a) mark the parts.

The columns "both RAE places" also count the place one letter before the prefix boundary. That place counts when the prefix ends with a consonant before a vowel, or before `l` or `r` of an onset. With that place, `des` and `sub` go to a confirmed of 1.0000. So their misses are a difference of convention, not defects of the set.

The 538 respellings have 509 lemmas. Examples are the loanword `mouse` with the hint `maus`, and `México` with the hint `Méjico`. Their rates show the real wrong hyphens that a reader sees. An exception list made from the hints is item T14g. It builds the list from one half of the lemmas and scores the other half.

The floors of `es` are the first measure. The field `hinted.floor` of `hyphenFiles` holds the floors of (a).

### Other free sets for `en-us`

The `en-us` set is `hyph-en-us.tex`, the TeX file `ushyphmax.tex` with the patterns of Knuth. It is the largest free set of `patgen` for American English. Two other free sets do not meet the floors. Each value is on all 138735 single words of Moby in lowercase:

| Set | License | Confirmed | Found | F0.5 |
| --- | --- | --- | --- | --- |
| `hyph-en-us.tex`, the set of `typeset` | Notice of Gerard D.C. Kuiken | 0.9544 | 0.7573 | 0.9072 |
| `hyph_en_US.dic` of LibreOffice (the TeX file `hyphen.tex` and the TUGboat exception log) | BSD style | 0.9579 | 0.7543 | 0.9089 |
| `hyph-en-gb.tex`, British rules | MIT | 0.8215 | 0.6470 | 0.7795 |

The LibreOffice set has a higher `confirmed` but a lower `found`, so it does not hold the ratchet. The British set uses other rules.

### The training of `en-us`

No free set meets the floors of `en-us`. So a workflow in CI trains a set with `patgen` on half of Moby Hyphenator II. The workflow is `.github/workflows/hyphen-train.yml`, and the command is `src/hyphen/train-main.ts`.

- The training reads the single lowercase words of all of Moby. It removes each word that Moby gives in two or more different forms.
- A seeded hash of each word puts the word in the training half or in the held-out half. The seed is in `data/hyphen/en-us-train-params.json`. The order of the file does not change the halves.
- `patgen` trains on the training half only. The parameters of each level are in the same file.
- The command scores the trained set and the shipped set on the held-out half, and on the TUGboat list `ushyphex.tex`. The TUGboat list does not come from Moby.
- For each rate, a paired bootstrap over the words gives a 95 % interval of the difference. The bootstrap comes from `@mark1russell7/rigor-statistics`.
- The patterns go to `data/hyphen/en-us-moby.pat`, and the rates go to `data/hyphen/en-us-train.json`. The workflow fails when a new training gives other bytes.

The trained set passes when all these conditions are true:

1. On the held-out half, the low end of the interval of the `found` gain is above 0. A rise inside the noise is not a gain.
2. On the held-out half, `confirmed` of the trained set is at least `confirmed` of the shipped set.
3. On the TUGboat list, both rates of the trained set are at least the rates of the shipped set. A gain on Moby with a loss on this list is a fail.

The field `verdict` of the record gives each condition. A set that passes becomes the shipped set only after a separate change, with its `gzip` bytes at most 2 times the bytes of today.

The first training of 2026-11-09 has 4 levels and 5036 patterns. Its patterns have 15686 `gzip` bytes. It fails condition 3:

| List | Words | Set | Confirmed | Found | F0.5 |
| --- | --- | --- | --- | --- | --- |
| Held-out half of Moby | 68000 | trained | 0.9799 | 0.8252 | 0.9445 |
| Held-out half of Moby | 68000 | shipped | 0.9571 | 0.7626 | 0.9106 |
| TUGboat list | 1505 | trained | 0.7526 | 0.5635 | 0.7053 |
| TUGboat list | 1505 | shipped | 0.8503 | 0.6473 | 0.8001 |

On the held-out half, the 95 % interval of the `found` gain is 0.0604 to 0.0649. The interval of the `confirmed` gain is 0.0216 to 0.0241. On the TUGboat list, the interval of the `found` gain is -0.1087 to -0.0584. The interval of the `confirmed` gain is -0.1166 to -0.0786.

The shipped set `ushyphmax.tex` comes from the TUGboat exception log of 1989. Its header tells that it finds all places of the words of that log. So the TUGboat list is not independent of the shipped set. The ruling of 2026-11-09 keeps the fail, and the shipped set does not change.

The rule for each check list: a check list must be independent of the training data of each set that it compares. Read the source of each set before you choose a check list.

### The cause of the TUGboat loss

The command `src/hyphen/cause-main.ts` measures the cause of the loss. The job `cause` of the same workflow starts it. It writes `data/hyphen/en-us-cause.json`.

- First, Moby as a set gives the places of its forms inside the limits. The TUGboat list scores it on the 740 words in both lists.
- Then the syllables of Webster's Unabridged Dictionary of 1913 score each set. Project Gutenberg 29765 gives the text, with a pinned URL and SHA-256.
- Webster gives 87448 forms after the removal of 181 conflicts. The score uses the 50095 forms that are also in Moby.

The run of 2026-11-09 gives these rates:

| List | Words | Set | Confirmed | Found | F0.5 |
| --- | --- | --- | --- | --- | --- |
| TUGboat list | 740 | Moby | 0.8661 | 0.9633 | 0.8839 |
| TUGboat list | 740 | trained | 0.8280 | 0.5957 | 0.7681 |
| TUGboat list | 740 | shipped | 0.9060 | 0.6518 | 0.8404 |
| Webster 1913 | 50095 | Moby | 0.9666 | 0.9661 | 0.9665 |
| Webster 1913 | 50095 | trained | 0.9646 | 0.7939 | 0.9248 |
| Webster 1913 | 50095 | shipped | 0.9398 | 0.7593 | 0.8971 |

On the TUGboat list, Moby itself has `confirmed` 0.8661, below the 0.9060 of the shipped set. So a part of the loss comes from the convention of Moby, not from the training. On Webster, the interval of the `confirmed` gain of the trained set is 0.0231 to 0.0264. The interval of its `found` gain is 0.0318 to 0.0375.

Moby and Webster agree on 0.966 of the places in both directions. The documents of Moby do not name its source. This near agreement tells that Moby can come from Webster. Then Webster is not independent of the training data of the trained set, and the rule above removes it as a check list.

The ruling on the cause keeps `en-us` closed at the current floors, and the shipped set does not change:

1. Webster is not independent, so its score does not count.
2. On the TUGboat list, the only independent list, the trained set loses on `confirmed`: 0.8280 against 0.9060.
3. A wrong hyphen is an error that the reader sees. A missed hyphen gives only a looser line. So `confirmed` counts more than `found`.
4. The convention of Merriam-Webster is not the target. Liang's patterns come from it, so it does not separate the two sets.

A third list, independent of Merriam-Webster and of Moby, can open `en-us` again. Item T14e scores the sets on the hyphen fields of the English Wiktionary. The trained set must lead on `confirmed`, with an interval above 0.

### The missed places

A missed place is a place of the list, within the limits of the set, that the set does not give. `countMisses` puts each missed place in one class:

- `shift`: the set gives a place one letter before or after it.
- `silent`: the set gives no place in the word.
- `other`: the set gives other places in the word, but none next to it.

| Language | Missed places | `shift` | `silent` | `other` |
| --- | --- | --- | --- | --- |
| `en-us` | 5069 | 1461 | 1094 | 2514 |
| `de` | 1163 | 879 | 27 | 257 |
| `fr` | 3508 | 15 | 667 | 2826 |

The record `data/hyphen-misses.json` in `packages/conformance` holds these counts. The gate and a test fail when the record is not current. In `de`, most misses are a `shift`: the list and the set put the hyphen at different sides of one letter. In `en-us` and `fr`, most misses are `other`.

### The causes of the misses

The record also gives the cause of each missed place, from the digits of the patterns at the place:

- `uncovered`: no pattern gives a digit at the place.
- `inhibited`: the largest digit at the place is even. A pattern stops the hyphen there.
- `exception`: the word is an exception of the set, so the patterns do not apply.

To find the digits, the gate changes each even digit `d` of the set to `d - 1`. This change keeps the order of the digits. So with the changed set, `hyphenator` gives each place where a pattern gives a digit.

| Language | Class | `uncovered` | `inhibited` | `exception` |
| --- | --- | --- | --- | --- |
| `en-us` | `shift` | 706 | 754 | 1 |
| `en-us` | `silent` | 486 | 608 | 0 |
| `en-us` | `other` | 1191 | 1322 | 1 |
| `de` | `shift` | 105 | 774 | 0 |
| `de` | `silent` | 7 | 20 | 0 |
| `de` | `other` | 55 | 202 | 0 |
| `fr` | `shift` | 0 | 15 | 0 |
| `fr` | `silent` | 0 | 666 | 1 |
| `fr` | `other` | 0 | 2826 | 0 |

In `fr`, a pattern stops each missed place, except in `stagnent`. That word is an exception of the layer.

The patterns of `fr` stop a hyphen before a last syllable with a mute `e`, for example `achemi-ne` (the pattern `4ne.`). The list of Lexique has a place there. So the `fr` misses come from a different rule, not from a pattern that is missing. In `de`, patterns stop 774 of the 879 places of `shift`. In `en-us`, the causes of each class are near half and half.

### The reference classes

A reference class is a set of places where the list and the rule of the patterns differ by a known rule of typography. The function of a class reads only the word, its places in the list and the reference list. It does not read the patterns. `src/hyphen/classes.ts` holds each class. Its tests include words outside the class.

The class `mute-e` of `fr` follows a rule of French typography: a word does not break before a last syllable with a mute `e`. The source is the *Lexique des règles typographiques en usage à l'Imprimerie nationale*, at the rules for word division. The class holds the last place of the list in a word when the last syllable has these parts:

1. An onset of consonants, or consonants and the `u` of `gu` or `qu`. The letter `y` is a vowel letter of French, so it is not part of an onset.
2. The ending `e`, `es` or `ent`.

The ending `ent` is mute only in a verb form, for example `abaissent`. The file `data/hyphen/fr-forms.txt` gives the phonetic forms in Lexique of the words of the sample that the rules read. When a form of the word ends with the vowel `@` or with `nt`, the word is not in the class. Examples are `moment`, `couvent` and `establishment`. A final `é`, `ée` or `és` is not a mute `e`, so `né`, `café` and `année` are not in the class.

For each class, the record gives these values:

- `found`: the share of the places of the full list that the set finds.
- `leftOut`: the count of the places of the class within the limits.
- `foundRest`: the share of the other places that the set finds. The target is `target`.
- `explained`: the count of the missed places at a place of the class.
- `rest`: the missed places that remain, with their class and cause.

| Language | Class | `found` | `leftOut` | `foundRest` | `target` | `explained` | `rest` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fr` | `mute-e` | 0.8278 | 2946 | 0.9678 | 0.95 | 2946 of 3508 | 562 |

All 562 places of `rest` are `inhibited`. Each run of the gate shows these values in the summary of the job. A rule difference in `de` or `en-us` gets a class of the same type, not a cut by the result of the patterns.

### The reference rules and the layer

A reference rule tells where a hyphen of the set is a defect. Each class is a rule: a hyphen at or after the place of the class is a defect. A guard is a rule with no class. Its target is 0 defects.

The guard `gn-digraph` of `fr` reads the digraph `gn`. When a phonetic form of the word has the sound `N`, as in `gagner`, the letters `gn` are one sound. A hyphen between them is a defect when the list has no place there. In `stagner`, the letters `g` and `n` are two sounds, so the guard does not apply.

Sometimes the list has the place, but a phonetic form has the sound `N`. Then two columns of the list disagree. Each such hyphen is a conflict inside the list, not a defect.

The layer does not remove a conflict. The record lists each word with a conflict. The limit of conflicts of `gn-digraph` is 15. It is a ratchet: a rise needs a reason in its pull request.

The gate counts the defects on the sample and on all of Lexique 3.83 at each run. It downloads `Lexique383.tsv` from <https://www.lexique.org/databases/Lexique383/Lexique383.tsv> and examines its SHA-256. The counts are in the field `reference` of the record.

The exception layer corrects each defect of the pinned set. The file `data/hyphen/fr-layer.json` gives one entry for each lowercase word of Lexique with a defect. The entry gives the hyphens of the pinned set without the defects. It also gives the rules, the syllables and the phonetic forms of the word as evidence.

The module of `fr` holds the entries as exceptions. The gate makes the layer from the pinned set at each run. An update of the TeX set thus removes each entry that it corrects.

| Language | Rule | Defects of the TeX set (sample, Lexique) | Defects with the layer (sample, Lexique) | Conflicts in Lexique | Words of the layer |
| --- | --- | --- | --- | --- | --- |
| `fr` | `mute-e` | 1, 18 | 0, 0 | 0 | 18 |
| `fr` | `gn-digraph` | 0, 0 | 0, 0 | 15 | 18 |

The 15 words with a conflict are `agnat`, `agnathes`, `ignifuge`, `ignifuger`, `ignifugé`, `ignifugée`, `ignifugées`, `ignifugés`, `ignition`, `igné`, `inexpugnable`, `inexpugnables`, `magnificat`, `pugnace` and `pugnacité`. Lexique 3.83 has 116194 words of letters alone with syllables. The layer adds 87 `gzip` bytes to `./hyphen/fr`.

`data/hyphen/NOTICE.md` in `packages/conformance` tells the sources of the samples. That package is private, so the samples are not part of the npm package.

## The gate

The CI job `conformance` also holds the gate of the sets. The gate stops in these cases:

- The SHA-256 of a pattern file differs from `sources.ts`.
- A committed module differs from the module of its pinned file.
- A field of `packages/conformance/data/hyphen.json` differs from a new measure, or a weight differs from the record.
- A committed layer differs from the layer of the pinned set and the reference list.
- A set with its layer has a defect of a reference rule on the full list.
- The conflicts of a rule on the full list are more than the limit of the rule.

The test `packages/conformance/src/hyphen/hyphen.test.ts` also fails when a value in the record or in `source` is stale.

## How to change a set

1. Change the commit or the file and each SHA-256 in `packages/conformance/src/hyphen/sources.ts`.
2. Start `pnpm --filter @typeset/conformance tables --folder <folder>`. It writes the modules and the record.
3. Commit the modules and the record.

To draw new samples, start `pnpm --filter @typeset/conformance draw --folder <folder>` with the three word lists in the folder. The gate does not start this command.

To add a language:

1. Add an entry to `sources.ts`.
2. Add the subpath to `exports` and to `publishConfig.exports` in `packages/typeset/package.json`.
3. Add the entry to `tsdown.config.ts`.
4. Add a sample in `packages/conformance/data/hyphen`.
5. Do the steps above.
