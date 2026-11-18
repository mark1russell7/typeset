import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { armOrder, moduleListGaps } from "@mark1russell7/rigor-bench";
import { bootstrapMedian } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { aa, arms, balancedRounds, cases, fontCases, fontFixtures, fontFolder, moduleOf, modules } from "./cases/index.ts";
import { measure, runBench, type BenchRecord } from "./index.ts";
import { replayAa, rescore, type BenchRecordV1 } from "./rescore.ts";

describe("the cases of the bench", () => {
  it("puts each arm, the 2 arms of the A/A pair too, at each position 2 times in a balanced count of rounds", () => {
    const counts = new Map<string, number>();
    const orders = Array.from({ length: balancedRounds }, (_, round) => armOrder(arms, round));
    for (const order of orders) order.forEach((arm, position) => counts.set(`${arm.id}@${position}`, (counts.get(`${arm.id}@${position}`) ?? 0) + 1));
    expect(counts.size).toBe(arms.length * arms.length);
    expect([...counts.values()].every((count) => count === 2)).toBe(true);
    // In half of the rounds the first arm of the pair starts first.
    const first = orders.filter((order) => order.findIndex((arm) => arm.id === aa[0]) < order.findIndex((arm) => arm.id === aa[1]));
    expect(first).toHaveLength(balancedRounds / 2);
  });

  it("has each module of the folder cases in the list of cases/index.ts", () => {
    const files = readdirSync(fileURLToPath(new URL("./cases/", import.meta.url))).filter((name) => name.endsWith(".ts") && name !== "index.ts");
    expect(moduleListGaps(files, Object.keys(modules))).toEqual({ unlisted: [], missing: [] });
  });

  it("has no case name in two modules, and one arm for each case", () => {
    const count = Object.values(modules).reduce((sum, module) => sum + Object.keys(module).length, 0);
    expect(Object.keys(cases)).toHaveLength(count);
    for (const name of Object.keys(cases)) {
      expect(arms.some((arm) => arm.id === name && arm.case === name), name).toBe(true);
      expect(Object.keys(modules[moduleOf[name]!]!)).toContain(name);
    }
    expect(arms.find((arm) => arm.id === aa[1])?.case).toBe(aa[0]);
  });

  it("pins the SHA-256 of each font file that a measurer case reads, one time", () => {
    const files = fontFixtures.map((f) => f.file);
    expect(new Set(files).size).toBe(files.length);
    expect(files).toContain("noto-sans.ttf");
    for (const f of fontFixtures) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // The Bench job fetches the fonts. A test job without them skips the font cases, and the bench fails on them.
  const fonts = (process.env[fontFolder] ?? "") !== "";

  it("each case runs and gives a result", { timeout: 120_000 }, () => {
    for (const [name, benchCase] of Object.entries(cases)) {
      if (!fonts && fontCases.has(name)) continue;
      const result = measure(name, benchCase, { samples: 2, minSampleMs: 0.01, warmupMs: 0 });
      expect(result.samples).toHaveLength(2);
      expect(result.samples.every((s) => s > 0)).toBe(true);
      expect(result.ms).toBeGreaterThan(0);
    }
  });
});

describe("runBench", () => {
  const module = fileURLToPath(new URL("./fixtures/cases.ts", import.meta.url));
  const child = { samples: 3, minSampleMs: 0.1, warmupMs: 1 };
  const threeArms = [
    { id: "sum", case: "fixture.sum" },
    { id: "sum#aa", case: "fixture.sum" },
    { id: "join", case: "fixture.join" },
  ];

  it("starts one fresh process for each arm and each round, and gives the A/A ratio of each order", async () => {
    const seen: string[] = [];
    const record = await runBench({ module, arms: threeArms, rounds: 2, aa: ["sum", "sum#aa"], child, onProcess: (p) => seen.push(`${p.round}:${p.arm}`) });
    expect(record.schema).toBe("typeset-bench/2");
    expect(record.processes).toHaveLength(6);
    expect(seen).toHaveLength(6);
    expect(record.processes.every((p) => p.samples.length === 3 && p.batch >= 1 && p.ms > 0)).toBe(true);
    expect(record.arms["join"]!.processes).toBe(2);
    expect(record.arms["join"]!.spread).toBeGreaterThanOrEqual(1);
    // 2 rounds of 3 arms is not a balanced count (6), so the record says so.
    expect(record.balanced).toBe(false);
    expect(record.warnings).toHaveLength(1);
    expect(record.aa!.rounds).toHaveLength(2);
    expect(record.aa!.orders.all.ratio).toBeGreaterThan(0);
    expect(record.aa!.orders.all.rounds).toBe(2);
    expect(record.environment.cpu.length).toBeGreaterThan(0);
    // A record that this code wrote gives the same values when rescore calculates them again.
    expect(rescore(record).filter((c) => !c.equal)).toEqual([]);
    // A changed value is a difference.
    const changed: BenchRecord = { ...record, processes: record.processes.map((p, i) => (i === 0 ? { ...p, ms: p.ms * 2 } : p)) };
    expect(rescore(changed).filter((c) => !c.equal).length).toBeGreaterThan(0);
  }, 60_000);

  it("stops before the first process when a fixture file is not the pinned file", async () => {
    const folder = mkdtempSync(join(tmpdir(), "typeset-bench-"));
    try {
      writeFileSync(join(folder, "font.ttf"), "not the pinned bytes");
      const seen: string[] = [];
      await expect(
        runBench({ module, arms: threeArms.slice(0, 1), rounds: 1, child, fixtures: { folder, files: [{ file: "font.ttf", sha256: "0".repeat(64) }] }, onProcess: (p) => seen.push(p.arm) }),
      ).rejects.toThrow();
      expect(seen).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("rejects and starts no more processes when a process gives too few samples", async () => {
    const folder = mkdtempSync(join(tmpdir(), "typeset-bench-"));
    const starts = join(folder, "starts.txt");
    const before = process.env["TYPESET_BENCH_STARTS"];
    process.env["TYPESET_BENCH_STARTS"] = starts;
    try {
      const short = fileURLToPath(new URL("./fixtures/short-samples.ts", import.meta.url));
      const seen: string[] = [];
      await expect(runBench({ module: short, arms: [{ id: "short", case: "fixture.short" }], rounds: 3, child, onProcess: (p) => seen.push(p.arm) })).rejects.toThrow(
        /gave 1 samples of fixture\.short, not 3 of fixture\.short/,
      );
      expect(seen).toEqual([]);
      expect(readFileSync(starts, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
    } finally {
      if (before === undefined) delete process.env["TYPESET_BENCH_STARTS"];
      else process.env["TYPESET_BENCH_STARTS"] = before;
      rmSync(folder, { recursive: true, force: true });
    }
  }, 60_000);

  it("fails closed on an unknown case, a duplicate arm or a bad A/A pair", async () => {
    await expect(runBench({ module, arms: [{ id: "x", case: "fixture.none" }], rounds: 1, child })).rejects.toThrow(/fixture\.none/);
    await expect(
      runBench({
        module,
        arms: [
          { id: "x", case: "fixture.sum" },
          { id: "x", case: "fixture.sum" },
        ],
        rounds: 1,
        child,
      }),
    ).rejects.toThrow(/two arms have the id/);
    await expect(runBench({ module, arms: [{ id: "x", case: "fixture.sum" }], rounds: 1, aa: ["x", "y"], child })).rejects.toThrow(/A\/A pair/);
    await expect(runBench({ module, arms: [], rounds: 1, child })).rejects.toThrow(/1 or more arms/);
  }, 60_000);
});

describe("rescore", () => {
  it("gives a record of the old harness (typeset-bench/1) its old values", () => {
    const perRound = [0.5, 0.75];
    const interval = bootstrapMedian(perRound, { level: 0.9, runs: 2000, seed: 1 });
    const record: BenchRecordV1 = {
      schema: "typeset-bench/1",
      processes: [
        { arm: "a", round: 0, position: 0, medianNs: 2, samples: [1, 2, 3] },
        { arm: "b", round: 0, position: 1, medianNs: 4, samples: [2, 4, 6] },
        { arm: "a", round: 1, position: 1, medianNs: 3, samples: [2, 3, 4] },
        { arm: "b", round: 1, position: 0, medianNs: 4, samples: [3, 4, 5] },
      ],
      arms: { a: { medianNs: 2.5, processSpread: 0.4 }, b: { medianNs: 4, processSpread: 0 } },
      aa: { arms: ["a", "b"], perRound, ratio: interval.estimate, interval: [interval.low, interval.high] },
    };
    expect(rescore(record).filter((c) => !c.equal)).toEqual([]);
    const changed: BenchRecordV1 = { ...record, arms: { ...record.arms, a: { medianNs: 2.6, processSpread: 0.4 } } };
    expect(rescore(changed).filter((c) => !c.equal).map((c) => c.name)).toEqual(["a medianNs"]);
    // The new rule gives b / a over the same rounds: 4 / 2 with a first, and 4 / 3 with b first.
    const replay = replayAa(record)!;
    expect(replay.all.rounds).toBe(2);
    expect(replay.aFirst?.ratio).toBeCloseTo(2, 12);
    expect(replay.bFirst?.ratio).toBeCloseTo(4 / 3, 12);
    expect(replay.all.ratio).toBeCloseTo(Math.sqrt(2 * (4 / 3)), 12);
  });

  it("refuses a record of an unknown schema", () => {
    expect(() => rescore({ schema: "typeset-bench/9" } as unknown as BenchRecordV1)).toThrow(/unknown schema/);
  });
});
