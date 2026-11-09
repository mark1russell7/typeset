import { describe, expect, it } from "vitest";
import { compareOrders, orderCase, type BrowserOrder } from "./bidi-order.ts";
import { orderGateLines } from "./bidi-order-gate.ts";

const cases = [orderCase("aבג"), orderCase("ab")];
const good = compareOrders(cases, [[0, 2, 1], [0, 1]]);
const bad = compareOrders(cases, [[0, 1, 2], [0, 1]]);
const record = (browser: string, spans = good, range = good): BrowserOrder => ({ browser, version: "1", range, spans });

describe("orderGateLines", () => {
  it("gives no line when each read of each browser matches", () => {
    expect(orderGateLines([["chromium", record("chromium")], ["firefox", record("firefox")], ["webkit", record("webkit")]])).toEqual({ blink: undefined, others: undefined });
  });

  it("gives an error for a span mismatch in Chromium", () => {
    const lines = orderGateLines([["chromium", record("chromium", bad)], ["webkit", record("webkit")]]);
    expect(lines.blink).toMatchObject({ level: "error", outcome: "block", reason: "chromium spans: 1 of 2" });
    expect(lines.blink!.blocks.cases).toEqual(["chromium spans"]);
    expect(lines.others).toBeUndefined();
  });

  it("gives an error for a range mismatch in Chromium", () => {
    expect(orderGateLines([["chromium", record("chromium", good, bad)]]).blink?.blocks.cases).toEqual(["chromium range"]);
  });

  it("gives only a warning for a mismatch in WebKit", () => {
    const lines = orderGateLines([["chromium", record("chromium")], ["webkit", record("webkit", bad, bad)]]);
    expect(lines.blink).toBeUndefined();
    expect(lines.others).toMatchObject({ level: "warning", reason: "webkit range: 1 of 2, webkit spans: 1 of 2" });
  });

  it("gives a no-read for a browser with no record", () => {
    const lines = orderGateLines([["chromium", undefined], ["firefox", record("firefox")]]);
    expect(lines.blink).toMatchObject({ level: "error", outcome: "no read" });
    expect(lines.blink!.noReads.cases).toEqual(["chromium range", "chromium spans"]);
  });
});
