// The import boundaries of the workspace (@mark1russell7/boundaries): another package is imported only
// through an entry of its package.json. Start the check with `pnpm check:boundaries`.
import { boundaries, type Config } from "@mark1russell7/boundaries";

const config: Config = boundaries(import.meta.dirname, {
  forbidden: [
    {
      name: "text-imports-only-text",
      severity: "error",
      comment:
        "The source of @mark1russell7/text imports only its own files. Its install stays light: no fonts, no widths and no runtime dependency.",
      from: { path: "^packages/text/src/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: "^packages/text/" },
    },
  ],
});
export default config;
