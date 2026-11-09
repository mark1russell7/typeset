import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

// The limit of the prediction of the first version, made before the code. A change of the limit needs a new prediction.
const LIMIT_GZIP_BYTES = 700;

describe("the bytes of the root entry", () => {
  it(`are at most ${LIMIT_GZIP_BYTES} bytes, bundled and minified by esbuild, at gzip level 9`, () => {
    const result = buildSync({
      entryPoints: [fileURLToPath(new URL("./index.ts", import.meta.url))],
      bundle: true,
      minify: true,
      treeShaking: true,
      format: "esm",
      platform: "neutral",
      write: false,
    });
    const bytes = gzipSync(result.outputFiles[0]!.contents, { level: 9 }).length;
    console.log(`root entry: ${result.outputFiles[0]!.contents.length} minified bytes, ${bytes} gzip bytes`);
    expect(bytes).toBeLessThanOrEqual(LIMIT_GZIP_BYTES);
  });
});
