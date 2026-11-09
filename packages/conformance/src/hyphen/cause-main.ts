/**
 * This command measures the cause of the loss of the trained `en-us` set on the TUGboat list. First, it scores Moby as a set
 * against the TUGboat list on their shared words. Then it scores the trained set, the shipped set and Moby against Webster 1913.
 * This score uses the syllables of the words of Webster that are in Moby.
 *
 * With `--write`, the command writes the record `data/hyphen/en-us-cause.json`.
 * Without it, the command exits with 1 when a new record differs from the committed record. A workflow in CI starts it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { hyphenator } from "@mark1russell7/typeset/hyphen";
import { hyphenate as shipped } from "@mark1russell7/typeset/hyphen/en-us";
import { pinnedBytes } from "../pinned.ts";
import { hyphenFiles, tugboatExceptions, webster1913 } from "./sources.ts";
import { compareSets, formHook, listedForms, patgenPatterns, sharedForms, texExceptionForms, websterEntries, wordCounts, type TrainParams } from "./train.ts";

const { values } = parseArgs({ options: { folder: { type: "string" }, out: { type: "string" }, runs: { type: "string" }, write: { type: "boolean" } } });
if (values.folder === undefined) throw new Error("give --folder");
const folder = values.folder;
const data = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "hyphen");
const paths = { params: join(data, "en-us-train-params.json"), patterns: join(data, "en-us-moby.pat"), record: join(data, "en-us-cause.json") };
const params = JSON.parse(readFileSync(paths.params, "utf8")) as TrainParams;
const runs = Number(values.runs ?? 10000);
const { left, right } = params;

const moby = hyphenFiles.find((file) => file.language === "en-us")!.list;
const mobyText = (await pinnedBytes(folder, "mhyph.txt", moby.url, moby.sha256)).toString("latin1");
const tugText = (await pinnedBytes(folder, "ushyphex.tex", tugboatExceptions.url, tugboatExceptions.sha256)).toString("utf8");
const websterText = (await pinnedBytes(folder, "webster-1913.txt", webster1913.url, webster1913.sha256)).toString("utf8");

const mobyForms = listedForms(mobyText.split(/\r?\n/u).filter((line) => /^[a-z¥]+$/u.test(line)).map((line) => line.replaceAll("¥", "-"))).forms;
const tugForms = texExceptionForms(tugText).forms;
const websterEntryList = websterEntries(websterText);
const webster = listedForms(websterEntryList);
const trained = hyphenator({ patterns: patgenPatterns(readFileSync(paths.patterns, "utf8")), exceptions: "", left, right });
const mobyHook = formHook(mobyForms, left, right);

// (a) The TUGboat list as the judge, on the words in both lists. Moby as a set gives the places of its form within the limits.
const tugShared = sharedForms(tugForms, mobyForms);
// (b) Webster as the judge, on the words of Webster that are in Moby.
const websterShared = sharedForms(webster.forms, mobyForms);
const compare = (forms: readonly string[], candidate: (word: string) => readonly number[], seed: string) =>
  compareSets(wordCounts(forms, candidate, shipped, left, right), { runs, seed: `t14c/en-us/cause/${seed}` });

const record = {
  schema: "typeset-hyphen-cause/1",
  language: params.language,
  limits: { left, right },
  caveats: [
    "The syllables of Webster are not exactly hyphens: a dictionary can divide a syllable that a printer does not divide.",
    "Webster gives the spellings of 1913. Only the words that are also in Moby count.",
    "The patterns of Liang, the base of the shipped set, come from another dictionary of Merriam-Webster. So Webster and the shipped set share a convention, but not their data.",
    "The documents of Moby Hyphenator II do not name its source. The comparison webster.moby tells how near Moby is to Webster. A near agreement tells that Webster is not independent of the data of the trained set.",
    "In each comparison, the baseline is the shipped set. The candidate is the trained set or Moby as a set.",
  ],
  lists: {
    moby: { name: moby.name, sha256: moby.sha256, forms: mobyForms.length },
    tugboat: { name: tugboatExceptions.name, sha256: tugboatExceptions.sha256, forms: tugForms.length, shared: tugShared.length },
    webster: { name: webster1913.name, url: webster1913.url, sha256: webster1913.sha256, entries: websterEntryList.length, forms: webster.forms.length, conflicts: webster.conflicts, shared: websterShared.length },
  },
  tugboat: { moby: compare(tugShared, mobyHook, "tugboat/moby"), trained: compare(tugShared, trained, "tugboat/trained") },
  webster: { trained: compare(websterShared, trained, "webster/trained"), moby: compare(websterShared, mobyHook, "webster/moby") },
};
const recordText = `${JSON.stringify(record, null, 2)}\n`;
console.log(recordText);
if (values.out !== undefined) writeFileSync(join(values.out, "en-us-cause.json"), recordText);
if (values.write === true) writeFileSync(paths.record, recordText);
if (!existsSync(paths.record) || readFileSync(paths.record, "utf8") !== recordText) {
  console.error("the committed record differs from a new record");
  process.exitCode = 1;
}
