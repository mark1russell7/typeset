/**
 * The committed list of the differences between the copies of `copies.json` and the functions of this package.
 *
 * A copy that is not in this list gives the output of its home function on each string of the test. A copy in this
 * list gives `to(home(s))` on each string `s` where `when(s)` is true. The test also finds at least one string where the
 * copy and the home function give different output, so no entry of this list is out of date.
 */

/** One difference: its reason, and the relation between the output of the copy and the output of the home. */
export interface Difference {
  /** The ids of the copies (`repo/path:line`) that have this difference. */
  readonly copies: readonly string[];
  /** The difference and its reason, in plain words. */
  readonly reason: string;
  /** The output of the copy, from the output of the home function. The default is the same output. */
  readonly to?: (home: string) => string;
  /** The strings where the relation holds. The default is all strings. */
  readonly when?: (text: string) => boolean;
}

const NUMERIC: Readonly<Record<string, string>> = { "&amp;": "&#38;", "&lt;": "&#60;", "&gt;": "&#62;", "&quot;": "&#34;", "&#39;": "&#39;" };

/** This function removes the backslash of each escape of `escapeMarkdown`, except the escapes of `\` and `|`. */
const cellOnly = (home: string): string => home.replace(/\\(.)/gsu, (pair, char: string) => (char === "\\" || char === "|" ? pair : char));

const noLoneCarriageReturn = (text: string): boolean => !/\r(?!\n)/.test(text);

export const differences: readonly Difference[] = [
  {
    copies: [
      "algebra/packages/site/src/census-view.ts:94",
      "algebra/packages/site/src/explorer.ts:66",
      "algebra/packages/site/src/playground.ts:61",
      "client/packages/site/scripts/docs-data.ts:142",
      "client/packages/site/src/build-time/static-routes.ts:10",
      "codeatlas/packages/site/src/build.ts:57",
      "crawler/packages/site/src/lib/dataset.ts:330",
      "headroom/packages/daemon/src/service.ts:65",
      "ireko/packages/site/scripts/og-image.mjs:146",
      "mark1russell7.github.io/packages/site/vite.config.ts:13",
      "pr-opener/src/options.ts:65",
      "template/packages/cli/src/commands/package/add.ts:98",
    ],
    reason:
      "The copy does not escape the apostrophe. Its output is correct in element content and in an attribute in double quotes, but not in an attribute in single quotes. The home escapes it as &#39; for both quote forms.",
    to: (home) => home.replaceAll("&#39;", "'"),
  },
  {
    copies: ["client/packages/site/src/build-time/sitemap.ts:1", "crawler/packages/site/src/lib/feed.ts:19", "systems/packages/service/src/host/render.ts:123"],
    reason:
      "The copy writes XML (a sitemap, a feed, an SVG), and uses &apos; for the apostrophe. HTML 4 has no &apos;, so the home uses &#39;, which XML and each version of HTML read as the same character.",
    to: (home) => home.replaceAll("&#39;", "&apos;"),
  },
  {
    copies: [
      "headroom/packages/site/src/main.ts:18",
      "headroom/packages/site/src/timeline.ts:47",
      "highways/packages/site/src/atlas.ts:14",
      "highways/packages/site/src/compare.ts:36",
      "highways/packages/site/src/explorer.ts:15",
      "highways/packages/site/src/results.ts:13",
      "highways/packages/site/src/strategies.ts:14",
      "layout-contract/packages/site/src/ui.ts:4",
      "rigor/packages/site/src/build.ts:44",
    ],
    reason:
      "The copy uses decimal references (&#38; &#60; &#62; &#34; &#39;) for the five characters. A reader decodes them to the same text. The home uses the named references, which are easier to read in the source of a page.",
    to: (home) => home.replace(/&(?:amp|lt|gt|quot);|&#39;/g, (reference) => NUMERIC[reference] ?? reference),
  },
  {
    copies: ["AsyncBrowserContext/tools/ste-lint/src/files.ts:33", "ste-lint/src/files.ts:25"],
    reason:
      "The copy is a step of a glob to a regular expression. It escapes one character, and it leaves * and ? to its caller, which changes them to wildcards. The home escapes all of the syntax characters.",
    to: (home) => home.replaceAll("\\*", "*").replaceAll("\\?", "?"),
  },
  {
    copies: ["release-train/packages/release-train/src/sync.ts:115"],
    reason:
      "The copy also escapes the slash, for the source of a regular expression literal. new RegExp does not need it, so the home leaves the slash. Both patterns match the same text, with or without the flag u.",
    to: (home) => home.replaceAll("/", "\\/"),
  },
  {
    copies: ["typeset/packages/typeset/src/fonts/machine.ts:32"],
    reason:
      "The copy writes a character class of letters, so it also escapes the slash and the hyphen. The home is for a pattern outside a class. There, \\- is a syntax error with the flag u, so the home leaves the hyphen.",
    to: (home) => home.replaceAll("/", "\\/").replaceAll("-", "\\-"),
  },
  {
    copies: ["client/packages/documentation/scripts/generate-packages.ts:107", "client/packages/documentation/scripts/generate-procedures.ts:71"],
    reason:
      "The copy escapes a table cell: only the backslash and the bar, so * _ ` [ < and the other marks still make Markdown. It also trims the cell, and changes only \\n to a space, so a \\r stays. The home escapes each ASCII punctuation character and changes each line end.",
    to: (home) => cellOnly(home).trim(),
    when: (text) => !text.includes("\r"),
  },
  {
    copies: ["packing/packages/packing/bench/profile.ts:278"],
    reason:
      "The copy escapes a table cell: only the backslash and the bar, and it changes the backtick to an apostrophe. A line end stays, and it ends the row of the table. The home escapes each ASCII punctuation character and changes each line end to a space.",
    to: (home) => cellOnly(home).replaceAll("`", "'"),
    when: (text) => !/[\r\n]/.test(text),
  },
  {
    copies: ["template/packages/conventions/src/run.ts:228"],
    reason:
      "The copy escapes a table cell: only the backslash and the bar, so the other marks still make Markdown. A \\r with no \\n after it stays. The home escapes each ASCII punctuation character and changes each line end to a space.",
    to: cellOnly,
    when: noLoneCarriageReturn,
  },
  {
    copies: ["template/packages/site-pages/src/check/check.ts:337"],
    reason:
      "The copy escapes a table cell: the backslash and the bar, and < and > as HTML references. The other marks still make Markdown, and a \\r with no \\n after it stays. The home escapes each ASCII punctuation character with a backslash.",
    to: (home) => cellOnly(home).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    when: noLoneCarriageReturn,
  },
];
