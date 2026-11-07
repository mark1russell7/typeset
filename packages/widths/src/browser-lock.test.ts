import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { browserChanged, browserVersions } from "./browser-lock.ts";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/lock/${name}.yaml`, import.meta.url), "utf8");
const base = fixture("base");

describe("browserVersions", () => {
  it("reads the resolved versions of playwright and playwright-core, once each", () => {
    expect(browserVersions(base)).toEqual(["playwright-core@1.64.1", "playwright@1.64.1"]);
  });

  it("reads the lock of this repository", () => {
    const lock = readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8");
    expect(browserVersions(lock).some((key) => key.startsWith("playwright-core@"))).toBe(true);
  });
});

describe("browserChanged", () => {
  it("selects the width arms when only playwright and playwright-core change", () => {
    expect(browserChanged(base, fixture("playwright"))).toBe(true);
  });

  it("does not select them when only another package changes, also one with playwright in its name", () => {
    expect(browserChanged(base, fixture("other"))).toBe(false);
  });

  it("does not select them for an equal lock", () => {
    expect(browserChanged(base, base)).toBe(false);
  });
});
