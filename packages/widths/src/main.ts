/// <reference lib="dom" />
/**
 * The command `node src/main.ts --fonts <folder> [--woff2 <folder>] [--per-cell 40] [--out font-widths.json] [--label <text>]`.
 * It measures each text of the corpus with canvas `measureText` in headless Chromium and with the font tables, and writes
 * the records and their summary. It starts Chromium, so only CI starts this command.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { brotliDecompressSync } from "node:zlib";
import { fingerprint, fontSizes, generateCorpus, type FontId } from "@typeset/corpus";
import { measureWidth, readFont, type Font } from "@typeset/fonts";
import { chromium, type Page } from "playwright";
import { checkBounds, recordsOf, summarize, tasksOf, type WidthRecord } from "./compare.ts";
import { fileName, fontsCommit, fontSources, scriptTags } from "./sources.ts";

const origin = "https://typeset.test";

/** This function loads each font into the page as a FontFace with the family `typeset-<id>`, so no system font has its name. */
async function loadFaces(page: Page, folder: string, ids: readonly FontId[]): Promise<void> {
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><canvas></canvas>" });
    const id = path.slice("/fonts/".length) as FontId;
    if (!ids.includes(id)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: "font/ttf", body: readFileSync(join(folder, fileName(id))) });
  });
  await page.goto(`${origin}/`);
  const failed = await page.evaluate(async (list) => {
    const bad: string[] = [];
    for (const id of list) {
      try {
        const face = new FontFace(`typeset-${id}`, `url(/fonts/${id})`);
        await face.load();
        document.fonts.add(face);
      } catch {
        bad.push(id);
      }
    }
    return bad;
  }, [...ids]);
  if (failed.length > 0) throw new Error(`Chromium did not load the fonts ${failed.join(", ")}`);
}

/** This function gives the canvas widths of the texts at each size, as `widths[size][text]`. */
async function canvasWidths(page: Page, font: FontId, sizes: readonly number[], texts: readonly string[]): Promise<number[][]> {
  return page.evaluate(({ family, sizes, texts }) => {
    const context = document.querySelector("canvas")!.getContext("2d")!;
    return sizes.map((size) => {
      context.font = `${size}px "${family}"`;
      return texts.map((text) => context.measureText(text).width);
    });
  }, { family: `typeset-${font}`, sizes: [...sizes], texts: [...texts] });
}

function format(value: number, digits = 3): string {
  return Number.isNaN(value) ? "-" : value.toFixed(digits);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fonts: { type: "string" },
      woff2: { type: "string" },
      "per-cell": { type: "string", default: "40" },
      out: { type: "string", default: "font-widths.json" },
      label: { type: "string", default: "" },
    },
  });
  if (values.fonts === undefined) throw new Error("give --fonts <folder>");
  const samples = generateCorpus({ seed: 1, perCell: Number(values["per-cell"]) });
  const ids = fontSources.map((source) => source.id);
  const fonts = new Map<FontId, Font>(ids.map((id) => [id, readFont(readFileSync(join(values.fonts!, fileName(id))))]));
  const browser = await chromium.launch();
  const version = browser.version();
  const records: WidthRecord[] = [];
  let fontKerning = "";
  try {
    const page = await browser.newPage();
    await loadFaces(page, values.fonts, ids);
    fontKerning = await page.evaluate(() => document.querySelector("canvas")!.getContext("2d")!.fontKerning);
    for (const task of tasksOf(samples, ids, fontSizes)) {
      if (task.samples.length === 0) continue;
      const canvas = await canvasWidths(page, task.font, task.sizes, task.samples.map((sample) => sample.text));
      records.push(...recordsOf(task, fonts.get(task.font)!, canvas));
    }
  } finally {
    await browser.close();
  }
  // The WOFF2 files must give the same widths as the TrueType files, bit for bit
  const woff2: Record<string, { epoch: string; mismatches: number }> = {};
  let woff2Mismatches = 0;
  if (values.woff2 !== undefined) {
    const texts = new Map(samples.map((sample) => [sample.id, sample]));
    for (const id of ids) {
      const file = join(values.woff2, `${id}.woff2`);
      if (!existsSync(file)) throw new Error(`the WOFF2 file ${file} is missing`);
      const font = readFont(readFileSync(file), { decompress: (data) => brotliDecompressSync(data) });
      let mismatches = 0;
      for (const record of records.filter((r) => r.font === id)) {
        const sample = texts.get(record.sample)!;
        if (measureWidth(font, sample.text, record.size, { script: scriptTags[sample.script] }) !== record.tables) mismatches++;
      }
      woff2[id] = { epoch: font.epoch, mismatches };
      woff2Mismatches += mismatches;
    }
  }
  const summary = summarize(records);
  const outcomes = checkBounds(summary);
  const output = {
    schema: "typeset-font-widths/1",
    label: values.label,
    chromium: version,
    fontKerning,
    corpus: { seed: 1, perCell: Number(values["per-cell"]), samples: samples.length, fingerprint: fingerprint(samples) },
    fonts: { commit: fontsCommit, list: fontSources.map((source) => ({ id: source.id, sha256: source.sha256, epoch: fonts.get(source.id)!.epoch })) },
    woff2Mismatches: values.woff2 === undefined ? null : woff2Mismatches,
    woff2,
    outcomes,
    summary,
    records,
  };
  writeFileSync(values.out, JSON.stringify(output) + "\n");
  const lines = [
    `## Font widths: tables against canvas measureText`,
    ``,
    `Chromium ${version}, fontKerning ${fontKerning}, ${records.length} widths, ${samples.length} samples, WOFF2 mismatches ${output.woff2Mismatches ?? "not checked"}.`,
    ``,
    `| script | line n | line worst px | line mean px | line p90 px | word worst px | page worst relative | excluded |`,
    `|---|---|---|---|---|---|---|---|`,
    ...Object.entries(summary).map(([script, cells]) => {
      const excluded = Object.values(cells).reduce((sum, cell) => sum + cell.excluded, 0);
      return `| ${script} | ${cells.line?.n ?? 0} | ${format(cells.line?.worstPx ?? Number.NaN)} | ${format(cells.line?.meanPx ?? Number.NaN)} | ${format(cells.line?.p90Px ?? Number.NaN)} | ${format(cells.word?.worstPx ?? Number.NaN)} | ${format(cells.page?.worstRelative ?? Number.NaN, 5)} | ${excluded} |`;
    }),
    ``,
    `| outcome | holds | worst px of the line class |`,
    `|---|---|---|`,
    ...outcomes.map((o) => `| ${o.outcome} | ${o.holds} | ${Object.entries(o.worst).map(([s, v]) => `${s} ${format(v!)}`).join(", ")} |`),
  ];
  console.log(lines.join("\n"));
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined) appendFileSync(stepSummary, `${lines.join("\n")}\n`);
}

if (import.meta.main) await main();
