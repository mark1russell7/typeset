import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assetName, groupFiles, hasPinned, pinnedFile, readManifest, readPinned, restoreCommand, sha256Of, type PinnedFile, type PinnedManifest } from "./index.ts";

const folder = mkdtempSync(join(tmpdir(), "pinned-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
const bytes = new TextEncoder().encode("pinned text\n");
const file: PinnedFile = { name: "a.txt", url: "https://example.org/a.txt", sha256: sha256Of(bytes), bytes: bytes.byteLength, group: "words" };
const manifest: PinnedManifest = { schema: "typeset-pinned/1", repository: "owner/name", store: "pinned-files", files: [file] };
const manifestAt = (value: unknown): string => {
  const path = join(folder, `manifest-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(value));
  return path;
};

describe("the manifest", () => {
  it("reads the manifest of the repository, with unique names and hashes", () => {
    const pinned = readManifest();
    expect(pinned.schema).toBe("typeset-pinned/1");
    expect(new Set(pinned.files.map(assetName)).size).toBe(pinned.files.length);
  });
  it("refuses a wrong schema, a path as a name, a short hash and a name two times", () => {
    expect(() => readManifest(manifestAt({ ...manifest, schema: "other" }))).toThrow(/schema/u);
    expect(() => readManifest(manifestAt({ ...manifest, files: [{ ...file, name: "../a.txt" }] }))).toThrow(/plain file name/u);
    expect(() => readManifest(manifestAt({ ...manifest, files: [{ ...file, sha256: "ab" }] }))).toThrow(/SHA-256/u);
    expect(() => readManifest(manifestAt({ ...manifest, files: [file, file] }))).toThrow(/two times/u);
  });
  it("names a file that is not in the manifest", () => {
    expect(() => pinnedFile(manifest, "b.txt")).toThrow("b.txt is not in the manifest pinned.json");
  });
  it("gives the files of the groups, and refuses a group with no file", () => {
    expect(groupFiles(manifest, ["words"])).toEqual([file]);
    expect(() => groupFiles(manifest, ["fonts"])).toThrow(/no file in the group fonts/u);
  });
  it("puts the hash in the name of the asset", () => {
    expect(assetName(file)).toBe(`${file.sha256.slice(0, 16)}-a.txt`);
  });
});

describe("a read of a pinned file", () => {
  it("names the restore command when the file is missing", () => {
    expect(hasPinned(folder, file)).toBe(false);
    expect(() => readPinned(folder, file)).toThrow(`a.txt: the file is not in ${folder}. Restore it with: ${restoreCommand("words", folder)}`);
  });
  it("gives the bytes of a correct file", () => {
    writeFileSync(join(folder, file.name), bytes);
    expect(hasPinned(folder, file)).toBe(true);
    expect(readPinned(folder, file).toString("utf8")).toBe("pinned text\n");
  });
  it("refuses a changed file and names its hash", () => {
    writeFileSync(join(folder, file.name), "changed text\n");
    expect(hasPinned(folder, file)).toBe(false);
    expect(() => readPinned(folder, file)).toThrow(/a\.txt: the file in .* has 13 bytes and the SHA-256 [0-9a-f]{64}, not 12 bytes/u);
  });
});
