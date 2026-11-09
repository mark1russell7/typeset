import { pinnedFile, readManifest } from "@typeset/pinned";
import { describe, expect, it } from "vitest";
import { referenceRules } from "./hyphen/classes.ts";
import { hyphenFiles, hyphenUrl, tugboatExceptions, webster1913 } from "./hyphen/sources.ts";
import { fileUrl, propertyFiles, testFiles } from "./sources.ts";

// The gates read only the files of pinned.json. This test holds each source of this package equal to its entry.
const manifest = readManifest();
const expectEntry = (name: string, url: string, sha256: string, group: string): void => {
  expect(pinnedFile(manifest, name)).toMatchObject({ url, sha256, group });
};

describe("the pinned files of the conformance gates", () => {
  it("has each file of the Unicode Character Database", () => {
    for (const file of [...Object.values(propertyFiles), ...Object.values(testFiles)]) expectEntry(file.path.replace(/^.*\//u, ""), fileUrl(file), file.sha256, "unicode");
  });
  it("has each hyphen pattern file", () => {
    for (const file of hyphenFiles) expectEntry(file.name, hyphenUrl(file), file.sha256, "patterns");
  });
  it("has the lists of the hyphen gate and of the en-us training", () => {
    const lexique = referenceRules["fr"]!.list;
    expectEntry(lexique.name, lexique.url, lexique.sha256, "lexique");
    const moby = hyphenFiles.find((file) => file.language === "en-us")!.list;
    expectEntry("mhyph.txt", moby.url, moby.sha256, "en-us-lists");
    expectEntry("ushyphex.tex", tugboatExceptions.url, tugboatExceptions.sha256, "en-us-lists");
    expectEntry("webster-1913.txt", webster1913.url, webster1913.sha256, "webster");
  });
});
