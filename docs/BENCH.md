# The corpus and the bench

## The corpus

The package `@typeset/corpus` (`packages/corpus`) generates the text that the items T1 to T5 measure.

- A sample has a script, a length class, a font, a font size and a text. The seed of the corpus and the cell of the sample give its seed.
- The corpus has 12 scripts: `latin`, `latin-extended`, `greek`, `cyrillic`, `arabic`, `hebrew`, `devanagari`, `thai`, `han`, `kana`, `hangul` and `emoji`.
- The length classes are `word` (1 to 12 code points), `line` (20 to 80), `paragraph` (200 to 800) and `page` (2000 to 6000).
- The fonts are Noto families with the SIL Open Font License. T1 downloads their files. The corpus has only their names and their scripts.
- `generateEdits` makes a sequence of edits as a person makes them: typing, backspace, a paste, a deletion and a replacement. Each edit starts and ends on a code point boundary.
- A sample depends only on its seed and its cell. Thus a corpus with fewer scripts is a subset of the full corpus.
- The random numbers come from `@mark1russell7/rigor-generators` (`random`, `deriveSeed`), the home of this code in the fleet.
- The test `corpus.fingerprint` records the fingerprint of the corpus at seed 1. A change of the fingerprint changes every input of the bench. Record such a change in the pull request.

## The bench

The package `@typeset/bench` (`packages/bench`) times the cases. `pnpm bench` starts it.

- The file `cases/index.ts` has the list of the case modules. The bench starts each case of each module in its own arm.
- A test fails when a module of the folder `cases` is not in the list. Thus each case gets a run.
- The cases of `cases/measurer.ts` read the pinned fonts. The Bench job fetches them with the SHA-256 of each file into the folder `TYPESET_FONTS`.

- Each round starts one fresh process for each arm. The order of the arms turns by one place each round, and it goes backward in each second turn. Thus each arm is at each position the same number of times.
- A process does a warm-up, doubles its batch until a batch takes 5 ms, and then times 15 batches. Its value is the median time of one call.
- The statistics come from `@mark1russell7/rigor-statistics` (`median`, `quantile`, `summarize`, `bootstrapMedian`).
- Two arms with the same case make the A/A pair. Its ratio is the median over the rounds, with a 90 % bootstrap interval. The interval must hold 1. An interval without 1 is a bias of the harness, not noise.
- The record (schema `typeset-bench/1`) has the CPU model, the Node version, the mode (`ci` or `local`), each process and the summary of each arm.
- The bench fails when a process fails or when the record does not have all its processes.

## Where the bench runs

Timing runs go to CI, not to a shared machine. The workflow `bench.yml` runs the bench.

- A pull request that changes the corpus, the package `@mark1russell7/typeset`, the widths tools, the bench or the workflow runs a balanced count of rounds. The check `Bench OK` gives the result.
- The balanced count is 2 times the count of arms. Then each arm is at each position 2 times, one time in each direction of the order.
- A run of `workflow_dispatch` also runs the balanced count by default. Give the identifier of its prediction in the input `prediction`.
- The input `runs` of `workflow_dispatch` gives the count of bench jobs. Each job has its own runner. At most 3 jobs run at the same time.
- Each job uploads its record as the artifact `bench-records-<n>`.
- A limit comes from 5 runs or more: the worst value plus the spread of the runs.

## The noise floor

The run [41446214122](https://github.com/mark1russell7/typeset/actions/runs/41446214122) gave the first 5 records: 5 jobs of 20 rounds on `main` at `c642535`.

| Job | CPU | A/A ratio | Spread of `corpus.generate` |
|---|---|---|---|
| 1 | AMD EPYC 9V74 | 1.0058 | 14.0 % |
| 2 | AMD EPYC 9V74 | 0.9955 | 3.9 % |
| 3 | AMD EPYC 9V45 | 0.9990 | 15.5 % |
| 4 | AMD EPYC 7763 | 0.9998 | 3.2 % |
| 5 | AMD EPYC 9V74 | 0.9955 | 1.9 % |

- The largest distance of the A/A ratio from 1 is 0.0058. The spread of the 5 ratios is 0.0103.
- Thus the noise floor of a ratio is 0.0058 + 0.0103 = 0.0161. Rounded toward the safe side, it is 0.017.
- A budget for a ratio (for example "at most 5 % slower") can decide only when it is larger than 0.017. Else the verdict is "cannot decide".
- The runners have different CPU models. The median of `corpus.generate` went from 2103 to 3544 us. Thus compare only ratios of one job, not times of different jobs.
- The spread of the process medians (maximum minus minimum) follows the worst process, and it grows with the count of processes. Two jobs had a spread over 10 %, but their A/A ratios stayed near 1.
- A spread claim uses the field `processP90P10`: the 90th percentile of the process medians divided by the 10th percentile. In the 5 jobs, it was 1.0365, 1.0293, 1.0348, 1.0093 and 1.0177 for `corpus.generate`, and at most 1.0513 for `corpus.edits`.

## The rule for a claim of speed

- Each claim of an item that says "faster" or "slower" compares two arms in one job.
- A claim of speed comes from a run of several jobs. Each job has its own A/A pair.
- The floor of a run is the spread of its jobs. Do not use a fixed floor from an earlier run.
- A change of speed counts only when its interval over the jobs leaves out 1 and the A/A range of the same run.
- Else the change is "not a result". It is not a hit and not a miss.
- Do not compare the times of two jobs. The runners have different CPU models.
- The values 0.017 and 0.012 are figures for a plan: they tell how many jobs a claim needs. They are not the gate.

## The bias of an order that does not reverse (T11)

- The run 42402596103 had 6 rounds for 10 arms, so the order did not reverse. Its A/A was 1.0253 [1.0036, 1.0419]. That is a bias of the order.
- The balanced count of rounds removes it. The run 42414121767 has 5 jobs of 20 balanced rounds.

| Job | CPU | A/A ratio | 90 % interval |
|---|---|---|---|
| 1 | AMD EPYC 9V74 | 1.0003 | [0.9986, 1.0102] |
| 2 | Intel Xeon Platinum 8573C | 1.0019 | [0.9940, 1.0126] |
| 3 | AMD EPYC 9V45 | 0.9902 | [0.9788, 1.0015] |
| 4 | AMD EPYC 7763 | 0.9984 | [0.9918, 1.0052] |
| 5 | AMD EPYC 9V45 | 0.9964 | [0.9886, 1.0086] |

- Each of the 5 intervals holds 1. The spread of the ratios is 0.0117, and the largest distance from 1 is 0.0098.
- The arms of the pair never share a process. Each arm and round has a new process.

## A no-read is not a pass (T10d)

A gate that cannot read a case gives a GitHub warning on its check line. The job log alone is not sufficient, because the check stays green.

- The bench has no limit, so each run gives the warning "no read" with its arms, its rounds and its CPU.
- The fonts scorer gives a warning for each outcome that has no file or no value of an arm. A missing value shows as `NaN`.
- The weight gate gives a warning when its limit is `null`.
- A warning changes no verdict. The exit code of each gate does not change.

## The change to the rigor homes (T9)

T9 replaced the local copies of the random numbers and the statistics with the rigor packages.

- The corpus has a new fingerprint at seed 1: `687b7e4b` in place of `545a41f6cbbb68ed`. The random source changed from xoshiro128** to mulberry32, and the seeds of the samples come from `deriveSeed`. Thus each text of the corpus changed.
- `node src/rescore.ts <folder>` calculates the values of old records again. On the 5 records of the run 41446214122, 441 of 445 values are equal with `===`: each process median, each arm median, each spread and each A/A ratio.
- The 4 values that differ are ends of the bootstrap intervals, because the random source of the bootstrap changed. The largest difference is 0.0016.
- The bench run 41455318165 (5 jobs, 20 rounds) on the new corpus gives the A/A ratios 0.9973, 1.0056, 0.9987, 1.0022 and 1.0010. The floor is 0.0056 + 0.0082 = 0.0138. The limit 0.017 stays.

## The weight of each entry (T10)

The weight of an entry is the count of bytes that a user pays for it. `pnpm weight` bundles each public entry with `esbuild`, with tree shaking and with its dependencies. It then applies `gzip` at level 9.

Source bytes do not show this cost. A file in the import closure of an entry gives 0 bytes when no export uses it. For example, `fonts/context.ts` gives 0 bytes in `./fonts/inspect`.

- The job `weight` of `bench.yml` compares the head with the newest `v<version>` tag. `Bench OK` fails when the `gzip` bytes of an entry grow over the limit.
- The limit is `limitGzipBytes` in `packages/bench/weight.json`: 1792 bytes. It is the largest growth of the first CI measure, 1619 bytes, rounded up to a multiple of 256.
- The limit applies to all the changes since the last release, not to one pull request.
- The limit is one value for all the entries. Thus `./breaking`, at 1390 bytes, can more than double under it.
- Both sides use the dependencies of the head. Thus the growth shows only the source of typeset.
- The job `weight` starts when the pull request changes the source or `package.json` of typeset, the weight code, `weight.json`, `pnpm-lock.yaml` or `bench.yml`. The lock file changes the bytes that a cap examines.
- For each other pull request, the job `weight` is skipped. `Bench OK` accepts this skip, because no entry changed.
- The job measures the head two times, and it fails when the two measures differ.
- The field `measure` of `packages/bench/weight.json` is the committed record: run 41794942191 against `v0.1.4`, with minified and `gzip` bytes at the head and at the tag.
- The artifact `weight-record` has the bytes of each input file in each entry.

### A new entry (T10b)

The tag has no bytes for a new entry, so the growth rule cannot hold it. Before T10b, the gate let a new entry of any size pass. `./segmentation` merged in T12 through this gap.

- A new entry needs a line in `newEntries` of `packages/bench/weight.json`. A new entry with no line fails `Bench OK`.
- A line has the limit, the base, the CI run of the base and a reason.
- The limit is the size that the prediction of the item gave before the code. Thus nobody chooses the number after the measure.
- A prediction of an item that adds a public entry gives the `gzip` byte limit of each new entry before the code.
- The T14 prediction gave no byte limit. Thus the limit of each `./hyphen` line is its first CI measure, and a rise needs a PR with its reason.
- The base is the first CI measure of the entry. The growth above the base has the same limit as the other entries.
- The `gzip` bytes of the entry fail when they are more than the limit of the line.
- When a release has the entry, the gate ignores the line and the tag is the base. Remove the line after that release.
- This gate is a release gate. It goes to the shared gate of `rigor` when that package exists, and it does not grow before then.

### The cap of an entry (T10c)

The limit holds the growth of one release. Two releases can each grow under the limit, so the limit alone lets an entry grow with no end.

- An entry can have a line in `caps` of `packages/bench/weight.json`. A line has the base, its tag, its CI run, a count of releases and a reason.
- The gate computes the cap: `cap = baseGzipBytes + releases * limitGzipBytes`. The file holds no cap number.
- The `gzip` bytes of the entry fail `Bench OK` with the cause `cap` when they are more than the cap. A growth under the limit does not change this.
- The root entry `.` gives each area as a namespace. Thus it grows with each subpath, and it has the first line.
- Its cap is 26480 + 4 × 1792 = 33648. The base is the size at `v0.1.6`. The 4 releases are the roadmap items that grow `.` before `1.0.0`.
- A new budget needs a new line with its reason, not a larger count of releases after the measure.
