import { describe, expect, it } from "vitest";
import * as breakingEntry from "./breaking.ts";
import { breaking } from "./index.ts";

describe("the entry", () => {
  it("gives the subpath ./breaking as the namespace breaking", () => {
    expect(Object.keys(breaking).sort()).toEqual(Object.keys(breakingEntry).sort());
    expect(breaking.greedy).toBe(breakingEntry.greedy);
  });
});

describe("the entry of the rope", () => {
  it("gives the subpath ./text as the namespace text", async () => {
    const { text } = await import("./index.ts");
    const textEntry = await import("./text.ts");
    expect(Object.keys(text).sort()).toEqual(Object.keys(textEntry).sort());
    expect(text.Text).toBe(textEntry.Text);
  });
});

describe("the entries of the font model and the measurer", () => {
  it("gives the subpaths ./fonts and ./measurer as the namespaces fonts and measurer", async () => {
    const { fonts, measurer } = await import("./index.ts");
    const fontsEntry = await import("./fonts.ts");
    const measurerEntry = await import("./measurer.ts");
    expect(Object.keys(fonts).sort()).toEqual(Object.keys(fontsEntry).sort());
    expect(Object.keys(measurer).sort()).toEqual(Object.keys(measurerEntry).sort());
    expect(measurer.fontAdvance).toBe(measurerEntry.fontAdvance);
  });
});
