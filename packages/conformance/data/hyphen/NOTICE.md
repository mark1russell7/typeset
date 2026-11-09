# The sources of the word samples

The files `en-us.txt`, `de.txt` and `fr.txt` are seeded samples of 10000 words, with a hyphen at each place of the source. The word samples test the language sets of `@mark1russell7/typeset/hyphen`. They are not part of a package on npm.

| File | Source | Author | License |
| --- | --- | --- | --- |
| `en-us.txt` | [Moby Hyphenator II](https://www.gutenberg.org/files/3204/files/mhyph.txt) | Grady Ward | Public domain |
| `de.txt` | [German Wiktionary](https://de.wiktionary.org), through the [`kaikki.org` extract](https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz) of 2026-10-30 | The authors of Wiktionary | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `fr.txt` | [Lexique 3.83](http://www.lexique.org), column `orthosyll` | Boris New and Christophe Pallier | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `fr-forms.txt` | [Lexique 3.83](http://www.lexique.org), column `phon` | Boris New and Christophe Pallier | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `fr-layer.json` | [Lexique 3.83](http://www.lexique.org), columns `orthosyll` and `phon` | Boris New and Christophe Pallier | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The files `de.txt`, `fr.txt`, `fr-forms.txt` and `fr-layer.json` keep the license of their source. The file `fr-forms.txt` is not a sample. It gives the phonetic forms of each word of `fr.txt` that the rules of `fr` read, one word on each line. These words have the ending `ent` or the letters `gn`.

The file `fr-layer.json` is the exception layer of `fr`. For each entry, it gives the syllables and the phonetic forms of the word in Lexique as evidence. The gate makes the file from all of Lexique 3.83. The gate downloads `Lexique383.tsv` from <https://www.lexique.org/databases/Lexique383/Lexique383.tsv> and examines its SHA-256.

These are the changes from each source:

- The command `src/hyphen/draw.ts` keeps only the words with letters alone, and it draws the sample with seed 14.
- It puts a hyphen at each place, sorts the words and puts them on one line.

## The trained set of `en-us`

The command `src/hyphen/train-main.ts` trains a pattern set for `en-us` with `patgen`, from the training half of all of Moby Hyphenator II. The files of this training are these:

| File | Contents | License |
| --- | --- | --- |
| `en-us-train-params.json` | The seed of the halves and the parameters of `patgen` for each level | MIT, the license of `typeset` |
| `en-us-moby.pat` | The patterns that `patgen` gives | MIT, the license of `typeset` |
| `en-us-train.json` | The rates of the trained set and of the shipped set, with bootstrap intervals | MIT, the license of `typeset` |

Moby Hyphenator II is in the public domain. So the trained patterns do not keep a license of their source, and they are the work of `typeset`. The TUGboat list `ushyphex.tex` gives only a second score. The training does not read it.
