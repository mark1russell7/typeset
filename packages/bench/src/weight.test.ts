import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareWeights, publicEntries, sameWeights, weighTree, type Weights } from "./weight.ts";

const weights = (gzip: Record<string, number>): Weights => Object.fromEntries(Object.entries(gzip).map(([entry, bytes]) => [entry, { minified: bytes * 2, gzip: bytes, files: {} }]));

describe("publicEntries", () => {
  it("leaves out the package file", () => {
    expect(publicEntries({ ".": "./src/index.ts", "./package.json": "./package.json" })).toEqual([[".", "./src/index.ts"]]);
  });
});

describe("compareWeights", () => {
  const release = weights({ ".": 1000 });

  it("passes a growth equal to the limit, and flags one byte more", () => {
    expect(compareWeights(weights({ ".": 1100 }), release, 100)[0]).toMatchObject({ releaseMinified: 2000, releaseGzip: 1000, growth: 100, over: false });
    expect(compareWeights(weights({ ".": 1101 }), release, 100)[0]).toMatchObject({ growth: 101, over: true });
  });

  it("passes a smaller entry", () => {
    expect(compareWeights(weights({ ".": 900 }), release, 0)[0]).toMatchObject({ growth: -100, over: false });
  });

  it("only reports when the limit is null", () => {
    expect(compareWeights(weights({ ".": 9000 }), release, null)[0]).toMatchObject({ growth: 8000, over: false });
  });

  const line = { limitGzipBytes: 5000, baseGzipBytes: 4000, run: "1", reason: "a test" };

  it("fails an entry that the release does not have and that has no line", () => {
    expect(compareWeights(weights({ "./new": 10 }), release, 1792)[0]).toMatchObject({ releaseGzip: null, growth: null, over: true, cause: "no-line" });
    expect(compareWeights(weights({ "./new": 10 }), release, null)[0]).toMatchObject({ over: false });
  });

  it("passes a new entry at the limit of its line, and fails one byte more", () => {
    expect(compareWeights(weights({ "./new": 5000 }), release, 1792, { "./new": line })[0]).toMatchObject({ growth: 1000, over: false, line });
    expect(compareWeights(weights({ "./new": 5001 }), release, 1792, { "./new": line })[0]).toMatchObject({ over: true, cause: "line-limit" });
    // A first measure over its line fails.
    expect(compareWeights(weights({ "./new": 6000 }), release, 1792, { "./new": { ...line, baseGzipBytes: 6000 } })[0]).toMatchObject({ growth: 0, over: true, cause: "line-limit" });
  });

  it("limits the growth above the base of the line to the limit", () => {
    const wide = { ...line, limitGzipBytes: 100000 };
    expect(compareWeights(weights({ "./new": 5792 }), release, 1792, { "./new": wide })[0]).toMatchObject({ growth: 1792, over: false });
    expect(compareWeights(weights({ "./new": 5793 }), release, 1792, { "./new": wide })[0]).toMatchObject({ growth: 1793, over: true, cause: "growth" });
  });

  it("ignores the line when the release has the entry, and takes the growth from the release", () => {
    const row = compareWeights(weights({ ".": 1100 }), release, 1792, { ".": { ...line, limitGzipBytes: 10, baseGzipBytes: 10 } })[0];
    expect(row).toMatchObject({ releaseGzip: 1000, growth: 100, over: false });
    expect(row).not.toHaveProperty("line");
  });
});

describe("sameWeights", () => {
  it("finds a difference of one byte", () => {
    expect(sameWeights(weights({ ".": 10 }), weights({ ".": 10 }))).toBe(true);
    expect(sameWeights(weights({ ".": 10 }), weights({ ".": 11 }))).toBe(false);
  });
});

describe("weighTree", () => {
  const root = fileURLToPath(new URL("../../typeset/", import.meta.url));
  const nodePaths = [join(root, "node_modules")];
  const measured = weighTree(root, nodePaths);

  it("gives equal bytes for two measures of one tree", () => {
    expect(sameWeights(measured, weighTree(root, nodePaths))).toBe(true);
  });

  it("gives gzip bytes smaller than the minified bytes", () => {
    for (const weight of Object.values(measured)) expect(weight.gzip).toBeLessThan(weight.minified);
  });

  it("gives 0 bytes for a file that the exports of an entry do not use", () => {
    // The kerning of a context is in the reader of a font, and `./fonts/inspect` does not read a font
    expect(Object.keys(measured["./fonts/inspect"]!.files).filter((path) => path.endsWith("fonts/context.ts"))).toEqual([]);
    expect(Object.keys(measured["./fonts"]!.files).filter((path) => path.endsWith("fonts/context.ts"))).toHaveLength(1);
  });
});
