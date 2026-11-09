/**
 * The page code of the section "Justified lines". It measures the text with the canvas of the browser. It breaks the text with
 * `justifyView` and shows each line with its spaces set by the adjustment ratio. It also fills the table of the language sets.
 */
import { hyphenRecord, missRecord } from "@typeset/conformance/hyphen/records";
import { formatRatio, hyphenLoaders, isLanguageId, justifyView, languageIds, languageNames, sampleTexts, setRows, wordTarget, type Hyphenate, type JustifyView, type LanguageId } from "./justify.ts";

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the page has no element #${id}`);
  return element as T;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== "") element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

/** The state of the section. */
const state = { language: "en-us" as LanguageId, width: 300, text: sampleTexts["en-us"], custom: false };

/** The hooks that loaded, by language. */
const hooks = new Map<LanguageId, Hyphenate>();

/** This function gives the width function of the font of the lines, from the canvas of the browser. */
function canvasWidth(element: HTMLElement): (text: string) => number {
  const style = getComputedStyle(element);
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) throw new Error("the browser has no 2D canvas");
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const cache = new Map<string, number>();
  return (text) => {
    let width = cache.get(text);
    if (width === undefined) {
      width = context.measureText(text).width;
      cache.set(text, width);
    }
    return width;
  };
}

/** This function shows the lines of one breaker in its column. */
function renderColumn(prefix: string, view: JustifyView): void {
  $(`${prefix}-worst`).textContent = formatRatio(view.worst);
  $(`${prefix}-worst`).classList.toggle("jl-bad", !(view.worst <= 1));
  $(`${prefix}-lines`).textContent = String(view.lines.length);
  $(`${prefix}-hyphens`).textContent = String(view.hyphens);
  const rows = view.lines.map((line) => {
    const row = make("div", "jl-row");
    const text = make("div", "jl-line", line.text);
    text.style.width = `${state.width}px`;
    text.style.wordSpacing = `${line.extra.toFixed(3)}px`;
    const ratio = make("span", Math.abs(line.ratio) <= 1 ? "jl-r" : "jl-r jl-bad", formatRatio(line.ratio));
    ratio.title = "The adjustment ratio of the line";
    row.append(text, ratio);
    return row;
  });
  $(`${prefix}-box`).replaceChildren(...rows);
}

/** This function breaks the text with both breakers and shows the result. */
function render(): void {
  const hyphenate = hooks.get(state.language);
  const box = $("jl-fit-box");
  const widthOf = canvasWidth(box);
  const space = widthOf(" ");
  const options = { widthOf, width: state.width, stretch: space / 2, shrink: space / 3 };
  renderColumn("jl-fit", justifyView(state.text, { ...options, breaker: "total-fit", ...(hyphenate === undefined ? {} : { hyphenate }) }));
  renderColumn("jl-greedy", justifyView(state.text, { ...options, breaker: "greedy" }));
  $("jl-status").textContent = hyphenate === undefined ? `The patterns of ${languageNames[state.language]} load…` : "";
}

/** This function loads the hook of the language once, and shows the lines again when it is there. */
async function selectLanguage(language: LanguageId): Promise<void> {
  state.language = language;
  if (!state.custom) {
    state.text = sampleTexts[language];
    $<HTMLTextAreaElement>("jl-text").value = state.text;
  }
  render();
  if (hooks.has(language)) return;
  try {
    hooks.set(language, await hyphenLoaders[language]());
  } catch (error) {
    $("jl-status").textContent = `The patterns of ${languageNames[language]} did not load: ${String(error)}`;
    return;
  }
  if (state.language === language) render();
}

/** This function fills the table of the language sets from the records of the conformance package. */
function renderSets(): void {
  const rows = setRows(hyphenRecord, missRecord).map((row) => {
    const tr = make("tr");
    const name = make("td");
    name.append(make("code", "", row.language), make("p", "hint", languageNames[row.language]));
    const list = make("td", "", row.list);
    const found = make("td", "jl-found");
    const bar = make("div", "jl-bar");
    const fill = make("span", row.found >= wordTarget ? "jl-fill jl-met" : "jl-fill");
    fill.style.width = `${(row.found * 100).toFixed(1)}%`;
    const target = make("span", "jl-target");
    target.style.left = `${wordTarget * 100}%`;
    target.title = `The target: ${wordTarget * 100} %`;
    bar.append(fill, target);
    found.append(bar, make("span", "jl-share", `${(row.found * 100).toFixed(2)} %`));
    const misses = make("td", "jl-num", String(row.misses));
    misses.title = `shift ${row.classes.shift}, silent ${row.classes.silent}, other ${row.classes.other}`;
    const classes = make("p", "hint", `${row.classes.shift} shift · ${row.classes.silent} silent · ${row.classes.other} other`);
    misses.append(classes);
    tr.append(name, make("td", "jl-num", row.patterns.toLocaleString("en-US")), list, found, make("td", "jl-num", `${(row.confirmed * 100).toFixed(2)} %`), make("td", "jl-num", row.gzip.toLocaleString("en-US")), misses);
    return tr;
  });
  $("jl-sets").querySelector("tbody")!.replaceChildren(...rows);
}

/** This function starts the section: the controls, the table and the first lines. */
export function startJustify(): void {
  const select = $<HTMLSelectElement>("jl-language");
  select.replaceChildren(...languageIds.map((id) => new Option(languageNames[id], id, id === state.language, id === state.language)));
  select.addEventListener("change", () => {
    if (isLanguageId(select.value)) void selectLanguage(select.value);
  });
  const width = $<HTMLInputElement>("jl-width");
  width.value = String(state.width);
  $("jl-width-out").textContent = `${state.width} px`;
  width.addEventListener("input", () => {
    state.width = Number(width.value);
    $("jl-width-out").textContent = `${state.width} px`;
    render();
  });
  const text = $<HTMLTextAreaElement>("jl-text");
  text.value = state.text;
  text.addEventListener("input", () => {
    state.text = text.value;
    state.custom = true;
    render();
  });
  $("jl-reset").addEventListener("click", () => {
    state.custom = false;
    void selectLanguage(state.language);
  });
  renderSets();
  void selectLanguage(state.language);
}
