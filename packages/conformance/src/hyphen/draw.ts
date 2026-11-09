/**
 * This command draws the word samples in `data/hyphen` from the files of `hyphenFiles`. The gate does not start it. The field
 * `--folder` names a folder with `mhyph.txt`, `Lexique383.tsv`, `de-extract.jsonl.gz`, `es-extract.jsonl.gz` and the pages dump
 * `eswiktionary-20261001-pages-articles.xml.bz2`. The command reads the dump with the program `bzip2`. The option `--language`
 * draws only the sample of one language, and the command reads only the files of that language.
 */
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";
import { random, seedOf } from "@mark1russell7/rigor-generators";
import { referenceRules } from "./classes.ts";
import { hintGroup, hintGroups, type GroupCount, type HintFile, type HintGroup } from "./hinted.ts";
import { parseLexique } from "./lexique.ts";
import { hyphenFiles } from "./sources.ts";
import { hintedEntries } from "./wikitext.ts";

/** The seed and the size of each sample. */
const seed = 14;
const size = 10000;

/** An entry of a Wiktionary extract: its form with a hyphen at each place, and its lemma. */
interface WiktionaryEntry {
  readonly form: string;
  readonly lemma: string;
}

/** This function gives each word of Moby Hyphenator II in lowercase, with no space and no hyphen in the entry. */
function moby(text: string): string[] {
  return text.split(/\r?\n/u).filter((line) => /^[a-z¥]+$/u.test(line)).map((line) => line.replaceAll("¥", "-"));
}

/**
 * This function gives each entry of a language in a Wiktionary extract with the parts of its field `hyphenations`. The lemma of an
 * inflected form is the first word of `form_of` in its senses. A later entry of the same word replaces the form of an earlier entry.
 */
async function wiktionary(path: string, language: string): Promise<Map<string, WiktionaryEntry>> {
  const words = new Map<string, WiktionaryEntry>();
  for await (const line of createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity })) {
    if (!line.includes(`"lang_code": "${language}"`)) continue;
    const entry = JSON.parse(line) as { word: string; lang_code: string; hyphenations?: readonly { parts?: readonly string[] }[]; senses?: readonly { form_of?: readonly { word: string }[] }[] };
    const parts = entry.hyphenations?.[0]?.parts;
    if (entry.lang_code !== language || parts === undefined || parts.join("") !== entry.word) continue;
    if (!/^\p{L}+$/u.test(entry.word)) continue;
    const lemma = words.get(entry.word)?.lemma ?? entry.senses?.flatMap((sense) => sense.form_of ?? [])[0]?.word ?? entry.word;
    words.set(entry.word, { form: parts.join("-"), lemma });
  }
  return words;
}

/** This function draws a seeded sample of lemmas, and one form of each lemma. A lemma with many forms counts one time. */
function lemmaSample(entries: ReadonlyMap<string, WiktionaryEntry>, name: string, count: number): string[] {
  const forms = new Map<string, string[]>();
  for (const { form, lemma } of entries.values()) forms.set(lemma, [...(forms.get(lemma) ?? []), form]);
  const lemmas = random(name).sample([...forms.keys()].sort(), Math.min(count, forms.size));
  return lemmas.map((lemma) => {
    const choices = forms.get(lemma)!.sort();
    return choices[seedOf(`${name}/${lemma}`) % choices.length]!;
  }).sort();
}

/** This function writes a sample of words, sorted and on one line. */
function writeSample(data: string, language: string, sample: readonly string[], of: number): void {
  writeFileSync(join(data, `${language}.txt`), `${sample.join(" ")}\n`);
  console.log(`${language}: ${sample.length} of ${of} words`);
}

/** This function draws the sample of `es` from its lemmas, and the file of the hints from the pages dump. */
async function spanish(folder: string, data: string): Promise<void> {
  const file = hyphenFiles.find((entry) => entry.language === "es")!;
  const entries = await wiktionary(join(folder, "es-extract.jsonl.gz"), "es");
  const main = lemmaSample(entries, `${seed}/es`, size);
  writeSample(data, "es", main, entries.size);
  const dump = spawn("bzip2", ["-dc", join(folder, "eswiktionary-20261001-pages-articles.xml.bz2")], { stdio: ["ignore", "pipe", "inherit"] });
  const hints = new Map((await hintedEntries(createInterface({ input: dump.stdout, crlfDelay: Infinity }))).map(({ word, hint }) => [word, hint]));
  const hinted = new Map([...entries].filter(([word]) => hints.has(word)));
  const groupOf = (word: string): HintGroup => hintGroup(word, hints.get(word)!);
  const groups = Object.fromEntries(hintGroups.map((group) => {
    const members = [...hinted].filter(([word]) => groupOf(word) === group);
    return [group, { entries: members.length, lemmas: new Set(members.map(([, entry]) => entry.lemma)).size }];
  })) as Record<HintGroup, GroupCount>;
  const sampleSeed = `${seed}/es/hinted`;
  const record: HintFile = {
    schema: "typeset-hyphen-hints/1",
    dump: { name: file.hinted!.dump.name, url: file.hinted!.dump.url, sha256: file.hinted!.dump.sha256 },
    counts: { entries: hinted.size, lemmas: new Set([...hinted.values()].map((entry) => entry.lemma)).size, groups },
    seed: sampleSeed,
    sample: lemmaSample(hinted, sampleSeed, size).map((form) => [form, groupOf(form.replaceAll("-", ""))] as const),
    inMain: main.map((form) => form.replaceAll("-", "")).filter((word) => hints.has(word)),
  };
  writeFileSync(join(data, "es-hints.json"), `${JSON.stringify(record, null, 1)}\n`);
  console.log(`es: ${record.sample.length} hinted forms of ${record.counts.lemmas} lemmas and ${record.counts.entries} entries`);
}

const { values } = parseArgs({ options: { folder: { type: "string" }, language: { type: "string" } } });
if (values.folder === undefined) throw new Error("give the folder of the word lists with --folder");
const folder = values.folder;
const data = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "hyphen");
const chosen = values.language === undefined ? ["en-us", "de", "fr", "es"] : [values.language];
mkdirSync(data, { recursive: true });
for (const language of chosen) {
  if (language === "es") {
    await spanish(folder, data);
    continue;
  }
  if (language === "en-us" || language === "de") {
    const words = language === "en-us" ? moby(readFileSync(join(folder, "mhyph.txt"), "latin1")) : [...(await wiktionary(join(folder, "de-extract.jsonl.gz"), "de")).values()].map((entry) => entry.form);
    writeSample(data, language, random(`${seed}/${language}`).sample([...words].sort(), size).sort(), words.length);
    continue;
  }
  if (language !== "fr") throw new Error(`no word list for ${language}`);
  const french = parseLexique(readFileSync(join(folder, "Lexique383.tsv"), "utf8"));
  const words = [...french.syllables.values()];
  const sample = random(`${seed}/fr`).sample([...words].sort(), size).sort();
  writeSample(data, "fr", sample, words.length);
  // The rules of fr read the phonetic forms of some words of the sample. The file of forms gives them.
  const rules = referenceRules["fr"]!;
  const read = sample.map((entry) => entry.replaceAll("-", "")).filter(rules.reads);
  writeFileSync(join(data, rules.forms), `${read.map((word) => [word, ...(french.phonetic.get(word) ?? [])].join(" ")).join("\n")}\n`);
  console.log(`fr: the forms of ${read.length} words`);
}
