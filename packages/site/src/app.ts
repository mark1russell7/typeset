/** The page script of the site: the lab, the sweep and the explorer of the CI data. */
import type { LengthClass, ScriptId } from "@typeset/corpus";
import { engines, isEngineName, type EngineName } from "@mark1russell7/typeset/fonts";
import type { Cell } from "@typeset/widths";
import snapshotFile from "../data/ci-snapshot.json";
import { armOfEngine, engineChoices, engineForAgent, fontChoice, fontChoices, scriptLabels, scriptOrder, shapedScripts, type FontChoice } from "./catalog.ts";
import { formatPx, formatSigned, heatBins, heatLabel, heatLevel } from "./heat.ts";
import { labResult, previewFit, sampleText, sweepSummary, sweepTask, type LabResult, type WordView } from "./lab-model.ts";
import { loadFont, type LoadedFont } from "./load.ts";
import { allLeftOut, armMatrix, readSnapshot, statOf, type ModelChoice, type Statistic, type Summary } from "./snapshot.ts";

const snapshot = readSnapshot(snapshotFile);

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the page has no element #${id}`);
  return element as T;
}

/** This function makes an element with a class and a text. */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

/** The labels of the platforms of the arms. */
const armLabels: Readonly<Record<string, { os: string; note: string }>> = {
  "linux-1": { os: "Linux", note: "scale 1" },
  "linux-2": { os: "Linux", note: "scale 2" },
  "macos-2": { os: "macOS", note: "scale 2" },
  "windows-1": { os: "Windows", note: "scale 1" },
};

const engineNames: Readonly<Record<EngineName, string>> = { freetype: "FreeType", coretext: "CoreText", directwrite: "DirectWrite" };

const detected = engineForAgent(navigator.userAgent);

// ---------------------------------------------------------------- the state of the lab

interface LabState {
  font: string;
  weight: number;
  script: ScriptId;
  lengthClass: LengthClass;
  sample: number;
  size: number;
  engine: EngineName;
  text: string;
  /** This value is `true` when the visitor changed the text. A new sample then does not replace it until "New sample". */
  custom: boolean;
  word: number;
}

const state: LabState = { font: "noto-sans", weight: 400, script: "latin", lengthClass: "line", sample: 0, size: 16, engine: detected, text: "", custom: false, word: 0 };
let loaded: LoadedFont | undefined;
let lastResult: LabResult | undefined;

const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d")!;

function cssFont(font: LoadedFont, weight: number, size: number): string {
  return `${weight} ${size}px "${font.family}"`;
}

// ---------------------------------------------------------------- the controls

function fillSelect(select: HTMLSelectElement, options: readonly { value: string; label: string }[], value: string): void {
  select.replaceChildren(...options.map((option) => new Option(option.label, option.value, false, option.value === value)));
  select.value = value;
}

function fontLabel(choice: FontChoice): string {
  return `${choice.family} (${choice.megabytes < 1 ? choice.megabytes.toFixed(1) : Math.round(choice.megabytes)} MB)`;
}

function weightsOf(font: LoadedFont): number[] {
  const [min, max] = font.weights;
  const weights: number[] = [];
  for (let weight = 100; weight <= 900; weight += 100) if (weight >= min && weight <= max) weights.push(weight);
  return weights.length === 0 ? [400] : weights;
}

function fillControls(): void {
  fillSelect($<HTMLSelectElement>("font"), fontChoices.map((choice) => ({ value: choice.id, label: fontLabel(choice) })), state.font);
  fillSelect(
    $<HTMLSelectElement>("engine"),
    engineChoices.map((choice) => ({ value: choice.name, label: `${engineNames[choice.name]}: ${choice.platform}${choice.name === detected ? " (this device)" : ""}` })),
    state.engine,
  );
  const choice = fontChoice(state.font);
  fillSelect($<HTMLSelectElement>("script"), choice.scripts.map((script) => ({ value: script, label: scriptLabels[script] })), state.script);
  const weights = loaded?.choice.id === state.font ? weightsOf(loaded) : [state.weight];
  fillSelect($<HTMLSelectElement>("weight"), weights.map((weight) => ({ value: String(weight), label: String(weight) })), String(state.weight));
  $<HTMLInputElement>("size").value = String(state.size);
  $("size-out").textContent = `${state.size} px`;
  const engine = engineChoices.find((e) => e.name === state.engine)!;
  const scaleNote = state.engine === "freetype" && window.devicePixelRatio !== 1 ? ` Your screen has the device scale ${window.devicePixelRatio}. At a scale other than 1, Chromium on Linux rounds to 1/4 px, and this model does not match.` : "";
  $("engine-hint").textContent = `${engine.description}${state.engine === detected ? " This device uses this engine." : ` This device uses ${engineNames[detected]}, so expect a larger error.`}${scaleNote}`;
}

function newSampleText(): void {
  state.text = sampleText(state.script, state.lengthClass, state.sample);
  state.custom = false;
  $<HTMLTextAreaElement>("text").value = state.text;
}

async function selectFont(id: string): Promise<void> {
  state.font = id;
  const choice = fontChoice(id);
  if (!choice.scripts.includes(state.script)) {
    state.script = choice.scripts[0]!;
    if (!state.custom) newSampleText();
  }
  fillControls();
  const status = $("status");
  status.textContent = `Loading ${choice.family}, ${fontLabel(choice).replace(/^.*\(/, "").replace(")", "")}…`;
  try {
    const font = await loadFont(choice, (share) => {
      status.textContent = `Loading ${choice.family}: ${Math.round(share * 100)}%`;
    });
    if (state.font !== id) return;
    loaded = font;
    const weights = weightsOf(font);
    if (!weights.includes(state.weight)) state.weight = weights.includes(400) ? 400 : weights[0]!;
    status.textContent = "";
    fillControls();
    update();
  } catch (error) {
    status.textContent = `The font did not load: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ---------------------------------------------------------------- the lab

function update(): void {
  if (loaded === undefined || loaded.choice.id !== state.font) return;
  const font = loaded.model(state.engine, state.weight);
  measureContext.font = cssFont(loaded, state.weight, state.size);
  const { rounding, sum } = engines[state.engine];
  const result = labResult({ font, text: state.text, size: state.size, script: state.script, rounding, sum }, (text) => measureContext.measureText(text).width);
  lastResult = result;
  $("r-canvas").textContent = formatPx(result.canvas);
  $("r-model").textContent = formatPx(result.model);
  const error = $("r-error");
  error.textContent = formatSigned(result.error);
  error.parentElement!.dataset["level"] = String(heatLevel(result.error));
  $("upem").textContent = String(font.unitsPerEm);
  const notes: string[] = [];
  if (state.text === "") notes.push("The text is empty.");
  if (result.missing > 0) notes.push(`The font has no glyph for ${result.missing} ${result.missing === 1 ? "character" : "characters"}. The browser draws them with a fallback font, so the error is not valid.`);
  if (shapedScripts.has(state.script)) notes.push(`${scriptLabels[state.script]} needs a shaper for joining forms or clusters. The model does not shape it yet, so a large error is expected.`);
  $("notes").replaceChildren(...notes.map((note) => make("p", "note", note)));
  if (state.word >= result.words.length) state.word = 0;
  drawPreview(result);
  renderWords(result);
  renderGlyphs(result.words[state.word]);
}

function ink(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function drawPreview(result: LabResult): void {
  if (loaded === undefined) return;
  const canvas = $<HTMLCanvasElement>("preview");
  const scale = window.devicePixelRatio || 1;
  const pad = 12;
  const maxWidth = Math.floor(16000 / scale);
  const textWidth = Math.max(result.model, result.canvas);
  const width = Math.min(maxWidth, Math.ceil(textWidth + 2 * pad + 40));
  const lineHeight = Math.ceil(state.size * 1.5);
  const height = lineHeight + 54;
  // The drawing fits the width of its box, so the text, the ticks and the bars keep one scale
  const available = canvas.parentElement?.clientWidth ?? width;
  const fit = previewFit(width, available);
  canvas.style.width = `${width * fit}px`;
  canvas.style.height = `${height * fit}px`;
  canvas.width = Math.round(width * fit * scale);
  canvas.height = Math.round(height * fit * scale);
  const scaleNote = fit < 1 ? ` The drawing is at ${Math.round(fit * 100)} % to fit the box.` : "";
  $("preview-scale").textContent = width * fit > available + 0.5 ? `${scaleNote} Scroll the box to see the rest.` : scaleNote;
  const context = canvas.getContext("2d")!;
  context.setTransform(scale * fit, 0, 0, scale * fit, 0, 0);
  context.clearRect(0, 0, width, height);
  const rtl = state.script === "arabic" || state.script === "hebrew";
  const baseline = Math.round(lineHeight * 0.72);
  // The ticks of the model: the end of each glyph, from the start of the text
  context.fillStyle = ink("--tick");
  let x = 0;
  for (const word of result.words) {
    for (const glyph of word.glyphs) {
      x += glyph.px;
      const at = rtl ? pad + result.canvas - x : pad + x;
      context.fillRect(Math.round(at * 4) / 4 - 0.5, 4, 1, lineHeight - 4);
    }
  }
  context.font = cssFont(loaded, state.weight, state.size);
  context.fillStyle = ink("--text");
  context.direction = rtl ? "rtl" : "ltr";
  context.textAlign = rtl ? "right" : "left";
  context.fillText(state.text, rtl ? pad + result.canvas : pad, baseline);
  context.direction = "ltr";
  context.textAlign = "left";
  // The two bars, with the end of each one
  const bars: { label: string; width: number; color: string; y: number }[] = [
    { label: "canvas", width: result.canvas, color: ink("--bar-canvas"), y: lineHeight + 6 },
    { label: "model", width: result.model, color: ink("--bar-model"), y: lineHeight + 28 },
  ];
  context.font = "12px system-ui, sans-serif";
  for (const bar of bars) {
    const start = rtl ? pad + result.canvas - bar.width : pad;
    context.fillStyle = bar.color;
    context.fillRect(start, bar.y, Math.min(bar.width, maxWidth), 8);
    context.fillRect(start + bar.width - 1, bar.y - 3, 2, 14);
    context.fillStyle = ink("--muted");
    context.fillText(bar.label, start + 2, bar.y + 20);
  }
}

function renderWords(result: LabResult): void {
  const box = $("words");
  const chips = result.words.map((word, index) => {
    const chip = make("button", word.space ? "chip space" : "chip");
    chip.type = "button";
    chip.dataset["level"] = String(heatLevel(word.error));
    chip.setAttribute("aria-pressed", String(index === state.word));
    const text = make("span", "chip-text", word.space ? "␣" : word.text);
    if (!word.space && loaded !== undefined) text.style.fontFamily = `"${loaded.family}"`;
    if (!word.space) text.style.fontWeight = String(state.weight);
    chip.append(text, make("span", "chip-err", formatSigned(word.error)));
    chip.title = `${word.space ? "space" : word.text}: model ${formatPx(word.model)} px, canvas ${formatPx(word.canvas)} px`;
    chip.addEventListener("click", () => {
      state.word = index;
      for (const other of box.querySelectorAll(".chip")) other.setAttribute("aria-pressed", "false");
      chip.setAttribute("aria-pressed", "true");
      renderGlyphs(word);
    });
    return chip;
  });
  box.replaceChildren(...chips);
}

function renderGlyphs(word: WordView | undefined): void {
  const body = $("glyphs").querySelector("tbody")!;
  $("glyph-word").textContent = word === undefined ? "no word" : word.space ? "a space" : `“${word.text}”`;
  if (word === undefined) {
    body.replaceChildren();
    return;
  }
  body.replaceChildren(
    ...word.glyphs.map((glyph) => {
      const row = make("tr");
      const char = make("td", "char", glyph.text === " " ? "␣" : glyph.text || "·");
      if (loaded !== undefined) char.style.fontFamily = `"${loaded.family}"`;
      row.append(char, make("td", "", String(glyph.glyph)), make("td", "", String(glyph.advance)), make("td", glyph.kerning === 0 ? "zero" : "", glyph.kerning === 0 ? "0" : formatSigned(glyph.kerning)), make("td", "", formatPx(glyph.px)));
      return row;
    }),
  );
}

// ---------------------------------------------------------------- the tooltip

const tip = $("tip");

function showTip(target: HTMLElement, lines: readonly string[]): void {
  tip.replaceChildren(...lines.map((line, i) => make(i === 0 ? "strong" : "span", "", line)));
  tip.hidden = false;
  const box = target.getBoundingClientRect();
  const width = tip.offsetWidth;
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, box.left + box.width / 2 - width / 2));
  const top = box.top - tip.offsetHeight - 8;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${(top < 8 ? box.bottom + 8 : top) + window.scrollY}px`;
}

function hideTip(): void {
  tip.hidden = true;
}

function cellLines(title: string, cell: Cell | undefined): string[] {
  if (cell === undefined) return [title, "No texts."];
  if (cell.n === 0) return [title, cell.excluded > 0 ? `No widths: all ${cell.excluded} texts have a character with no glyph in the font, so the browser draws it with a fallback font.` : "No texts."];
  const lines = [title, `worst ${formatPx(cell.worstPx)} px, 90th percentile ${formatPx(cell.p90Px)} px, mean ${formatPx(cell.meanPx)} px`, `${cell.n} widths${cell.excluded > 0 ? `, ${cell.excluded} left out for a missing glyph` : ""}`];
  if (cell.worst !== undefined) lines.push(`worst text: ${cell.worst.sample} in ${cell.worst.font} at ${cell.worst.size} px`);
  return lines;
}

function heatCell(value: number, lines: readonly string[], onSelect?: () => void): HTMLTableCellElement {
  const td = make("td", "cell");
  const button = make("button", "heat-cell", formatPx(value));
  button.type = "button";
  button.dataset["level"] = String(heatLevel(value));
  button.setAttribute("aria-label", lines.join(". "));
  button.addEventListener("pointerenter", () => showTip(button, lines));
  button.addEventListener("pointerleave", hideTip);
  button.addEventListener("focus", () => showTip(button, lines));
  button.addEventListener("blur", hideTip);
  if (onSelect !== undefined) button.addEventListener("click", onSelect);
  td.append(button);
  return td;
}

// ---------------------------------------------------------------- the explorer of the CI data

function renderTiles(): void {
  const tiles = snapshot.arms.map((arm) => {
    const cell = arm.engineSummary.latin?.line;
    const label = armLabels[arm.arm] ?? { os: arm.arm, note: "" };
    const tile = make("div", "tile");
    tile.dataset["level"] = String(heatLevel(statOf(cell, "worstPx")));
    const mine = isEngineName(arm.engine) && arm.engine === detected && armOfEngine[detected] === arm.arm;
    tile.append(
      make("span", "tile-k", `${label.os}, ${label.note}${mine ? " · like this device" : ""}`),
      make("span", "tile-v", `${formatPx(statOf(cell, "worstPx"))} px`),
      make("span", "tile-u", `worst Latin line, ${isEngineName(arm.engine) ? engineNames[arm.engine] : arm.engine} model`),
    );
    return tile;
  });
  $("tiles").replaceChildren(...tiles);
}

function renderCi(): void {
  const model = $<HTMLSelectElement>("ci-model").value as ModelChoice;
  const lengthClass = $<HTMLSelectElement>("ci-class").value as LengthClass;
  const statistic = $<HTMLSelectElement>("ci-stat").value as Statistic;
  const rows = armMatrix(snapshot, model, lengthClass, scriptOrder, "Source Sans 3");
  const table = $<HTMLTableElement>("ci-table");
  const head = make("tr");
  head.append(make("th", "row-head", "Script"));
  for (const arm of snapshot.arms) {
    const label = armLabels[arm.arm] ?? { os: arm.arm, note: "" };
    const th = make("th", "arm");
    th.append(make("span", "arm-os", label.os), make("span", "arm-note", `${isEngineName(arm.engine) ? engineNames[arm.engine] : arm.engine}, ${label.note}`));
    head.append(th);
  }
  const body = rows.map((row) => {
    const tr = make("tr");
    const script = row.key as ScriptId;
    const name = scriptLabels[script] ?? row.label;
    const th = make("th", "row-head", name);
    if (shapedScripts.has(script)) th.append(make("span", "flag", "needs a shaper"));
    else if (allLeftOut(row.cells)) th.append(make("span", "flag", "glyphs not in the font"));
    tr.append(th);
    row.cells.forEach((cell, i) => {
      const arm = snapshot.arms[i]!;
      const title = `${name} on ${armLabels[arm.arm]?.os ?? arm.arm} (${arm.arm})`;
      tr.append(heatCell(statOf(cell, statistic), cellLines(title, cell), () => renderDetail(title, cell, arm.chromium)));
    });
    return tr;
  });
  table.replaceChildren(make("thead"), make("tbody"));
  table.tHead!.append(head);
  table.tBodies[0]!.append(...body);
}

function renderDetail(title: string, cell: Cell | undefined, chromium: string): void {
  const box = $("ci-detail");
  const lines = cellLines(title, cell);
  box.replaceChildren(make("h3", "", lines[0]!), ...lines.slice(1).map((line) => make("p", "", line)), make("p", "hint", `Chromium ${chromium}. The pixel model rounds each advance to whole px. It gives the same width as the canvas for ${cell?.pixelExact ?? 0} of ${cell?.n ?? 0} texts here.`));
}

function renderRun(): void {
  const run = snapshot.run;
  const link = make("a", "", `fonts run ${run.id}`);
  link.href = `https://github.com/mark1russell7/typeset/actions/runs/${run.id}`;
  const box = $("ci-run");
  box.replaceChildren(
    "Headless Chromium in GitHub Actions, on four platforms, measured ",
    `${snapshot.corpus.samples} texts at 6 sizes. Data: `,
    link,
    `, ${run.date}, commit ${run.sha.slice(0, 7)}.`,
  );
}

function renderLegend(): void {
  const legend = $("legend");
  const items = [...heatBins.map((_, i) => i), heatBins.length].map((level) => {
    const item = make("span", "legend-item");
    const swatch = make("span", "swatch");
    swatch.dataset["level"] = String(level);
    item.append(swatch, make("span", "", `${heatLabel(level)} px`));
    return item;
  });
  legend.replaceChildren(make("span", "legend-title", "Error, model minus canvas:"), ...items);
}

// ---------------------------------------------------------------- the sweep

interface SweepRow {
  readonly key: string;
  readonly label: string;
  readonly engine: EngineName;
  readonly summary: Summary;
}

const sweeps = new Map<string, SweepRow>();
let sweeping = false;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function sweepFont(choice: FontChoice, weight: number, engine: EngineName, report: (text: string, share: number) => void): Promise<void> {
  const font = await loadFont(choice, (share) => report(`Loading ${choice.family}: ${Math.round(share * 100)}%`, share * 0.3));
  const [min, max] = font.weights;
  const used = Math.min(max, Math.max(min, weight));
  const model = font.model(engine, used);
  const task = sweepTask(choice.id, used, choice.scripts, 40);
  const texts = task.samples.map((sample) => sample.text);
  const canvas: number[][] = [];
  const total = task.sizes.length * texts.length;
  let done = 0;
  for (const size of task.sizes) {
    measureContext.font = cssFont(font, used, size);
    const row: number[] = [];
    for (const text of texts) {
      row.push(measureContext.measureText(text).width);
      if (++done % 400 === 0) {
        report(`Measuring ${choice.family}: ${done} of ${total} widths`, 0.3 + (0.5 * done) / total);
        await nextFrame();
      }
    }
    canvas.push(row);
  }
  report(`Scoring ${choice.family}`, 0.85);
  await nextFrame();
  const summary = sweepSummary(task, model, canvas, engines[engine].rounding, engines[engine].sum);
  const key = `${choice.id}/${used}/${engine}`;
  sweeps.set(key, { key, label: `${choice.family} ${used}`, engine, summary });
  renderSweep();
}

async function runSweep(list: readonly FontChoice[]): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  const buttons = [$<HTMLButtonElement>("sweep-one"), $<HTMLButtonElement>("sweep-all")];
  for (const button of buttons) button.disabled = true;
  const progress = $("sweep-progress");
  progress.hidden = false;
  try {
    for (const [i, choice] of list.entries()) {
      const weight = list.length === 1 ? state.weight : 400;
      await sweepFont(choice, weight, state.engine, (text, share) => {
        $("sweep-text").textContent = list.length === 1 ? text : `${text} (font ${i + 1} of ${list.length})`;
        $("sweep-bar").style.width = `${Math.round(((i + share) / list.length) * 100)}%`;
      });
    }
    $("sweep-text").textContent = "Done.";
    $("sweep-bar").style.width = "100%";
  } catch (error) {
    $("sweep-text").textContent = `The sweep stopped: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    sweeping = false;
    for (const button of buttons) button.disabled = false;
  }
}

function renderSweep(): void {
  const lengthClass = $<HTMLSelectElement>("sweep-class").value as LengthClass;
  const statistic = $<HTMLSelectElement>("sweep-stat").value as Statistic;
  const rows = [...sweeps.values()];
  $("sweep-empty").hidden = rows.length > 0;
  const table = $<HTMLTableElement>("sweep-table");
  if (rows.length === 0) {
    table.replaceChildren();
    return;
  }
  const scripts = scriptOrder.filter((script) => rows.some((row) => row.summary[script]?.[lengthClass] !== undefined));
  const head = make("tr");
  head.append(make("th", "row-head", "Font"), ...scripts.map((script) => make("th", "script-head", scriptLabels[script])));
  const body = rows.map((row) => {
    const tr = make("tr");
    const th = make("th", "row-head", row.label);
    th.append(make("span", "flag plain", engineNames[row.engine]));
    tr.append(th);
    for (const script of scripts) {
      const cell = row.summary[script]?.[lengthClass];
      if (cell === undefined) {
        tr.append(make("td", "cell empty"));
        continue;
      }
      const arm = armOfEngine[row.engine];
      const ci = snapshot.arms.find((a) => a.arm === arm)?.engineSummary[script]?.[lengthClass];
      const lines = cellLines(`${row.label}, ${scriptLabels[script]}, in this browser`, cell);
      lines.push(`CI on ${arm}, all fonts of the script: ${formatPx(statOf(ci, statistic))} px`);
      tr.append(heatCell(statOf(cell, statistic), lines));
    }
    return tr;
  });
  table.replaceChildren(make("thead"), make("tbody"));
  table.tHead!.append(head);
  table.tBodies[0]!.append(...body);
}

// ---------------------------------------------------------------- the events

function bind(): void {
  $<HTMLSelectElement>("font").addEventListener("change", (event) => void selectFont((event.target as HTMLSelectElement).value));
  $<HTMLSelectElement>("weight").addEventListener("change", (event) => {
    state.weight = Number((event.target as HTMLSelectElement).value);
    update();
  });
  $<HTMLSelectElement>("script").addEventListener("change", (event) => {
    state.script = (event.target as HTMLSelectElement).value as ScriptId;
    state.sample = 0;
    newSampleText();
    update();
  });
  $<HTMLSelectElement>("length").addEventListener("change", (event) => {
    state.lengthClass = (event.target as HTMLSelectElement).value as LengthClass;
    newSampleText();
    update();
  });
  $<HTMLInputElement>("size").addEventListener("input", (event) => {
    state.size = Number((event.target as HTMLInputElement).value);
    $("size-out").textContent = `${state.size} px`;
    update();
  });
  $<HTMLSelectElement>("engine").addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (isEngineName(value)) state.engine = value;
    fillControls();
    update();
  });
  $<HTMLTextAreaElement>("text").addEventListener("input", (event) => {
    state.text = (event.target as HTMLTextAreaElement).value;
    state.custom = true;
    update();
  });
  $<HTMLButtonElement>("next").addEventListener("click", () => {
    state.sample = (state.sample + 1) % 40;
    newSampleText();
    update();
  });
  $<HTMLButtonElement>("sweep-one").addEventListener("click", () => void runSweep([fontChoice(state.font)]));
  $<HTMLButtonElement>("sweep-all").addEventListener("click", () => void runSweep(fontChoices));
  for (const id of ["sweep-class", "sweep-stat"]) $(id).addEventListener("change", renderSweep);
  for (const id of ["ci-model", "ci-class", "ci-stat"]) $(id).addEventListener("change", renderCi);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => lastResult !== undefined && drawPreview(lastResult));
  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => lastResult !== undefined && drawPreview(lastResult));
  });
  window.addEventListener("scroll", hideTip, { passive: true });
}

newSampleText();
fillControls();
renderTiles();
renderRun();
renderCi();
renderLegend();
renderSweep();
bind();
// The address `?sweep` also starts a sweep of the lab font, so a link can show a finished sweep
const first = selectFont(state.font);
if (new URLSearchParams(location.search).has("sweep")) void first.then(() => runSweep([fontChoice(state.font)]));
