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

/** The seed and the size of each sample. */
const seed = 14;
const size = 10000;

/** This function gives each word of Moby Hyphenator II in lowercase, with no space and no hyphen in the entry. */
function moby(text: string): string[] {
  return text.split(/\r?\n/u).filter((line) => /^[a-z¥]+$/u.test(line)).map((line) => line.replaceAll("¥", "-"));
}

/** This function gives each form of Lexique with the syllables of the column `orthosyll`, and the phonetic forms of each word from the column `phon`. */
function lexique(text: string): { readonly words: string[]; readonly phonetic: ReadonlyMap<string, readonly string[]> } {
  const words = new Map<string, string>();
  const phonetic = new Map<string, string[]>();
  for (const line of text.split("\n").slice(1)) {
    const cells = line.split("\t");
    const [word, syllables, form] = [cells[0] ?? "", cells[27] ?? "", cells[1] ?? ""];
    if (!/^\p{L}+$/u.test(word) || syllables.replaceAll("-", "") !== word) continue;
    words.set(word, syllables);
    const forms = phonetic.get(word) ?? [];
    if (!forms.includes(form)) forms.push(form);
    phonetic.set(word, forms);
  }
  return { words: [...words.values()], phonetic };
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
const french = lexique(readFileSync(join(values.folder, "Lexique383.tsv"), "utf8"));
const lists: Record<string, string[]> = {
  "en-us": moby(readFileSync(join(values.folder, "mhyph.txt"), "latin1")),
  de: await wiktionary(join(values.folder, "de-extract.jsonl.gz")),
  fr: french.words,
};
mkdirSync(data, { recursive: true });
for (const [language, words] of Object.entries(lists)) {
  const sample = random(`${seed}/${language}`).sample([...words].sort(), size).sort();
  writeFileSync(join(data, `${language}.txt`), `${sample.join(" ")}\n`);
  console.log(`${language}: ${size} of ${words.length} words`);
  if (language !== "fr") continue;
  // The class mute-e reads the phonetic forms of each word of the sample with the ending ent.
  const ent = sample.map((entry) => entry.replaceAll("-", "")).filter((word) => word.endsWith("ent"));
  writeFileSync(join(data, "fr-forms.txt"), `${ent.map((word) => [word, ...(french.phonetic.get(word) ?? [])].join(" ")).join("\n")}\n`);
  console.log(`fr: the forms of ${ent.length} words with the ending ent`);
}
