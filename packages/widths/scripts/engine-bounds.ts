/**
 * The command `node scripts/engine-bounds.ts <folder> <run id>`. The folder holds the artifacts `font-widths-*` of one
 * CI run. The command writes the record `data/engine-bounds.json` and the table in `docs/FONTS.md`.
 */
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTable } from "../src/bounds.ts";
import { engineTable, engineTableMarks, readCheck, type EngineBoundCell } from "../src/engine-bounds.ts";

const [folder, runId] = process.argv.slice(2);
if (folder === undefined || runId === undefined) throw new Error("give the folder of the artifacts and the run id");
const files = globSync("**/font-widths*.json", { cwd: folder });
const arms = files.map((file) => JSON.parse(readFileSync(join(folder, file), "utf8")) as {
  arm: string;
  platform: string;
  chromium: string;
  models: { engine: string; rounding: string; sum: string };
  engineBounds: EngineBoundCell[];
});
arms.sort((a, b) => a.arm.localeCompare(b.arm));
const cells = arms.flatMap((arm) => arm.engineBounds);
const output = {
  schema: "typeset-engine-bounds/1",
  prediction: "typeset-t4b-engine-rows",
  runId,
  arms: arms.map(({ arm, platform, chromium, models }) => ({ arm, platform, chromium, ...models })),
  readCheck: readCheck(cells),
  // The arms do not give the same evidence, so the record keeps each arm apart. `docs/FONTS.md` tells why
  readCheckOfArm: Object.fromEntries(arms.map(({ arm, engineBounds }) => [arm, readCheck(engineBounds)])),
};
// One cell on each line, so that a later record gives a small diff
const lines = cells.map((cell) => `    ${JSON.stringify(cell)}`).join(",\n");
const head = JSON.stringify(output, null, 2).replace(/\n}$/, "");
writeFileSync(join(import.meta.dirname, "..", "data", "engine-bounds.json"), `${head},\n  "cells": [\n${lines}\n  ]\n}\n`);
const document = join(import.meta.dirname, "..", "..", "..", "docs", "FONTS.md");
const table = `${engineTable(cells)}\n\nThe source is the record of the CI run ${runId}.`;
writeFileSync(document, withTable(readFileSync(document, "utf8"), table, engineTableMarks));
