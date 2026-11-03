# @typeset/site

This package is the GitHub Pages site of typeset: [mark1russell7.github.io/typeset](https://mark1russell7.github.io/typeset/). The workflow `pages.yml` builds and deploys it.

- **Lab:** The page downloads a font of the corpus and loads it as a `FontFace`. It measures your text with canvas `measureText` and with `measureWidth`.
- **Sweep:** The page measures the CI corpus in your browser and shows the error for each font and script.
- **CI platforms:** The page shows the summaries of one fonts run, for the four arms side by side.

## The snapshot of the CI data

The file `data/ci-snapshot.json` keeps the summaries of each arm of one run of `fonts.yml`. It has no records. To make it again from a new run, do these steps:

1. Find the run with `gh run list --workflow fonts.yml`.
2. Download its artifacts with `gh run download <id> -D <folder>`.
3. Start `pnpm --filter @typeset/site snapshot --from <folder> --run <id> --branch <name> --sha <commit> --date <YYYY-MM-DD>`.

## Commands

- `pnpm --filter @typeset/site dev` starts the site on a local server.
- `pnpm --filter @typeset/site build` writes the site to `dist`.
- `pnpm --filter @typeset/site test` examines the data functions.
