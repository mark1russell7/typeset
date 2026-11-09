// The section of the line breakers (roadmap item T15). The record is a file of its own, so the page loads it only for this section.

import { parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { mountExplorer } from "@mark1russell7/site-pages/explorer";
import "@mark1russell7/site-pages/explorer.css";
import recordUrl from "../data/breakers-response.json?url";
import { breakerFacts, type BreakerFacts } from "./breakers-view.ts";

const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page has no element "${id}".`);
  return element;
};

/** This function makes an element with a class and a text. */
function make(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  element.textContent = text;
  return element;
}

/** This function shows the tiles of the facts. */
function showTiles(facts: BreakerFacts): void {
  const tile = (label: string, value: string, note: string): HTMLElement => {
    const element = make("div", "tile", "");
    element.append(make("span", "tile-k", label), make("span", "tile-v", value), make("span", "tile-u", note));
    return element;
  };
  $("breakers-tiles").replaceChildren(
    tile("Points", facts.points.toLocaleString("en-US"), "3 breakers, 4 widths"),
    tile("Texts", String(facts.texts), "12 scripts, 3 lengths"),
    tile("Folds", String(facts.folds), "each holds out whole texts"),
  );
}

/** This function shows the held-out error of each fit, against the mean of the training points. */
function showFits(facts: BreakerFacts): void {
  const table = make("table", "seg-table", "");
  const head = make("tr", "", "");
  for (const title of ["Measure", "Error of the fit (log10)", "Error of the mean (log10)", "Points"]) head.append(make("th", "", title));
  table.append(head);
  for (const fit of facts.fits) {
    const row = make("tr", "", "");
    row.append(make("td", "", fit.label), make("td", "seg-passed", fit.mae.toPrecision(3)), make("td", "seg-passed", fit.baselineMae.toPrecision(3)), make("td", "seg-passed", String(fit.n)));
    table.append(row);
  }
  $("breakers-fits").replaceChildren(table);
}

/** This function loads the record, shows its facts and mounts the explorer. */
async function main(): Promise<void> {
  const response = await fetch(recordUrl);
  if (!response.ok) throw new Error(`The record did not load: ${response.status}.`);
  const text = await response.text();
  const parsed = parseResponseRecord(JSON.parse(text));
  if (parsed.ok) {
    const facts = breakerFacts(parsed.record);
    showTiles(facts);
    showFits(facts);
  }
  mountExplorer($("breakers-explorer"), text, { initial: { measure: "raggedness", x: "width", facet: "breaker" } });
}

main().catch((error: unknown) => {
  $("breakers-explorer").textContent = String(error);
});
