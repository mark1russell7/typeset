/**
 * The gate lines of the bidi order read (T13b, T13d). Each browser has two reads, so each read of each browser is one case.
 * A mismatch in Chromium is an error, because the canvas model of `./fonts` follows Blink. A mismatch in Firefox or WebKit
 * is a warning. A missing browser is a no-read, and a no-read is not a pass.
 */
import { gateLine, type GateLine } from "@mark1russell7/rigor-bench";
import { readNames, type BrowserOrder } from "./bidi-order.ts";

/** The record of one browser, or undefined when its job wrote no record. */
export type BrowserRecord = readonly [browser: string, record: BrowserOrder | undefined];

/** One case of a gate line: a read of a browser, its outcome and the text of a miss. */
interface ReadCase {
  readonly case: string;
  readonly outcome: string;
  readonly miss: string | undefined;
}

/** This function gives the cases of a list of browsers: one case for each read. */
function casesOf(records: readonly BrowserRecord[]): ReadCase[] {
  return records.flatMap(([browser, record]) =>
    readNames.map((read): ReadCase => {
      const name = `${browser} ${read}`;
      if (record === undefined) return { case: name, outcome: "no read", miss: `${name}: no record` };
      const { matched, texts } = record[read];
      return { case: name, outcome: matched === texts ? "pass" : "beyond", miss: matched === texts ? undefined : `${name}: ${matched} of ${texts}` };
    }),
  );
}

/** This function gives the gate line of a list of browsers, or undefined when each read of each browser matched each text. */
function lineOf(records: readonly BrowserRecord[], title: string, enforced: boolean): GateLine | undefined {
  const cases = casesOf(records);
  const reason = cases.flatMap((item) => (item.miss === undefined ? [] : [item.miss])).join(", ");
  return gateLine(cases.map((item) => ({ case: item.case, outcome: item.outcome })), { title, enforced, reason });
}

/** This function gives the two gate lines: the enforced line of Chromium and the line of Firefox and WebKit that only reports. */
export function orderGateLines(records: readonly BrowserRecord[]): { readonly blink: GateLine | undefined; readonly others: GateLine | undefined } {
  return {
    blink: lineOf(records.filter(([browser]) => browser === "chromium"), "Bidi order in Chromium", true),
    others: lineOf(records.filter(([browser]) => browser !== "chromium"), "Bidi order in Firefox and WebKit", false),
  };
}
