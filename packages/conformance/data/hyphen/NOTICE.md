# The sources of the word samples

Each file of this folder is a seeded sample of 10000 words, with a hyphen at each place of the source. The word samples test the language sets of `@mark1russell7/typeset/hyphen`. They are not part of a package on npm.

| File | Source | Author | License |
| --- | --- | --- | --- |
| `en-us.txt` | [Moby Hyphenator II](https://www.gutenberg.org/files/3204/files/mhyph.txt) | Grady Ward | Public domain |
| `de.txt` | [German Wiktionary](https://de.wiktionary.org), through the [`kaikki.org` extract](https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz) of 2026-10-30 | The authors of Wiktionary | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `fr.txt` | [Lexique 3.83](http://www.lexique.org), column `orthosyll` | Boris New and Christophe Pallier | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

The files `de.txt` and `fr.txt` keep the license of their source.

These are the changes from each source:

- The command `src/hyphen/draw.ts` keeps only the words with letters alone, and it draws the sample with seed 14.
- It puts a hyphen at each place, sorts the words and puts them on one line.
