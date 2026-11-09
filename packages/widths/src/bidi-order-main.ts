/**
 * The command of the bidi order read in one browser (T13b, T13d). It opens Chromium, Firefox or WebKit with Playwright. It
 * lays out each seeded text on one line of an LTR paragraph and reads the center of each compared character two ways.
 * - The range read takes the box of a DOM range around the character.
 * - The span read puts each character in its own `<span>` and takes the box of the span. The span has no direction of its own.
 * The command writes the count of matched texts of each read and the first mismatches. `bidi-order-merge.ts` joins the
 * records of the browsers.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, firefox, webkit } from "playwright";
import { compareOrders, orderCase, orderOfPlaces, orderTexts, readNames, type BrowserOrder, type Placed } from "./bidi-order.ts";

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
    const lineOf = (top: number): HTMLDivElement => {
      const line = document.createElement("div");
      line.style.cssText = `direction: ltr; unicode-bidi: isolate; white-space: pre; font: 32px sans-serif; position: absolute; left: 0; top: ${top}px`;
      document.body.appendChild(line);
      return line;
    };
    const rangeLine = lineOf(0);
    const spanLine = lineOf(64);
    const centerOf = (box: DOMRect): number => box.left + box.width / 2;
    return items.map(({ text, indexes }) => {
      rangeLine.textContent = text;
      const node = rangeLine.firstChild!;
      const range = document.createRange();
      const ranges = indexes.map((index) => {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        return { index, center: centerOf(range.getBoundingClientRect()) };
      });
      // Each text is in the Basic Multilingual Plane, so each UTF-16 unit is one character and gets one span.
      const spans = Array.from({ length: text.length }, (_, index) => {
        const span = document.createElement("span");
        span.textContent = text[index]!;
        return span;
      });
      spanLine.replaceChildren(...spans);
      return { range: ranges, spans: indexes.map((index) => ({ index, center: centerOf(spans[index]!.getBoundingClientRect()) })) };
    });
  }, cases.map((item) => ({ text: item.text, indexes: [...item.indexes] })));
  const orderOf = (read: (typeof readNames)[number]): number[][] => places.map((place: { range: Placed[]; spans: Placed[] }) => orderOfPlaces(place[read]));
  const result: BrowserOrder = { browser: name, version: browser.version(), range: compareOrders(cases, orderOf("range")), spans: compareOrders(cases, orderOf("spans")) };
  writeFileSync(values.out, `${JSON.stringify({ schema: "typeset-bidi-order/2", seed, count, ...result }, null, 2)}\n`);
  for (const read of readNames) {
    const { matched, texts, unexplained, variants } = result[read];
    console.log(`${result.browser} ${result.version}, ${read}: ${matched} of ${texts} texts in the order of the rules, ${unexplained} mismatches with no variant, ${JSON.stringify(variants)}`);
  }
} finally {
  await browser.close();
}
