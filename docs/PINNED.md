# Pinned files

The gates of this repository read files that other projects publish: the Unicode files, the hyphen patterns, the word lists and the fonts. A gate does not fetch these files from their mirrors at run time. A mirror that is slow or down thus cannot change the result of a gate.

## The rule

- The manifest `pinned.json` lists each file. It gives the mirror, the SHA-256, the size and the group of the file.
- The store is the release `pinned-files` of this repository. It has one asset for each file. The name of the asset starts with the first 16 hex digits of the SHA-256, so an asset does not change.
- Before a gate starts, its workflow restores the files of its groups into a folder with `gh release download`.
- The gate reads each file only from the folder, with `readPinned` of `@typeset/pinned`.
- A missing file stops the gate. The message names the file and the restore command.
- A file with a different size or SHA-256 also stops the gate. The message names the two hashes.
- The tests of `@typeset/conformance` and `@typeset/widths` hold the sources of each package equal to `pinned.json`.

## The groups

| Group | Files | Workflow and job |
|---|---|---|
| `unicode` | The 9 files of the Unicode Character Database | CI, `conformance` |
| `patterns` | The 4 TeX pattern files | CI, `conformance` |
| `lexique` | `Lexique383.tsv` | CI, `conformance` |
| `en-us-lists` | `mhyph.txt` and `ushyphex.tex` | Hyphen train, `train` and `cause` |
| `webster` | `webster-1913.txt` | Hyphen train, `cause` |
| `fonts` | The 15 font files | Fonts, `widths`, and Bench, `bench` |

## The refresh

The workflow `pinned-refresh.yml` keeps the store full.

- It starts on a change of `pinned.json` or `packages/pinned`, each week, and by hand.
- It fetches each file that the store does not have from its mirror. It checks the size and the SHA-256, and uploads the file.
- Each week, and by hand with the input `all`, it also fetches each other file.
- A mirror that gives different bytes fails the job. Each such file gets an error annotation and a row in the summary of the job, with its mirror.
- The refresh changes no file of the repository, so it opens no pull request.

## Add or change a file

1. Change the source of the file in its package, and its entry in `pinned.json`.
2. Push the pull request. Its refresh job uploads the new file to the store.
3. Restore the group into a folder, and start the command of the gate on that folder.

The package `@typeset/pinned` is a general store of test fixtures, with no code of `typeset`. Its home is the planned harness `rigor` (mark1russell7/rigor#187). This repository does not publish it.

To restore a group on your computer, start `node packages/pinned/src/main.ts restore --group <group> --folder <folder>`. The command needs `gh` and a login.
