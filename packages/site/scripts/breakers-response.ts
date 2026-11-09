/**
 * The command `node scripts/breakers-response.ts`. It breaks the texts of the study with each breaker, fits the record and
 * writes it to `data/breakers-response.json`. The output is deterministic, and a test fails when the file is not current.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { heldOutError } from "@mark1russell7/rigor-statistics";
import { recordText, studyRecord } from "../src/breakers-study.ts";

const out = join(import.meta.dirname, "..", "data", "breakers-response.json");
const record = studyRecord();
writeFileSync(out, recordText(record));
console.log(`wrote ${out}: ${record.points.length} points`);
for (const measure of record.measures) {
  const error = heldOutError(record, measure.id);
  console.log(`${measure.id}: held-out mae ${error.mae.toPrecision(4)}, mean of the training points ${error.baselineMae.toPrecision(4)}, n ${error.n}`);
}
