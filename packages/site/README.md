# @typeset/site

This package is the GitHub Pages site of typeset: [mark1russell7.github.io/typeset](https://mark1russell7.github.io/typeset/). The workflow `pages.yml` builds and deploys it.

- **Lab:** The page downloads a font of the corpus and loads it as a `FontFace`. It measures your text with canvas `measureText` and with `measureWidth`.
- **Justified lines:** The page breaks your text with total fit and the hyphen patterns of `en-us`, `de` or `fr`. It shows the adjustment ratio of each line next to greedy. A table gives the record of each language set. The patterns of a language load only when you select it.
- **Sweep:** The page measures the CI corpus in your browser and shows the error for each font and script.
- **Breakers:** The page shows the record of the line breakers with the explorer of `@mark1russell7/site-pages`.
- **CI platforms:** The page shows the summaries of one fonts run, for the four arms side by side.

## The snapshot of the CI data

The file `data/ci-snapshot.json` keeps the summaries of each arm of one run of `fonts.yml`. It has no records. To make it again from a new run, do these steps:

1. Find the run with `gh run list --workflow fonts.yml`.
2. Download its artifacts with `gh run download <id> -D <folder>`.
3. Start `pnpm --filter @typeset/site snapshot --from <folder> --run <id> --branch <name> --sha <commit> --date <YYYY-MM-DD>`.

## The record of the breakers

The file `data/breakers-response.json` is a record of the format `response-records/1`. It holds the results of each line breaker on seeded corpus texts, and a fit of each measure. To make it again, start `pnpm --filter @typeset/site breakers`. A test fails when the file is not current. `docs/BREAKING.md` in the repository tells the study.

## Commands

- `pnpm --filter @typeset/site dev` starts the site on a local server.
- `pnpm --filter @typeset/site build` writes the site to `dist`.
- `pnpm --filter @typeset/site test` examines the data functions.
