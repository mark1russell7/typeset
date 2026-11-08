import { describe, expect, it } from "vitest";
import type { WidthRecord } from "./compare.ts";
import { engineBoundCells, engineTable, readCheck, type EngineArm, type EngineBoundCell } from "./engine-bounds.ts";

const record = (fields: Partial<WidthRecord>): WidthRecord => ({
  sample: "latin/word/0",
  script: "latin",
  lengthClass: "word",
  font: "noto-sans",
  weight: 400,
  size: 16,
  codePoints: 4,
  missing: 0,
  canvas: 10,
  tables: 10,
  error: 0,
  pixel: 10,
  float32: 10,
  exactDeltas: 10,
  ...fields,
});
const exactArm: EngineArm = { arm: "linux-2", engine: "freetype", rounding: "exact", sum: "exact" };
const stats = (estimate: number) => ({ n: 1, worst: { estimate, low: estimate, high: estimate }, p99: { estimate, low: estimate, high: estimate } });
const cell = (error: number, read: number, arm = "linux-2"): EngineBoundCell => ({
  arm,
  engine: "freetype",
  script: "latin",
  font: "noto-sans",
  weight: 400,
  size: 16,
  excluded: 0,
  error: stats(error),
  readEffect: stats(read),
});

describe("the engine bounds", () => {
  it("gives one cell for each script, font, weight and size, in 1/64 px", () => {
    const records = [record({ tables: 10.5, error: 0.5 }), record({ size: 24, tables: 9.75, error: -0.25 }), record({ error: 0.25, tables: 10.25 })];
    const cells = engineBoundCells(records, exactArm, 50);
    expect(cells.map((one) => [one.size, one.error.n, one.error.worst?.estimate])).toEqual([[16, 2, 32], [24, 1, -16]]);
  });

  it("uses the rule of the engine row for the error, and the width with no rule for the read effect", () => {
    const records = [record({ canvas: 10, tables: 10.25, error: 0.25, pixel: 10, exactDeltas: 10 })];
    const [one] = engineBoundCells(records, { ...exactArm, rounding: "pixel" }, 50);
    expect(one!.error.worst?.estimate).toBe(0);
    expect(one!.readEffect.worst?.estimate).toBe(16);
  });

  it("leaves out a record with a missing glyph and counts it", () => {
    const [one] = engineBoundCells([record({ missing: 1, error: 9, tables: 19 }), record({})], exactArm, 50);
    expect(one).toMatchObject({ excluded: 1, error: { n: 1, worst: { estimate: 0 } } });
  });

  it("gives no read effect for records with no exact deltas", () => {
    const { exactDeltas: _, ...plain } = record({});
    const [one] = engineBoundCells([plain], exactArm, 50);
    expect(one!.readEffect).toEqual({ n: 0, worst: null, p99: null });
  });
});

describe("the check of the read effect", () => {
  it("holds when each cell above the floor has a small share", () => {
    expect(readCheck([cell(0.5, 10), cell(9, 0.5)])).toEqual({ cells: 1, worstShare: 0.05, holds: true });
  });

  it("does not hold when a cell has a large share", () => {
    expect(readCheck([cell(2, 10)]).holds).toBe(false);
  });

  it("does not hold when no cell is above the floor", () => {
    expect(readCheck([cell(0, 0.5)])).toEqual({ cells: 0, worstShare: null, holds: false });
  });
});

describe("the engine table", () => {
  it("gives a column for each arm and one for the read effect", () => {
    const table = engineTable([cell(1, 2), cell(-3, 0, "windows-1")]);
    expect(table).toContain("| Script | `linux-2` | `windows-1` | Read effect |");
    expect(table).toContain("| latin | 1.0 [1.0, 1.0] (noto-sans 400, 16 px, freetype) | -3.0 [-3.0, -3.0] (noto-sans 400, 16 px, freetype) |");
  });
});
