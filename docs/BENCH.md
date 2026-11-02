# The corpus and the bench

## The corpus

The package `@typeset/corpus` (`packages/corpus`) generates the text that the items T1 to T5 measure.

- A sample has a script, a length class, a font, a font size and a text. The seed of the corpus and the cell of the sample give its seed.
- The corpus has 12 scripts: `latin`, `latin-extended`, `greek`, `cyrillic`, `arabic`, `hebrew`, `devanagari`, `thai`, `han`, `kana`, `hangul` and `emoji`.
- The length classes are `word` (1 to 12 code points), `line` (20 to 80), `paragraph` (200 to 800) and `page` (2000 to 6000).
- The fonts are Noto families with the SIL Open Font License. T1 downloads their files. The corpus has only their names and their scripts.
- `generateEdits` makes a sequence of edits as a person makes them: typing, backspace, a paste, a deletion and a replacement. Each edit starts and ends on a code point boundary.
- A sample depends only on its seed and its cell. Thus a corpus with fewer scripts is a subset of the full corpus.
- The test `corpus.fingerprint` records the fingerprint of the corpus at seed 1. A change of the fingerprint changes every input of the bench. Record such a change in the pull request.

## The bench

The package `@typeset/bench` (`packages/bench`) times the cases. `pnpm bench` starts it.

- Each round starts one fresh process for each arm. The order of the arms turns by one place each round, and it goes backward in each second turn. Thus each arm is at each position the same number of times.
- A process does a warm-up, doubles its batch until a batch takes 5 ms, and then times 15 batches. Its value is the median time of one call.
- Two arms with the same case make the A/A pair. Its ratio is the median over the rounds, with a 90 % bootstrap interval. This ratio is the noise floor of the bench.
- The record (schema `typeset-bench/1`) has the CPU model, the Node version, the mode (`ci` or `local`), each process and the summary of each arm.
- The bench fails when a process fails or when the record does not have all its processes.

## Where the bench runs

Timing runs go to CI, not to a shared machine. The workflow `bench.yml` runs the bench.

- A pull request that changes the corpus, the bench or the workflow runs 6 rounds. The check `Bench OK` gives the result.
- A run of `workflow_dispatch` runs 20 rounds by default. Give the identifier of its prediction in the input `prediction`.
- The input `runs` of `workflow_dispatch` gives the count of bench jobs. Each job has its own runner. At most 3 jobs run at the same time.
- Each job uploads its record as the artifact `bench-records-<n>`.
- The bench has no limit yet. A limit comes from 5 runs or more: the worst value plus the spread of the runs.
