import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hyphenRecord as hyphenFile, missRecord as missesFile } from "@typeset/conformance/hyphen/records";
import { formatRatio, hyphenLoaders, justifyView, languageIds, sampleTexts, setRows, wordTarget, type JustifyOptions } from "./justify.ts";

/** The width of each code point: 8 units, as in the study of the breakers. */
const widthOf = (text: string): number => 8 * [...text].length;
const glue = { stretch: 4, shrink: 8 / 3 };

describe("the justified lines of the section", () => {
  it("gives each line a ratio that fills the width, and a last line that does not stretch", () => {
    const view = justifyView("aa bb cc dd ee ff", { widthOf, width: 56, breaker: "total-fit", ...glue });
    expect(view.lines.map((line) => line.text)).toEqual(["aa bb", "cc dd", "ee ff"]);
    // A line of 5 code points has 40 units, so its one space stretches by 16 units: a ratio of 4.
    expect(view.lines.map((line) => line.ratio)).toEqual([4, 4, 0]);
    expect(view.lines.map((line) => line.extra)).toEqual([16, 16, 0]);
    expect(view.worst).toBe(4);
    expect(view.hyphens).toBe(0);
  });

  it("shrinks the spaces of a line with a negative ratio", () => {
    const view = justifyView("aaaa bbbb", { widthOf, width: 70, breaker: "total-fit", ...glue });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]!.ratio).toBeCloseTo(-0.75);
    expect(view.lines[0]!.extra).toBeCloseTo(-2);
  });

  it("gives an infinite ratio for a line with no glue and free space, and the page shows it as a word", () => {
    const view = justifyView("aaaa", { widthOf, width: 16, breaker: "greedy", ...glue });
    expect(view.worst).toBe(Infinity);
    expect(view.lines[0]!.extra).toBe(0);
    expect([formatRatio(view.lines[0]!.ratio), formatRatio(-0.001), formatRatio(1.234)]).toEqual(["no glue", "0.00", "1.23"]);
  });

  it("breaks the sample of each language at hyphens in a narrow line, with a worst ratio that is not more than greedy", { timeout: 30_000 }, async () => {
    for (const language of languageIds) {
      const hyphenate = await hyphenLoaders[language]();
      const options: JustifyOptions = { widthOf, width: 8 * 24, breaker: "total-fit", ...glue, hyphenate };
      const hyphens = justifyView(sampleTexts[language], options);
      const greedy = justifyView(sampleTexts[language], { ...options, breaker: "greedy", hyphenate: () => [] });
      expect(hyphens.hyphens, language).toBeGreaterThan(0);
      expect(hyphens.lines.filter((line) => line.hyphen).every((line) => line.text.endsWith("-")), language).toBe(true);
      expect(hyphens.worst, language).toBeLessThanOrEqual(greedy.worst);
    }
  });
});

describe("the records of the language sets", () => {
  it("gives a row for each language from the data files of the conformance package", () => {
    const rows = setRows(hyphenFile, missesFile);
    expect(rows.map((row) => row.language)).toEqual(["en-us", "de", "fr", "es"]);
    for (const row of rows) {
      expect(row.found, row.language).toBeLessThanOrEqual(1);
      expect(row.misses, row.language).toBe(row.classes.shift + row.classes.silent + row.classes.other);
      expect(row.gzip, row.language).toBeGreaterThan(0);
    }
    expect(rows.find((row) => row.language === "de")!.found).toBeGreaterThanOrEqual(wordTarget);
  });

  it("refuses a record with no language or with a share above 1", () => {
    expect(() => setRows({ languages: {} }, missesFile)).toThrow("hyphen.languages.en-us");
    const languages = { ...hyphenFile.languages, fr: { ...hyphenFile.languages["fr"], found: 1.5 } };
    expect(() => setRows({ ...hyphenFile, languages }, missesFile)).toThrow("hyphen.languages.fr.found");
  });
});

describe("the page of the section", () => {
  it("has each element that the page code of the section uses", () => {
    const folder = import.meta.dirname;
    const page = readFileSync(join(folder, "..", "index.html"), "utf8");
    const code = readFileSync(join(folder, "justify-page.ts"), "utf8");
    const ids = [...code.matchAll(/\$(?:<\w+>)?\("([\w-]+)"\)/gu)].map((match) => match[1]!);
    for (const prefix of ["jl-fit", "jl-greedy"]) for (const suffix of ["worst", "lines", "hyphens", "box"]) ids.push(`${prefix}-${suffix}`);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(page, id).toContain(`id="${id}"`);
  });
});

describe("the load of the patterns", () => {
  it("has no static import of a language subpath in a module of the site, so the entry chunk holds no pattern data", () => {
    const folder = import.meta.dirname;
    const modules = readdirSync(folder).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    const staticImport = /^\s*(?:import|export)\b[^;]*?from\s*["']@mark1russell7\/typeset\/hyphen(?:\/[^"']*)?["']/mu;
    for (const name of modules) expect(staticImport.test(readFileSync(join(folder, name), "utf8")), name).toBe(false);
    const model = readFileSync(join(folder, "justify.ts"), "utf8");
    for (const language of languageIds) expect(model).toContain(`import("@mark1russell7/typeset/hyphen/${language}")`);
  });
});
