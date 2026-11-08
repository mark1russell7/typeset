import { writeGateLine } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { allArms, bidiProbeGate, noReadGates, scoreAll, type ArmFile } from "./score.ts";
import { sequenceEntries } from "./sequences.ts";

describe("the no-read lines of the fonts scorer", () => {
  it("gives one warning line for each prediction when no arm has a file, with each outcome a no-read", () => {
    const predictions = scoreAll(new Map());
    const gates = noReadGates(predictions);
    expect(gates.map((gate) => gate.title)).toEqual(Object.keys(predictions).map((id) => `Fonts ${id}`));
    for (const gate of gates) {
      expect(gate.level).toBe("warning");
      expect(gate.noReads.count).toBe(gate.total);
    }
  });

  it("gives no line for a detail with a value of each arm", () => {
    expect(noReadGates({ p: [{ outcome: "a", holds: true, detail: "linux-1: 0.125; macos-2: none" }] })).toEqual([]);
  });

  it("finds a no-read inside a list of arms and a NaN value, and names their details", () => {
    const [gate, ...rest] = noReadGates({
      p: [
        { outcome: "a", holds: false, detail: "linux-1: 0.1; macos-2: no file" },
        { outcome: "b", holds: false, detail: "han NaN" },
        { outcome: "c", holds: true, detail: "linux-1: 0.2" },
      ],
    });
    expect(rest).toEqual([]);
    expect(gate?.noReads.cases).toEqual(["a", "b"]);
    expect(gate?.total).toBe(3);
    expect(gate?.text).toContain("linux-1: 0.1; macos-2: no file");
    expect(gate?.text).toContain("b: han NaN");
  });

  it("writes a warning annotation that escapes the characters that end a GitHub annotation", () => {
    const logged: string[] = [];
    const [gate] = noReadGates({ p: [{ outcome: "a", holds: false, detail: "no file, 5%\nx" }] });
    writeGateLine(gate, { log: (line) => logged.push(line), summary: undefined });
    expect(logged).toHaveLength(1);
    expect(logged[0]?.startsWith("::warning title=Fonts p%3A no read (report only)")).toBe(true);
    expect(logged[0]).toContain("5%25");
    expect(logged[0]).not.toContain("\n");
  });
});

describe("the bidi probe gate of T13c", () => {
  const ids = sequenceEntries.filter((entry) => entry.group === "bidi").map((entry) => entry.id);
  const arm = (offset: (id: string) => number): ArmFile => ({ sequenceProbe: ids.map((id) => ({ id, canvas: 100 + offset(id), model: 100 })) }) as unknown as ArmFile;

  it("passes when each arm has each text within 0.5 px", () => {
    expect(ids).toHaveLength(36);
    expect(bidiProbeGate(new Map(allArms.map((name) => [name, arm(() => 0.5)])))).toBeUndefined();
  });

  it("gives an enforced block that names the arm and the text beyond 0.5 px", () => {
    const files = new Map(allArms.map((name) => [name, arm((id) => (name === "macos-2" && id === ids[3] ? -0.75 : 0))]));
    const gate = bidiProbeGate(files);
    expect(gate?.level).toBe("error");
    expect(gate?.blocks.cases).toEqual(["macos-2"]);
    expect(gate?.text).toContain(`${ids[3]} -0.750`);
  });

  it("gives a no-read for an arm with no file or with a missing row", () => {
    const files = new Map<string, ArmFile>(allArms.filter((name) => name !== "linux-1").map((name) => [name, arm(() => 0)]));
    files.set("windows-1", { sequenceProbe: [] } as unknown as ArmFile);
    const gate = bidiProbeGate(files);
    expect(gate?.level).toBe("error");
    expect(gate?.noReads.cases).toEqual(["linux-1", "windows-1"]);
  });
});
