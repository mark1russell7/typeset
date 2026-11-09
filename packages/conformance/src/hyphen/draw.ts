/**
 * This command draws the word samples in `data/hyphen` from the files of `hyphenFiles`. The gate does not start it. The field
 * `--folder` names a folder with `mhyph.txt`, `Lexique383.tsv` and `de-extract.jsonl.gz`.
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";
import { random } from "@mark1russell7/rigor-generators";
import { referenceRules } from "./classes.ts";
import { parseLexique } from "./lexique.ts";

/** The seed and the size of each sample. */
const seed = 14;
const size = 10000;

/** This function gives each word of Moby Hyphenator II in lowercase, with no space and no hyphen in the entry. */
function moby(text: string): string[] {
  return text.split(/\r?\n/u).filter((line) => /^[a-z¥]+$/u.test(line)).map((line) => line.replaceAll("¥", "-"));
}

/** This function gives each German entry of the Wiktionary extract with the parts of its field `hyphenations`. */
async function wiktionary(path: string): Promise<string[]> {
  const words = new Map<string, string>();
  for await (const line of createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity })) {
    if (!line.includes('"lang_code": "de"')) continue;
    const entry = JSON.parse(line) as { word: string; lang_code: string; hyphenations?: readonly { parts?: readonly string[] }[] };
    const parts = entry.hyphenations?.[0]?.parts;
    if (entry.lang_code !== "de" || parts === undefined || parts.join("") !== entry.word) continue;
    if (/^\p{L}+$/u.test(entry.word)) words.set(entry.word, parts.join("-"));
  }
  return [...words.values()];
}

const { values } = parseArgs({ options: { folder: { type: "string" } } });
if (values.folder === undefined) throw new Error("give the folder of the word lists with --folder");
const data = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "hyphen");
const french = parseLexique(readFileSync(join(values.folder, "Lexique383.tsv"), "utf8"));
const lists: Record<string, string[]> = {
  "en-us": moby(readFileSync(join(values.folder, "mhyph.txt"), "latin1")),
  de: await wiktionary(join(values.folder, "de-extract.jsonl.gz")),
  fr: [...french.syllables.values()],
};
mkdirSync(data, { recursive: true });
for (const [language, words] of Object.entries(lists)) {
  const sample = random(`${seed}/${language}`).sample([...words].sort(), size).sort();
  writeFileSync(join(data, `${language}.txt`), `${sample.join(" ")}\n`);
  console.log(`${language}: ${size} of ${words.length} words`);
  if (language !== "fr") continue;
  // The rules of fr read the phonetic forms of some words of the sample. The file of forms gives them.
  const rules = referenceRules["fr"]!;
  const read = sample.map((entry) => entry.replaceAll("-", "")).filter(rules.reads);
  writeFileSync(join(data, rules.forms), `${read.map((word) => [word, ...(french.phonetic.get(word) ?? [])].join(" ")).join("\n")}\n`);
  console.log(`fr: the forms of ${read.length} words`);
}
