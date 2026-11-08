/**
 * The command that joins the bidi order records of the browsers into one record (T13b). It writes a gate line for each
 * part. A mismatch in Chromium fails the command, because the canvas model of `./fonts` follows Blink. A mismatch in
 * Firefox or WebKit gives a warning only. A missing browser is a no-read, and a no-read is not a pass.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gateLine, writeGateLine } from "@mark1russell7/rigor-bench";
import type { BrowserOrder } from "./bidi-order.ts";

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

const names = ["chromium", "firefox", "webkit"] as const;
const records = names.map((browser) => [browser, readRecord(browser)] as const);
const browsers = records.flatMap(([, record]) => (record === undefined ? [] : [record]));
writeFileSync(values.out, `${JSON.stringify({ schema: "typeset-bidi-order/1", browsers }, null, 2)}\n`);
for (const [browser, record] of records) console.log(record === undefined ? `${browser}: no record` : `${browser} ${record.version}: ${record.matched} of ${record.texts} texts`);

const readOf = ([browser, record]: (typeof records)[number]) => ({
  case: browser,
  outcome: record === undefined ? "no read" : record.matched === record.texts ? "pass" : "beyond",
});
const reasonOf = (list: readonly (typeof records)[number][]) =>
  list.filter(([, record]) => record === undefined || record.matched < record.texts).map(([browser, record]) => (record === undefined ? `${browser}: no record` : `${browser}: ${record.matched} of ${record.texts}`)).join(", ");
const blink = records.filter(([browser]) => browser === "chromium");
const others = records.filter(([browser]) => browser !== "chromium");
const blinkLine = gateLine(blink.map(readOf), { title: "Bidi order in Chromium", enforced: true, reason: reasonOf(blink) });
writeGateLine(blinkLine);
writeGateLine(gateLine(others.map(readOf), { title: "Bidi order in Firefox and WebKit", enforced: false, reason: reasonOf(others) }));
if (blinkLine !== undefined) process.exitCode = 1;
