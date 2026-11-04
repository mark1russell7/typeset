import { defineConfig } from "tsdown";

// The build of the package for npm: an ES module for each entry and its declarations in build/. The workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts", "src/bidi.ts", "src/breaking.ts", "src/fonts.ts", "src/fonts-inspect.ts", "src/hyphen.ts", "src/hyphen/en-us.ts", "src/hyphen/de.ts", "src/hyphen/fr.ts", "src/measurer.ts", "src/segmentation.ts", "src/text.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  sourcemap: true,
  // The shared chunks go to build/chunks/ with no hash. Thus no chunk takes the name of an entry, and the API report names
  // the same files after each build.
  outputOptions: { chunkFileNames: "chunks/[name].js" },
  publint: true,
});
