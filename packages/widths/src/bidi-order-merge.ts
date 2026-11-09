/**
 * The command that joins the bidi order records of the browsers into one record (T13b, T13d). It writes the gate lines of
 * `bidi-order-gate.ts`. A mismatch in Chromium fails the command. A mismatch in Firefox or WebKit gives a warning only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { writeGateLine } from "@mark1russell7/rigor-bench";
import { readNames, type BrowserOrder } from "./bidi-order.ts";
import { orderGateLines, type BrowserRecord } from "./bidi-order-gate.ts";

const { values } = parseArgs({ options: { records: { type: "string" }, out: { type: "string" } } });
if (values.records === undefined || values.out === undefined) throw new Error("give --records <folder> --out <file>");
const folder = values.records;

/** This function reads the record of a browser, or gives undefined when the job of the browser wrote no record. */
function readRecord(browser: string): BrowserOrder | undefined {
  try {
    return JSON.parse(readFileSync(join(folder, `bidi-order-${browser}`, "bidi-order.json"), "utf8")) as BrowserOrder;
  } catch {
    return undefined;
  }
}

const records: BrowserRecord[] = (["chromium", "firefox", "webkit"] as const).map((browser) => [browser, readRecord(browser)]);
const browsers = records.flatMap(([, record]) => (record === undefined ? [] : [record]));
writeFileSync(values.out, `${JSON.stringify({ schema: "typeset-bidi-order/2", browsers }, null, 2)}\n`);
for (const [browser, record] of records) {
  if (record === undefined) console.log(`${browser}: no record`);
  else for (const read of readNames) console.log(`${browser} ${record.version}, ${read}: ${record[read].matched} of ${record[read].texts} texts, ${record[read].unexplained} with no variant`);
}

const lines = orderGateLines(records);
writeGateLine(lines.blink);
writeGateLine(lines.others);
if (lines.blink !== undefined) process.exitCode = 1;
