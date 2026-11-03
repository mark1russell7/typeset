/**
 * The command `node scripts/snapshot.ts --from <folder> --run <id> --branch <name> --sha <commit> --date <YYYY-MM-DD>`.
 * It reads the file `font-widths.json` of each arm from the artifacts of a fonts run and writes the summaries to
 * `data/ci-snapshot.json`. Get the artifacts first with `gh run download <id> -D <folder>`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { snapshotOf } from "../src/snapshot.ts";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    run: { type: "string" },
    branch: { type: "string", default: "main" },
    sha: { type: "string", default: "" },
    date: { type: "string", default: "" },
    out: { type: "string", default: join(import.meta.dirname, "..", "data", "ci-snapshot.json") },
  },
});
if (values.from === undefined || values.run === undefined) throw new Error("give --from <folder> and --run <id>");
const folders = readdirSync(values.from).filter((name) => name.startsWith("font-widths-"));
const files = folders.map((name) => join(values.from!, name, "font-widths.json")).filter((file) => existsSync(file));
if (files.length === 0) throw new Error(`the folder ${values.from} has no font-widths-<arm>/font-widths.json`);
const snapshot = snapshotOf(
  files.map((file) => JSON.parse(readFileSync(file, "utf8")) as unknown),
  { id: Number(values.run), branch: values.branch, sha: values.sha, date: values.date },
);
// One line for each arm, so a diff of a new snapshot shows the arms that changed
const { arms, ...head } = snapshot;
writeFileSync(values.out, `${JSON.stringify(head).slice(0, -1)},"arms":[\n${arms.map((arm) => JSON.stringify(arm)).join(",\n")}\n]}\n`);
console.log(`wrote ${values.out}: ${snapshot.arms.map((arm) => arm.arm).join(", ")}`);
