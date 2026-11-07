import { describe, expect, it } from "vitest";
import { breakGaps, breakVerdict, stackGate, withVerdicts, type StackArm } from "./stack-gate.ts";

describe("stackGate", () => {
  const file: StackArm = {
    arm: "a",
    stacks: {
      cells: [
        { stack: "s", set: "covered", size: 16, n: 3, excluded: 0, worst64: 1.28 },
        { stack: "s", set: "uncovered", size: 16, n: 3, excluded: 0, worst64: 1.3 },
      ],
      breaks: { cells: [{ stack: "s", set: "covered", n: 100, same: 100, opportunity: 0, width: 0 }] },
    },
  };

  it("fails a width cell above 1.28/64 px, and an arm with no file", () => {
    const rows = stackGate(["a", "b"], new Map([["a", file]]));
    expect(rows.map((row) => `${row.arm} ${row.cell} ${row.verdict}`)).toEqual([
      "a width s covered 16px pass",
      "a width s uncovered 16px fail",
      "a breaks s covered pass",
      "b all fail",
    ]);
  });
});

describe("breakVerdict", () => {
  const cell = (same: number, opportunity: number, width: number) => ({ stack: "s", set: "covered" as const, n: 100, same, opportunity, width });
  const gaps = [{ stack: "s", set: "covered" as const, items: ["layout-contract#255"], due: "2026-12-01", reason: "no UAX #14 breaks" }];

  it("passes a cell at the bar, and fails a cell under it with no gap", () => {
    expect(breakVerdict(cell(97, 3, 0), []).verdict).toBe("pass");
    expect(breakVerdict(cell(96, 4, 0), []).verdict).toBe("fail");
    expect(breakVerdict({ ...cell(0, 0, 0), n: 0 }, []).verdict).toBe("fail");
  });

  it("gives a known gap only for the opportunity records of a listed cell, and fails a stale gap", () => {
    expect(breakVerdict(cell(50, 50, 0), gaps)).toMatchObject({ verdict: "known-gap" });
    expect(breakVerdict(cell(50, 46, 4), gaps).verdict).toBe("fail");
    expect(breakVerdict(cell(98, 2, 0), gaps)).toMatchObject({ verdict: "fail", reason: expect.stringMatching(/stale/) });
  });

  it("adds the verdict to each cell, and lists each stack of the run in both sets", () => {
    expect(withVerdicts([cell(50, 50, 0)], gaps)).toEqual([{ ...cell(50, 50, 0), ...breakVerdict(cell(50, 50, 0), gaps) }]);
    expect(breakGaps.map((gap) => `${gap.stack} ${gap.set}`)).toEqual(
      ["latin-han", "han-first", "latin-arabic-emoji", "latin-indic-thai", "all-scripts"].flatMap((stack) => [stack + " covered", stack + " uncovered"]),
    );
    expect(breakGaps.filter((gap) => gap.items.includes("T12b")).map((gap) => gap.stack)).toEqual(["latin-indic-thai", "latin-indic-thai", "all-scripts", "all-scripts"]);
  });
});
