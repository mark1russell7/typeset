/**
 * The command of the bidi order read in one browser (T13b). It opens Chromium, Firefox or WebKit with Playwright, lays out
 * each seeded text on one line of an LTR paragraph, and reads the center of each compared character from a DOM range. It
 * writes the count of matched texts and the first mismatches. `bidi-order-merge.ts` joins the records of the browsers.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { compareOrders, orderCase, orderOfPlaces, orderTexts, type Placed } from "./bidi-order.ts";

const types = { chromium, firefox, webkit } as const;
const { values } = parseArgs({
  options: { browser: { type: "string" }, seed: { type: "string", default: "13" }, count: { type: "string", default: "600" }, out: { type: "string" } },
});
const name = values.browser;
if (name === undefined || !(name in types)) throw new Error("give --browser chromium, firefox or webkit");
if (values.out === undefined) throw new Error("give --out <file>");
const seed = Number(values.seed);
const count = Number(values.count);
const cases = orderTexts(seed, count).map(orderCase);

const browser = await types[name as keyof typeof types].launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!DOCTYPE html><html><body style="margin: 0"></body></html>');
  const places = await page.evaluate((items: { text: string; indexes: number[] }[]) => {
    const line = document.createElement("div");
    line.style.cssText = "direction: ltr; unicode-bidi: isolate; white-space: pre; font: 32px sans-serif; position: absolute; left: 0; top: 0";
    document.body.appendChild(line);
    return items.map(({ text, indexes }) => {
      line.textContent = text;
      const node = line.firstChild!;
      const range = document.createRange();
      return indexes.map((index) => {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const box = range.getBoundingClientRect();
        return { index, center: box.left + box.width / 2 };
      });
    });
  }, cases.map((item) => ({ text: item.text, indexes: [...item.indexes] })));
  const result = compareOrders(name, browser.version(), cases, places.map((list: Placed[]) => orderOfPlaces(list)));
  writeFileSync(values.out, `${JSON.stringify({ schema: "typeset-bidi-order/1", seed, count, ...result }, null, 2)}\n`);
  console.log(`${result.browser} ${result.version}: ${result.matched} of ${result.texts} texts in the order of the rules`);
} finally {
  await browser.close();
}
