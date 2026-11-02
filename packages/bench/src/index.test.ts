import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cases as corpusCases } from "./cases/corpus.ts";
import { measure, roundOrder, runBench } from "./index.ts";
import { rescore } from "./rescore.ts";

describe("roundOrder", () => {
  it("puts each arm at each position the same number of times over 2n rounds", () => {
    const arms = ["a", "b", "c"];
    const counts = new Map<string, number>();
    for (let round = 0; round < 6; round++) {
      const order = roundOrder(arms, round);
      expect([...order].sort()).toEqual(arms);
      order.forEach((arm, position) => counts.set(`${arm}@${position}`, (counts.get(`${arm}@${position}`) ?? 0) + 1));
    }
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
    expect(counts.size).toBe(9);
  });
});

describe("the cases of the corpus", () => {
  it("each case runs and gives a result", () => {
    for (const [name, benchCase] of Object.entries(corpusCases)) {
      const result = measure(name, benchCase, { samples: 2, minSampleMs: 0, warmupMs: 0 });
      expect(result.samples).toHaveLength(2);
      expect(result.samples.every((s) => s > 0)).toBe(true);
    }
  });
});

describe("runBench", () => {
  const module = fileURLToPath(new URL("./fixtures/cases.ts", import.meta.url));
  const child = { samples: 3, minSampleMs: 0.1, warmupMs: 1 };

  it("runs one fresh process for each arm and each round, and gives the A/A ratio", () => {
    const record = runBench({
      module,
      arms: [
        { arm: "sum", case: "fixture.sum" },
        { arm: "sum#aa", case: "fixture.sum" },
        { arm: "join", case: "fixture.join" },
      ],
      rounds: 2,
      aa: ["sum", "sum#aa"],
      child,
    });
    expect(record.schema).toBe("typeset-bench/1");
    expect(record.processes).toHaveLength(6);
    expect(record.arms["join"]!.processes).toBe(2);
    expect(record.arms["join"]!.processP90P10).toBeGreaterThanOrEqual(1);
    expect(record.aa!.perRound).toHaveLength(2);
    expect(record.aa!.ratio).toBeGreaterThan(0);
    expect(record.environment.cpu.length).toBeGreaterThan(0);
    // A record that this code wrote gives the same values when rescore calculates them again
    expect(rescore(record).filter((c) => !c.equal)).toEqual([]);
  }, 60_000);

  it("fails closed on an unknown case, a duplicate arm or a bad A/A pair", () => {
    expect(() => runBench({ module, arms: [{ arm: "x", case: "fixture.none" }], rounds: 1, child })).toThrow();
    expect(() =>
      runBench({
        module,
        arms: [
          { arm: "x", case: "fixture.sum" },
          { arm: "x", case: "fixture.sum" },
        ],
        rounds: 1,
        child,
      }),
    ).toThrow(/same name/);
    expect(() => runBench({ module, arms: [{ arm: "x", case: "fixture.sum" }], rounds: 1, aa: ["x", "y"], child })).toThrow(/A\/A/);
    expect(() => runBench({ module, arms: [], rounds: 1, child })).toThrow(/at least one arm/);
  }, 60_000);
});
