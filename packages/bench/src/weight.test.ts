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
    expect(compareWeights(weights({ ".": 1100 }), release, 100)[0]).toMatchObject({ growth: 100, over: false });
    expect(compareWeights(weights({ ".": 1101 }), release, 100)[0]).toMatchObject({ growth: 101, over: true });
  });

  it("passes a smaller entry", () => {
    expect(compareWeights(weights({ ".": 900 }), release, 0)[0]).toMatchObject({ growth: -100, over: false });
  });

  it("only reports when the limit is null", () => {
    expect(compareWeights(weights({ ".": 9000 }), release, null)[0]).toMatchObject({ growth: 8000, over: false });
  });

  it("does not flag an entry that the release does not have", () => {
    expect(compareWeights(weights({ "./new": 9000 }), release, 0)[0]).toMatchObject({ releaseGzip: null, growth: null, over: false });
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
