import { describe, expect, it } from "vitest";
import { noReadLines, scoreAll } from "./score.ts";

describe("the no-read lines of the fonts scorer", () => {
  it("gives one warning for each outcome when no arm has a file", () => {
    const predictions = scoreAll(new Map());
    const lines = noReadLines(predictions);
    expect(lines).toHaveLength(Object.values(predictions).flat().length);
    expect(lines.every((line) => line.startsWith("::warning title=Fonts no read::"))).toBe(true);
  });

  it("gives no warning for a detail with a value of each arm", () => {
    const lines = noReadLines({ p: [{ outcome: "a", holds: true, detail: "linux-1: 0.125; macos-2: none" }] });
    expect(lines).toEqual([]);
  });

  it("finds a no-read inside a list of arms, and a NaN value", () => {
    const lines = noReadLines({ p: [{ outcome: "a", holds: false, detail: "linux-1: 0.1; macos-2: no file" }, { outcome: "b", holds: false, detail: "han NaN" }] });
    expect(lines).toEqual(["::warning title=Fonts no read::p a: linux-1: 0.1; macos-2: no file", "::warning title=Fonts no read::p b: han NaN"]);
  });

  it("escapes the characters that end a GitHub annotation", () => {
    expect(noReadLines({ p: [{ outcome: "a", holds: false, detail: "no file, 5%\nx" }] })).toEqual(["::warning title=Fonts no read::p a: no file, 5%25%0Ax"]);
  });
});
