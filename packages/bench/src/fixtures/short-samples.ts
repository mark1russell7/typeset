/**
 * A case module for a test of the harness. At its load in a child, it writes a line with 1 sample of `fixture.short`.
 * Then it stops the child, so the child writes no line of its own. `TYPESET_BENCH_STARTS` names a file that counts the loads.
 */
import { appendFileSync, writeSync } from "node:fs";

const starts = process.env["TYPESET_BENCH_STARTS"];
if (starts !== undefined) appendFileSync(starts, "start\n");
// A synchronous write to the file descriptor 1 is complete before the exit.
writeSync(1, `${JSON.stringify({ case: "fixture.short", ms: 1, batch: 1, samples: [1] })}\n`);
process.exit(0);
