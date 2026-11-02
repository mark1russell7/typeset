/// <reference lib="dom" />
/**
 * The command `node src/main.ts --fonts <folder> [--woff2 <folder>] [--arm <name>] [--scale 1] [--reference exact]
 * [--per-cell 40] [--out font-widths.json] [--label <text>]`. It measures each text of the corpus with canvas `measureText`
 * in headless Chromium and with the font tables, and writes the records and their summary. It starts Chromium, so only CI
 * starts this command.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { brotliDecompressSync } from "node:zlib";
import { fingerprint, fontSizes, generateCorpus, type FontId } from "@typeset/corpus";
import { measureWidth, readFont, type Font } from "@typeset/fonts";
import { chromium, type Page } from "playwright";
import { checkBounds, fractionsOf, probeCharacters, probeInstance, recordsOf, summarize, tasksOf, type FontTask, type InstanceProbe, type WidthRecord } from "./compare.ts";
import { cssInstance, extraSource, extraWeights, fileName, fontsCommit, fontSources, scriptTags } from "./sources.ts";

const origin = "https://typeset.test";

/** The size of the instance probe, in px. A large size makes a small change of an advance visible. */
const probeSize = 200;

/** The Latin characters that the probe adds when the font has them. */
const probeLatin = "Hamburgefonstiv0123456789";

/** One font face of the page: its family and the ranges of its `wght` and `wdth` axes, so that the browser uses no synthetic bold. */
interface Face {
  readonly id: string;
  readonly weight: string;
  readonly stretch: string;
}

function faceOf(id: string, font: Font): Face {
  const wght = font.axes.find((axis) => axis.tag === "wght");
  const wdth = font.axes.find((axis) => axis.tag === "wdth");
  return { id, weight: wght === undefined ? "normal" : `${wght.min} ${wght.max}`, stretch: wdth === undefined ? "normal" : `${wdth.min}% ${wdth.max}%` };
}

/** This function loads each font into the page as a FontFace with the family `typeset-<id>`, so no system font has its name. */
async function loadFaces(page: Page, folder: string, faces: readonly Face[]): Promise<void> {
  const ids = faces.map((face) => face.id);
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><canvas></canvas>" });
    const id = path.slice("/fonts/".length);
    if (!ids.includes(id)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: "font/ttf", body: readFileSync(join(folder, fileName(id))) });
  });
  await page.goto(`${origin}/`);
  const failed = await page.evaluate(async (list) => {
    const bad: string[] = [];
    for (const face of list) {
      try {
        const loaded = new FontFace(`typeset-${face.id}`, `url(/fonts/${face.id})`, { weight: face.weight, stretch: face.stretch });
        await loaded.load();
        document.fonts.add(loaded);
      } catch {
        bad.push(face.id);
      }
    }
    return bad;
  }, [...faces]);
  if (failed.length > 0) throw new Error(`Chromium did not load the fonts ${failed.join(", ")}`);
}

/** This function gives the canvas widths of the texts at each size, as `widths[size][text]`. */
async function canvasWidths(page: Page, font: string, weight: number, sizes: readonly number[], texts: readonly string[]): Promise<number[][]> {
  return page.evaluate(({ family, weight, sizes, texts }) => {
    const context = document.querySelector("canvas")!.getContext("2d")!;
    return sizes.map((size) => {
      context.font = `${weight} ${size}px "${family}"`;
      return texts.map((text) => context.measureText(text).width);
    });
  }, { family: `typeset-${font}`, weight, sizes: [...sizes], texts: [...texts] });
}

function format(value: number, digits = 3): string {
  return Number.isNaN(value) ? "-" : value.toFixed(digits);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      fonts: { type: "string" },
      woff2: { type: "string" },
      arm: { type: "string", default: "local" },
      scale: { type: "string", default: "1" },
      reference: { type: "string", default: "exact" },
      "per-cell": { type: "string", default: "40" },
      out: { type: "string", default: "font-widths.json" },
      label: { type: "string", default: "" },
    },
  });
  if (values.fonts === undefined) throw new Error("give --fonts <folder>");
  const reference = values.reference === "pixel" ? "pixel" : "exact";
  const scale = Number(values.scale);
  const samples = generateCorpus({ seed: 1, perCell: Number(values["per-cell"]) });
  const latin = samples.filter((sample) => sample.script === "latin");
  const ids = fontSources.map((source) => source.id);
  const read = (id: string, weight = 400) => readFont(readFileSync(join(values.fonts!, fileName(id))), { instance: cssInstance(weight) });
  const fonts = new Map<FontId, Font>(ids.map((id) => [id, read(id)]));
  const extra = read(extraSource.id);
  const tasks: { task: FontTask; font: Font }[] = [
    ...tasksOf(samples, ids, fontSizes).filter((task) => task.samples.length > 0).map((task) => ({ task, font: fonts.get(task.font as FontId)! })),
    ...extraWeights.map((weight) => ({ task: { font: extraSource.id, weight, samples: latin, sizes: fontSizes }, font: extra.at(cssInstance(weight)) })),
  ];
  const browser = await chromium.launch();
  const version = browser.version();
  const records: WidthRecord[] = [];
  const instances: InstanceProbe[] = [];
  let fontKerning = "";
  let devicePixelRatio = 0;
  try {
    const context = await browser.newContext({ deviceScaleFactor: scale });
    const page = await context.newPage();
    await loadFaces(page, values.fonts, [...ids.map((id) => faceOf(id, fonts.get(id)!)), faceOf(extraSource.id, extra)]);
    fontKerning = await page.evaluate(() => document.querySelector("canvas")!.getContext("2d")!.fontKerning);
    devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    for (const { task, font } of tasks) {
      const weight = task.weight ?? 400;
      const canvas = await canvasWidths(page, task.font, weight, task.sizes, task.samples.map((sample) => sample.text));
      records.push(...recordsOf(task, font, canvas));
      // The instance probe: each character alone at 200 px, against the model at each weight
      const characters = probeCharacters(font, [probeLatin, ...task.samples.map((sample) => sample.text)]);
      const [probe] = await canvasWidths(page, task.font, weight, [probeSize], characters);
      instances.push(probeInstance(task.font, font, weight, characters, probe!, probeSize, reference));
    }
  } finally {
    await browser.close();
  }
  const corpusRecords = records.filter((record) => record.font !== extraSource.id);
  // The WOFF2 files must give the same widths as the TrueType files, bit for bit
  const woff2: Record<string, { epoch: string; mismatches: number }> = {};
  let woff2Mismatches = 0;
  if (values.woff2 !== undefined) {
    const texts = new Map(samples.map((sample) => [sample.id, sample]));
    for (const id of [...ids, extraSource.id]) {
      const file = join(values.woff2, `${id}.woff2`);
      if (!existsSync(file)) throw new Error(`the WOFF2 file ${file} is missing`);
      const base = readFont(readFileSync(file), { decompress: (data) => brotliDecompressSync(data), instance: cssInstance() });
      let mismatches = 0;
      for (const record of records.filter((r) => r.font === id)) {
        const sample = texts.get(record.sample)!;
        if (measureWidth(base.at(cssInstance(record.weight)), sample.text, record.size, { script: scriptTags[sample.script] }) !== record.tables) mismatches++;
      }
      woff2[id] = { epoch: base.epoch, mismatches };
      woff2Mismatches += mismatches;
    }
  }
  const summary = summarize(corpusRecords);
  const outcomes = checkBounds(summary);
  const extraSummary = Object.fromEntries(extraWeights.map((weight) => [weight, summarize(records.filter((r) => r.font === extraSource.id && r.weight === weight))["latin"] ?? {}]));
  const lineWidths = corpusRecords.filter((record) => record.lengthClass === "line" && record.missing === 0).map((record) => record.canvas);
  const fractions = { line: fractionsOf(lineWidths), all: fractionsOf(records.map((record) => record.canvas)) };
  const output = {
    schema: "typeset-font-widths/2",
    label: values.label,
    arm: values.arm,
    scale,
    devicePixelRatio,
    reference,
    platform: `${process.platform} ${release()} ${process.arch}`,
    chromium: version,
    fontKerning,
    corpus: { seed: 1, perCell: Number(values["per-cell"]), samples: samples.length, fingerprint: fingerprint(samples) },
    fonts: {
      commit: fontsCommit,
      list: fontSources.map((source) => ({ id: source.id, sha256: source.sha256, epoch: fonts.get(source.id)!.epoch, instance: fonts.get(source.id)!.instance })),
      extra: { id: extraSource.id, sha256: extraSource.sha256, epoch: extra.epoch, weights: extraWeights, default: extra.axes.find((axis) => axis.tag === "wght")?.default },
    },
    instances,
    fractions,
    woff2Mismatches: values.woff2 === undefined ? null : woff2Mismatches,
    woff2,
    outcomes,
    summary,
    extraSummary,
    records,
  };
  writeFileSync(values.out, JSON.stringify(output) + "\n");
  const line = fractions.line;
  const lines = [
    `## Font widths (${values.arm}): tables against canvas measureText`,
    ``,
    `Chromium ${version} on ${output.platform}, device scale ${scale} (devicePixelRatio ${devicePixelRatio}), reference ${reference}, fontKerning ${fontKerning}, ${records.length} widths, ${samples.length} samples, WOFF2 mismatches ${output.woff2Mismatches ?? "not checked"}.`,
    ``,
    `Line widths: ${line.n}. On the whole px grid ${line.whole}, on 1/2 ${line.half}, on 1/4 ${line.quarter}, on 1/64 ${line.sixtyFourth}.`,
    ``,
    `| script | line n | line worst px | line mean px | line p90 px | line pixel exact | line pixel worst px | word worst px | excluded |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...Object.entries(summary).map(([script, cells]) => {
      const excluded = Object.values(cells).reduce((sum, cell) => sum + cell.excluded, 0);
      const l = cells.line;
      return `| ${script} | ${l?.n ?? 0} | ${format(l?.worstPx ?? Number.NaN)} | ${format(l?.meanPx ?? Number.NaN)} | ${format(l?.p90Px ?? Number.NaN)} | ${l?.pixelExact ?? 0} | ${format(l?.pixelWorstPx ?? Number.NaN)} | ${format(cells.word?.worstPx ?? Number.NaN)} | ${excluded} |`;
    }),
    ...extraWeights.map((weight) => {
      const l = extraSummary[weight]?.line;
      return `| ${extraSource.id} ${weight} | ${l?.n ?? 0} | ${format(l?.worstPx ?? Number.NaN)} | ${format(l?.meanPx ?? Number.NaN)} | ${format(l?.p90Px ?? Number.NaN)} | ${l?.pixelExact ?? 0} | ${format(l?.pixelWorstPx ?? Number.NaN)} | ${format(extraSummary[weight]?.word?.worstPx ?? Number.NaN)} | ${l?.excluded ?? 0} |`;
    }),
    ``,
    `| font | weight | model instance | probe found | tied | error at the weight px | matches |`,
    `|---|---|---|---|---|---|---|`,
    ...instances.map((p) => `| ${p.font} | ${p.requested} | ${JSON.stringify(p.model)} | ${p.found} | ${p.tied} | ${format(p.errorAtRequested)} | ${p.matches} |`),
  ];
  console.log(lines.join("\n"));
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined) appendFileSync(stepSummary, `${lines.join("\n")}\n`);
}

if (import.meta.main) await main();
