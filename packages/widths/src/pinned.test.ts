import { pinnedFile, readManifest } from "@typeset/pinned";
import { describe, expect, it } from "vitest";
import { extraSource, fileName, fontSources, sequenceSources, sourceUrl } from "./sources.ts";

// The font gates read only the files of pinned.json. This test holds each font source equal to its entry.
describe("the pinned font files", () => {
  it("has each font of the corpus, the extra font and the fonts of the sequences", () => {
    const manifest = readManifest();
    for (const source of [...fontSources, extraSource, ...sequenceSources]) {
      expect(pinnedFile(manifest, fileName(source.id))).toMatchObject({ url: sourceUrl(source), sha256: source.sha256, group: "fonts" });
    }
  });
});
