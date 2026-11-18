// The fetch of the pinned files of the en-us training and its cause into a folder:
// `node packages/conformance/src/hyphen/sources-main.ts --folder <folder>`.
// Each file has the name that `train-main.ts` and `cause-main.ts` give it, so their `pinnedBytes` reads it from the folder.
// The workflow `hyphen-sources.yml` keeps the folder in the cache of main. The jobs of `hyphen-train.yml` restore it, so a
// pull request does not fetch the files from their hosts.
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { pinnedBytes } from "../pinned.ts";
import { hyphenFiles, placesOf, tugboatExceptions, webster1913, type WordList } from "./sources.ts";

const { values } = parseArgs({ options: { folder: { type: "string" } } });
if (values.folder === undefined) throw new Error("give --folder");
const folder = values.folder;
mkdirSync(folder, { recursive: true });

const moby = hyphenFiles.find((file) => file.language === "en-us")?.list;
if (moby === undefined) throw new Error("sources.ts has no word list for en-us");
const files: readonly (readonly [string, WordList])[] = [
  ["mhyph.txt", moby],
  ["ushyphex.tex", tugboatExceptions],
  ["webster-1913.txt", webster1913],
];
for (const [name, list] of files) {
  const bytes = await pinnedBytes(folder, name, placesOf(list), list.sha256);
  console.log(`${name}: ${String(bytes.length)} bytes, SHA-256 ${list.sha256}`);
}
