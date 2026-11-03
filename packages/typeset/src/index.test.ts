import { describe, expect, it } from "vitest";
import * as breakingEntry from "./breaking.ts";
import { breaking } from "./index.ts";

describe("the entry", () => {
  it("gives the subpath ./breaking as the namespace breaking", () => {
    expect(Object.keys(breaking).sort()).toEqual(Object.keys(breakingEntry).sort());
    expect(breaking.greedy).toBe(breakingEntry.greedy);
  });
});
