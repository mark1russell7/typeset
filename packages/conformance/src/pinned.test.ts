import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pinnedBytes, sha256Of } from "./pinned.ts";

const good = new TextEncoder().encode("the pinned bytes\n");
const sha = sha256Of(good);

/** A fake `fetch` that gives one answer for each place: a status with a body, or a thrown error. */
function fakeFetch(answers: Record<string, { status: number; body: string } | Error>): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (place: string) => {
    asked.push(place);
    const answer = answers[place];
    if (answer === undefined) throw new Error(`no answer for ${place}`);
    if (answer instanceof Error) throw answer;
    return new Response(answer.body, { status: answer.status });
  });
  return asked;
}

describe("pinnedBytes", () => {
  let folder = "";
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "pinned-"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(folder, { recursive: true, force: true });
  });

  it("keeps the bytes of the first place that gives the pinned SHA-256, after a refusal and wrong bytes", async () => {
    const asked = fakeFetch({
      "https://main/f": { status: 503, body: "Temporarily Down for Maintenance" },
      "https://wrong/f": { status: 200, body: "other bytes" },
      "https://mirror/f": { status: 200, body: "the pinned bytes\n" },
      "https://late/f": { status: 200, body: "the pinned bytes\n" },
    });
    const bytes = await pinnedBytes(folder, "f.txt", ["https://main/f", "https://wrong/f", "https://mirror/f", "https://late/f"], sha);
    expect(bytes.toString("utf8")).toBe("the pinned bytes\n");
    expect(asked).toEqual(["https://main/f", "https://wrong/f", "https://mirror/f"]);
    expect(readFileSync(join(folder, "f.txt"), "utf8")).toBe("the pinned bytes\n");
  });

  it("reads the folder and does not fetch when the folder has the pinned bytes", async () => {
    writeFileSync(join(folder, "f.txt"), good);
    const asked = fakeFetch({});
    expect((await pinnedBytes(folder, "f.txt", "https://main/f", sha)).toString("utf8")).toBe("the pinned bytes\n");
    expect(asked).toEqual([]);
  });

  it("throws with the fault of each place, with the cause of a failed connection, when no place gives the bytes", async () => {
    fakeFetch({
      "https://main/f": { status: 503, body: "" },
      "https://mirror/f": Object.assign(new TypeError("fetch failed"), { cause: new Error("unable to verify the first certificate") }),
    });
    await expect(pinnedBytes(folder, "f.txt", ["https://main/f", "https://mirror/f"], sha)).rejects.toThrow(
      "f.txt: no place gave the pinned bytes. https://main/f: HTTP 503; https://mirror/f: fetch failed (unable to verify the first certificate)",
    );
  });
});
