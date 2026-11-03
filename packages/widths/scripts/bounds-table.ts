/**
 * The command `node scripts/bounds-table.ts`. It reads the committed record `data/harfbuzz-bounds.json` and writes the
 * table of the worst errors into `docs/FONTS.md`, between the marks of `tableMarks`. The table is not written by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boundsTable, withTable, type RecordCell } from "../src/bounds.ts";

const record = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "harfbuzz-bounds.json"), "utf8")) as { runId: string | null; cells: RecordCell[] };
const document = join(import.meta.dirname, "..", "..", "..", "docs", "FONTS.md");
const table = `${boundsTable(record.cells)}\n\nThe source is the record of the CI run ${record.runId ?? "(no run id)"}.`;
writeFileSync(document, withTable(readFileSync(document, "utf8"), table));
