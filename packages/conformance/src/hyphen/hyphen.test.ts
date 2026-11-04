import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { source as deSource, hyphenate as deHyphenate } from "@mark1russell7/typeset/hyphen/de";
import { source as enSource, hyphenate as enHyphenate } from "@mark1russell7/typeset/hyphen/en-us";
import { source as frSource, hyphenate as frHyphenate } from "@mark1russell7/typeset/hyphen/fr";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { gzipTolerance, hyphenPaths, recordDifferences, sampleHash, weighEntry, type HyphenRecord } from "./gate.ts";
import { parsePatterns, setSource } from "./patterns.ts";
import { hyphenFiles, hyphenUrl, texHyphenCommit } from "./sources.ts";
import { parseWords, scoreWords, share } from "./words.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const paths = hyphenPaths(root);
const record = JSON.parse(readFileSync(paths.record, "utf8")) as HyphenRecord;
const sets = { "en-us": { source: enSource, hyphenate: enHyphenate }, de: { source: deSource, hyphenate: deHyphenate }, fr: { source: frSource, hyphenate: frHyphenate } };

const file = [
  "% title: A test",
  "% copyright: Copyright (C) 2026 A Person",
  "% licence:",
  "%     name: MIT",
  "% hyphenmins:",
  "%     generation:",
  "%         left: 1",
  "%         right: 1",
  "%     typesetting:",
  "%         left: 2",
  "%         right: 3",
  "% other: not a notice",
  "\\patterns{ % a comment } with a brace",
  "a1b",
  "  .c2d 3e",
  "}",
  "\\hyphenation{",
  "ta-ble",
  "}",
].join("\r\n");

describe("parsePatterns", () => {
  it("reads the patterns, the exceptions, the typesetting limits and the notice", () => {
    const data = parsePatterns(file);
    expect(data).toMatchObject({ patterns: "a1b .c2d 3e", exceptions: "ta-ble", left: 2, right: 3 });
    expect(data.notice).toEqual(["title: A test", "copyright: Copyright (C) 2026 A Person", "licence:", "    name: MIT"]);
  });

  it("refuses a file with no patterns or no limits", () => {
    expect(() => parsePatterns("% hyphenmins:\n% typesetting:\n%   left: 2\n%   right: 2\n")).toThrow("no patterns");
    expect(() => parsePatterns("\\patterns{a1}")).toThrow("hyphenmins");
  });
});

describe("setSource", () => {
  it("keeps the notice with the data in a legal comment", () => {
    const source = setSource(parsePatterns(file), enSource);
    expect(source.startsWith("/*!\n * title: A test\n * copyright: Copyright (C) 2026 A Person\n")).toBe(true);
    expect(source).toContain('"patterns":"a1b .c2d 3e"');
  });

  it("gives the committed modules a notice that bundles keep", () => {
    for (const { language } of hyphenFiles) {
      expect(readFileSync(paths.source(language), "utf8").slice(0, 3)).toBe("/*!");
      const code = new TextDecoder().decode(buildSync({ entryPoints: [paths.source(language)], bundle: true, minify: true, format: "esm", write: false, logLevel: "silent" }).outputFiles[0]!.contents);
      expect(code).toContain("Copyright");
    }
  });
});

describe("scoreWords", () => {
  const words = parseWords("hy-phen ta-ble");

  it("reads the places of each word", () => {
    expect(words).toEqual([
      { word: "hyphen", places: [2] },
      { word: "table", places: [2] },
    ]);
  });

  it("counts the places of the list, of the set and of both, and the limits take away a place of the list", () => {
    expect(scoreWords(words, (word) => (word === "hyphen" ? [2, 3] : []), 1, 1)).toEqual({ words: 2, listed: 2, given: 2, both: 1 });
    expect(scoreWords(words, () => [], 3, 1).listed).toBe(0);
    expect(share(1, 3)).toBe(0.3333);
    expect(share(1, 0)).toBe(0);
  });
});

describe("each language set on its word list", () => {
  it("has each set of the sources", () => {
    expect(Object.keys(sets).sort()).toEqual(hyphenFiles.map((source) => source.language).sort());
    expect(hyphenFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const hyphen of hyphenFiles) {
    const set = sets[hyphen.language as keyof typeof sets];
    const words = parseWords(readFileSync(paths.words(hyphen.language), "utf8"));
    const limits = /"left":(\d),"right":(\d)/u.exec(readFileSync(paths.source(hyphen.language), "utf8"))!;
    const left = Number(limits[1]);
    const right = Number(limits[2]);
    const score = scoreWords(words, set.hyphenate, left, right);

    it(`${hyphen.language}: the list confirms at least 95 % of the places that the set gives`, () => {
      expect(words.length).toBe(10000);
      expect(score.given).toBeGreaterThan(10000);
      expect(score.both / score.given).toBeGreaterThanOrEqual(0.95);
    });

    it(`${hyphen.language}: a set with a shift of one character does not pass, so the score sees the places`, () => {
      const shifted = scoreWords(words, (word) => set.hyphenate(word).map((offset) => offset + 1), left, right);
      expect(shifted.both / shifted.given).toBeLessThan(0.5);
    });

    it(`${hyphen.language}: the record and the set list this result`, () => {
      const language = record.languages[hyphen.language]!;
      expect(language.sample).toBe(sampleHash(readFileSync(paths.words(hyphen.language), "utf8")));
      expect(language.score).toEqual(score);
      expect(language.confirmed).toBe(share(score.both, score.given));
      expect(language.found).toBe(share(score.both, score.listed));
      expect(set.source.words).toEqual({ list: hyphen.list.name, independent: hyphen.list.independent, count: words.length, found: language.found, confirmed: language.confirmed });
      expect(set.source).toMatchObject({ commit: texHyphenCommit, sha256: hyphen.sha256, license: hyphen.license, file: hyphen.name });
    });

    it(`${hyphen.language}: the weight in the record is the weight of the entry`, () => {
      const { minified, gzip } = weighEntry(paths.source(hyphen.language));
      expect(minified).toBe(record.languages[hyphen.language]!.weight.minified);
      expect(Math.abs(gzip - record.languages[hyphen.language]!.weight.gzip)).toBeLessThanOrEqual(gzipTolerance * gzip);
    });
  }
});

describe("recordDifferences", () => {
  const language = record.languages["fr"]!;

  it("finds no difference in the same record, and it finds each stale field", () => {
    expect(recordDifferences(record, record)).toEqual([]);
    expect(recordDifferences(record, { ...record, languages: { ...record.languages, fr: { ...language, confirmed: 0.5 } } })).toHaveLength(1);
    expect(recordDifferences(record, { ...record, languages: { ...record.languages, fr: { ...language, weight: { ...language.weight, minified: 1 } } } })).toEqual(["the weight of fr differs from the record"]);
    expect(recordDifferences(record, { ...record, matcher: { minified: 1, gzip: 1 } })).toEqual(["the weight of the matcher differs from the record"]);
  });

  it("allows a small difference of the gzip bytes, and not a larger one", () => {
    const withGzip = (gzip: number): HyphenRecord => ({ ...record, languages: { ...record.languages, fr: { ...language, weight: { ...language.weight, gzip } } } });
    expect(recordDifferences(record, withGzip(language.weight.gzip + 5))).toEqual([]);
    expect(recordDifferences(record, withGzip(language.weight.gzip + 500))).toHaveLength(1);
  });
});

describe("the entries of the package", () => {
  const folder = join(root, "packages", "typeset");
  const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { exports: Record<string, string>; publishConfig: { exports: Record<string, unknown> } };

  it("gives each language its own subpath in the workspace and in the release", () => {
    for (const { language } of hyphenFiles) {
      expect(manifest.exports[`./hyphen/${language}`]).toBe(`./src/hyphen/${language}.ts`);
      expect(manifest.publishConfig.exports[`./hyphen/${language}`]).toEqual({ types: `./build/hyphen/${language}.d.ts`, default: `./build/hyphen/${language}.js` });
      expect(readFileSync(join(folder, "tsdown.config.ts"), "utf8")).toContain(`"src/hyphen/${language}.ts"`);
    }
  });

  it("keeps each language set out of the root entry, out of ./breaking and out of each other subpath", () => {
    const entries = Object.entries(manifest.exports).filter(([name]) => name !== "./package.json" && !name.startsWith("./hyphen/"));
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const [name, entry] of entries) {
      const { metafile } = buildSync({ absWorkingDir: folder, entryPoints: [entry], bundle: true, format: "esm", platform: "browser", write: false, metafile: true, logLevel: "silent" });
      const inputs = Object.keys(metafile.inputs);
      expect(inputs.length, name).toBeGreaterThan(0);
      for (const { language } of hyphenFiles) expect(inputs.filter((input) => input.endsWith(`hyphen/${language}.ts`)), name).toEqual([]);
    }
  });

  it("has the URL of the pinned commit", () => {
    expect(hyphenUrl(hyphenFiles[0]!)).toBe(`https://raw.githubusercontent.com/hyphenation/tex-hyphen/${texHyphenCommit}/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-en-us.tex`);
  });
});
