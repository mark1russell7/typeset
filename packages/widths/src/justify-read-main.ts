/**
 * The command of the read of the section "Justified lines" on the served site (T14). It opens the site in Chromium with
 * Playwright. For each language, it reads the sample text at 300 px. Then it types a visitor text and sets the width to 200 px.
 *
 * Each read takes the lines, the adjustment ratios, the worst ratio and the hyphen count of total fit and of greedy.
 * The command also reads the table of the language sets. It writes the record, and it fails when a check fails.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values } = parseArgs({
  options: { url: { type: "string", default: "https://mark1russell7.github.io/typeset/" }, out: { type: "string" } },
});
if (values.out === undefined) throw new Error("give --out <file>");
const url = values.url;

/** The visitor texts. Each has long words, so a line of 200 px needs hyphens. */
const visitorTexts = {
  "en-us": "Internationalization of characteristically incomprehensible documentation requires extraordinary responsibility and considerable understanding.",
  de: "Die Donaudampfschifffahrtsgesellschaft prüft Rechtsschutzversicherungsgesellschaften und Geschwindigkeitsbegrenzungen an Straßenbahnhaltestellen.",
  fr: "La constitutionnalité des recommandations internationales nécessite une compréhension approfondie des responsabilités gouvernementales.",
  es: "La internacionalización de las telecomunicaciones exige responsabilidades extraordinarias y una comprensión excepcionalmente minuciosa.",
} as const;
type Language = keyof typeof visitorTexts;
const languages = Object.keys(visitorTexts) as Language[];

/** The largest difference in px between the drawn width of a justified line and the line width. */
const tolerance = 1.5;

/** One line of a column, as the page shows it. */
interface Row {
  readonly text: string;
  readonly ratio: string;
  readonly width: string;
  /** The drawn width of the text of the line, with its word spacing. */
  readonly drawn: number;
}

/** One column of the section, as the page shows it. */
interface Column {
  readonly worst: string;
  readonly lines: number;
  readonly hyphens: number;
  readonly rows: readonly Row[];
}

/** This function sets the range input of the width, as a visitor does. */
async function setWidth(page: Page, width: number): Promise<void> {
  await page.$eval(
    "#jl-width",
    (input, value) => {
      (input as HTMLInputElement).value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    width,
  );
}

/** This function waits until the hook of the language is loaded and the lines are on the page. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.getElementById("jl-status")?.textContent === "" && document.querySelectorAll("#jl-fit-box .jl-row").length > 0,
    undefined,
    { timeout: 30_000 },
  );
}

/** This function reads both columns of the section. */
async function readColumns(page: Page): Promise<{ fit: Column; greedy: Column }> {
  return page.evaluate(() => {
    const column = (prefix: string): Column => {
      const text = (id: string): string => document.getElementById(`${prefix}-${id}`)?.textContent ?? "";
      const rows = [...document.querySelectorAll(`#${prefix}-box .jl-row`)].map((row): Row => {
        const line = row.querySelector<HTMLElement>(".jl-line");
        const range = document.createRange();
        if (line !== null) range.selectNodeContents(line);
        return { text: line?.textContent ?? "", ratio: row.querySelector(".jl-r")?.textContent ?? "", width: line?.style.width ?? "", drawn: range.getBoundingClientRect().width };
      });
      return { worst: text("worst"), lines: Number(text("lines")), hyphens: Number(text("hyphens")), rows };
    };
    return { fit: column("jl-fit"), greedy: column("jl-greedy") };
  });
}

/** This function gives the value of a ratio text of the page. The text "no glue" is an infinite ratio. */
function ratioOf(text: string): number {
  return text === "no glue" ? Number.POSITIVE_INFINITY : Number(text);
}

/** This function gives the text of the lines without spaces and without the hyphens at the line ends. */
function joined(rows: readonly Row[]): string {
  return rows.map((row) => (row.text.endsWith("-") ? row.text.slice(0, -1) : row.text)).join("").replace(/\s+/g, "");
}

/** This function examines one column, and gives the result of each check and the largest width difference of a justified line. */
function examine(column: Column, width: number, text: string): { checks: Record<string, boolean>; deviation: number } {
  const ratios = column.rows.map((row) => ratioOf(row.ratio));
  const worst = Math.max(0, ...ratios.map(Math.abs));
  const ends = column.rows.filter((row) => row.text.endsWith("-")).length;
  // A line before the last line with a finite ratio of at most 1 fills the line width.
  const filled = column.rows.slice(0, -1).filter((_, i) => Math.abs(ratios[i]!) <= 1);
  const deviation = Math.max(0, ...filled.map((row) => Math.abs(row.drawn - width)));
  return {
    checks: {
      lines: column.lines > 0 && column.lines === column.rows.length,
      text: joined(column.rows) === text.replace(/\s+/g, ""),
      ratios: ratios.every((ratio) => !Number.isNaN(ratio)),
      worst: Number.isFinite(worst) ? Math.abs(ratioOf(column.worst) - worst) < 0.006 : column.worst === "no glue",
      hyphens: column.hyphens === ends,
      width: column.rows.every((row) => row.width === `${width}px`),
      justified: deviation <= tolerance,
    },
    deviation,
  };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: "load" });
  await settle(page);
  const options = await page.$$eval("#jl-language option", (items) => items.map((item) => (item as HTMLOptionElement).value));
  const sets = await page.$$eval("#jl-sets tbody tr", (rows) => rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")));
  const reads = [];
  for (const language of languages) {
    await page.click("#jl-reset");
    await page.selectOption("#jl-language", language);
    for (const [kind, width] of [["sample", 300], ["visitor", 200]] as const) {
      if (kind === "visitor") await page.fill("#jl-text", visitorTexts[language]);
      await setWidth(page, width);
      await settle(page);
      const text = await page.inputValue("#jl-text");
      const { fit, greedy } = await readColumns(page);
      const fitResult = examine(fit, width, text);
      const greedyResult = examine(greedy, width, text);
      const checks: Record<string, boolean> = {
        ...Object.fromEntries(Object.entries(fitResult.checks).map(([name, ok]) => [`fit.${name}`, ok])),
        ...Object.fromEntries(Object.entries(greedyResult.checks).map(([name, ok]) => [`greedy.${name}`, ok])),
        "greedy.noHyphens": greedy.hyphens === 0,
        ...(kind === "visitor" ? { "fit.usesHook": fit.hyphens >= 1, "text.visitor": text === visitorTexts[language] } : {}),
      };
      reads.push({ language, kind, width, checks, deviation: { fit: fitResult.deviation, greedy: greedyResult.deviation }, fit, greedy });
    }
  }
  const pageChecks = {
    languages: JSON.stringify(options) === JSON.stringify(languages),
    sets: sets.length === languages.length && sets.every((cells) => cells.length === 7),
    errors: errors.length === 0,
  };
  const failed = [
    ...Object.entries(pageChecks).filter(([, ok]) => !ok).map(([name]) => name),
    ...reads.flatMap((read) => Object.entries(read.checks).filter(([, ok]) => !ok).map(([name]) => `${read.language} ${read.kind} ${name}`)),
  ];
  writeFileSync(values.out, `${JSON.stringify({ schema: "typeset-justify-read/1", url, browser: browser.version(), tolerance, checks: pageChecks, failed, options, sets, errors, reads }, null, 2)}\n`);
  for (const read of reads) {
    console.log(
      `${read.language} ${read.kind} ${read.width} px: total fit ${read.fit.lines} lines, worst ${read.fit.worst}, ${read.fit.hyphens} hyphens` +
        ` | greedy ${read.greedy.lines} lines, worst ${read.greedy.worst}, ${read.greedy.hyphens} hyphens | largest width difference ${read.deviation.fit.toFixed(2)} px`,
    );
  }
  console.log(`${sets.length} rows in the table of the sets, ${errors.length} page errors, ${failed.length} failed checks: ${failed.join(", ")}`);
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
