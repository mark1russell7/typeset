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
import { checkBounds, fractionsOf, missingGlyphs as missingGlyphCount, probeCharacters, probeInstance, recordsOf, summarize, tasksOf, type FontTask, type InstanceProbe, type WidthRecord } from "./compare.ts";
import { breakdownOf, exactDeltaErrors, featureSettings, summarizeFeatures, type FeatureGroup, type FeatureRecord, type FeatureSetting } from "./features.ts";
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

/** This function gives the DOM widths of the texts at each size, as `widths[size][text]`, with the CSS of one feature setting. */
async function domWidths(page: Page, font: string, weight: number, sizes: readonly number[], texts: readonly string[], css: string): Promise<number[][]> {
  return page.evaluate(({ family, weight, sizes, texts, css }) => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const spans = sizes.map((size) =>
      texts.map((text) => {
        const line = document.createElement("div");
        const span = document.createElement("span");
        span.style.cssText = `font: ${weight} ${size}px "${family}"; white-space: pre; ${css}`;
        span.textContent = text;
        line.appendChild(span);
        root.appendChild(line);
        return span;
      }),
    );
    const widths = spans.map((row) => row.map((span) => span.getBoundingClientRect().width));
    root.remove();
    return widths;
  }, { family: `typeset-${font}`, weight, sizes: [...sizes], texts: [...texts], css });
}

/** This function gives the group of the DOM diagnostic of a task and a sample, or nothing when the diagnostic leaves it out. */
function groupOf(font: string, weight: number, script: string, lengthClass: string): FeatureGroup | undefined {
  if (lengthClass !== "line") return undefined;
  if (font === extraSource.id) return weight === 700 ? "extra-700" : "extra-400";
  if (script === "latin") return "latin";
  if (script === "kana") return "kana";
  return undefined;
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
  const read = (id: string, deltas: "round" | "exact" = "round") => readFont(readFileSync(join(values.fonts!, fileName(id))), { instance: cssInstance(), deltas });
  const fonts = new Map<FontId, Font>(ids.map((id) => [id, read(id)]));
  const exactFonts = new Map<string, Font>([...ids, extraSource.id].map((id) => [id, read(id, "exact")]));
  const extra = read(extraSource.id);
  const tasks: { task: FontTask; font: Font; exact: Font }[] = [
    ...tasksOf(samples, ids, fontSizes).filter((task) => task.samples.length > 0).map((task) => ({ task, font: fonts.get(task.font as FontId)!, exact: exactFonts.get(task.font)! })),
    ...extraWeights.map((weight) => ({ task: { font: extraSource.id, weight, samples: latin, sizes: fontSizes }, font: extra.at(cssInstance(weight)), exact: exactFonts.get(extraSource.id)!.at(cssInstance(weight)) })),
  ];
  const browser = await chromium.launch();
  const version = browser.version();
  const records: WidthRecord[] = [];
  const instances: InstanceProbe[] = [];
  const featureRecords: FeatureRecord[] = [];
  let fontKerning = "";
  let devicePixelRatio = 0;
  try {
    const context = await browser.newContext({ deviceScaleFactor: scale });
    const page = await context.newPage();
    await loadFaces(page, values.fonts, [...ids.map((id) => faceOf(id, fonts.get(id)!)), faceOf(extraSource.id, extra)]);
    fontKerning = await page.evaluate(() => document.querySelector("canvas")!.getContext("2d")!.fontKerning);
    devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
    for (const { task, font, exact } of tasks) {
      const weight = task.weight ?? 400;
      const canvas = await canvasWidths(page, task.font, weight, task.sizes, task.samples.map((sample) => sample.text));
      records.push(...recordsOf(task, font, canvas, exact));
      // The DOM diagnostic: the lines of its groups with no missing glyph, in each feature setting
      const chosen = task.samples.map((sample, i) => [sample, i] as const).filter(([sample]) => groupOf(task.font, weight, sample.script, sample.lengthClass) !== undefined && missingGlyphCount(font, sample.text) === 0);
      if (chosen.length > 0) {
        const texts = chosen.map(([sample]) => sample.text);
        const dom = new Map<FeatureSetting, number[][]>();
        for (const setting of Object.keys(featureSettings) as FeatureSetting[]) dom.set(setting, await domWidths(page, task.font, weight, task.sizes, texts, featureSettings[setting]));
        chosen.forEach(([sample, i], c) => {
          const options = { script: scriptTags[sample.script] };
          task.sizes.forEach((size, s) => {
            featureRecords.push({
              group: groupOf(task.font, weight, sample.script, sample.lengthClass)!,
              font: task.font,
              weight,
              sample: sample.id,
              size,
              canvas: canvas[s]![i]!,
              dom: Object.fromEntries([...dom].map(([setting, widths]) => [setting, widths[s]![c]!])) as Record<FeatureSetting, number>,
              model: {
                kerning: measureWidth(font, sample.text, size, { ...options, features: [] }),
                noKerning: measureWidth(font, sample.text, size, { ...options, features: [], kerning: false }),
                shaped: measureWidth(font, sample.text, size, options),
              },
            });
          });
        });
      }
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
  const features = { settings: featureSettings, summary: summarizeFeatures(featureRecords), records: featureRecords };
  const deltaErrors = exactDeltaErrors(records.filter((record) => record.font !== extraSource.id));
  const breakdown = breakdownOf(records, new Map(samples.map((sample) => [sample.id, sample.text])));
  const lineWidths = corpusRecords.filter((record) => record.lengthClass === "line" && record.missing === 0).map((record) => record.canvas);
  const fractions = { line: fractionsOf(lineWidths), all: fractionsOf(records.map((record) => record.canvas)) };
  const output = {
    schema: "typeset-font-widths/3",
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
    features,
    exactDeltaErrors: deltaErrors,
    breakdown,
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
    ``,
    `| group | n | DOM against canvas px | default against GSUB model px | no ligatures px | no kerning px | space-all px | worst no-ligature sample |`,
    `|---|---|---|---|---|---|---|---|`,
    ...Object.entries(features.summary).map(([group, f]) => `| ${group} | ${f.n} | ${format(f.domAgainstCanvas)} | ${f.shapedDefault === undefined ? "-" : format(f.shapedDefault)} | ${format(f.noLigatures)} | ${format(f.noKerning)} | ${format(f.spaceAll)} | ${f.worstNoLigatures === undefined ? "-" : `${f.worstNoLigatures.sample} at ${f.worstNoLigatures.size} px`} |`),
    ``,
    `Worst line error with the HVAR deltas not rounded: ${Object.entries(deltaErrors).map(([script, value]) => `${script} ${format(value)}`).join(", ")}.`,
  ];
  console.log(lines.join("\n"));
  const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
  if (stepSummary !== undefined) appendFileSync(stepSummary, `${lines.join("\n")}\n`);
}

if (import.meta.main) await main();
