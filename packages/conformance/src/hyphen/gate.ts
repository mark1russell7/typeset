/**
 * The gate of the language sets. It makes each module from its pinned file, scores the set on its word list, and weighs each
 * entry. It reports each difference from the committed modules and from the record `data/hyphen.json`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { hyphenator, type HyphenSource } from "@mark1russell7/typeset/hyphen";
import { buildSync, version } from "esbuild";
import { parsePatterns, setSource } from "./patterns.ts";
import { hyphenFiles, texHyphenCommit, type HyphenFile } from "./sources.ts";
import { parseWords, scoreWords, share, type WordScore } from "./words.ts";

/** The bytes of one entry. */
export interface EntryWeight {
  readonly minified: number;
  readonly gzip: number;
}

/** One language of the record. */
export interface LanguageRecord {
  readonly file: string;
  readonly commit: string;
  readonly sha256: string;
  readonly license: string;
  readonly patterns: number;
  readonly exceptions: number;
  readonly list: { readonly name: string; readonly url: string; readonly sha256: string; readonly license: string; readonly independent: boolean };
  /** The SHA-256 of the committed sample, so a change of a word shows also when the score stays the same. */
  readonly sample: string;
  readonly score: WordScore;
  readonly found: number;
  readonly confirmed: number;
  readonly weight: EntryWeight;
}

/** The record of the language sets. */
export interface HyphenRecord {
  readonly schema: "typeset-hyphen/1";
  readonly esbuild: string;
  readonly gzipLevel: 9;
  /** The weight of the entry with the matcher and no language. */
  readonly matcher: EntryWeight;
  readonly languages: Readonly<Record<string, LanguageRecord>>;
}

/** The share of the `gzip` bytes that a record can differ from a measure. Another build of zlib gives other bytes. */
export const gzipTolerance = 0.01;

/**
 * This function gives the weight of an entry, as the weight gate does. That measure is a bundle for the browser, with tree
 * shaking, minified, then `gzip` at level 9.
 */
export function weighEntry(file: string): EntryWeight {
  const result = buildSync({ entryPoints: [file], bundle: true, minify: true, format: "esm", platform: "browser", target: "es2022", write: false, logLevel: "silent" });
  const code = result.outputFiles[0]!.contents;
  return { minified: code.length, gzip: gzipSync(code, { level: 9 }).length };
}

/** This function gives the paths of the gate from the root of the repository. */
export function hyphenPaths(root: string): { readonly source: (language: string) => string; readonly words: (language: string) => string; readonly matcher: string; readonly record: string } {
  return {
    source: (language) => join(root, "packages", "typeset", "src", "hyphen", `${language}.ts`),
    words: (language) => join(root, "packages", "conformance", "data", "hyphen", `${language}.txt`),
    matcher: join(root, "packages", "typeset", "src", "hyphen.ts"),
    record: join(root, "packages", "conformance", "data", "hyphen.json"),
  };
}

/** This function gives the SHA-256 of a word sample, without the white space at its end. */
export function sampleHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/** This function makes the module of a language from the text of its file and the text of its word list. */
export function makeSet(file: HyphenFile, text: string, list: string): { readonly source: string; readonly score: WordScore; readonly patterns: number; readonly exceptions: number } {
  const data = parsePatterns(text);
  const score = scoreWords(parseWords(list), hyphenator(data), data.left, data.right);
  const origin: HyphenSource = {
    language: file.language,
    file: file.name,
    commit: texHyphenCommit,
    sha256: file.sha256,
    license: file.license,
    words: { list: file.list.name, independent: file.list.independent, count: score.words, found: share(score.both, score.listed), confirmed: share(score.both, score.given) },
  };
  return { source: setSource(data, origin), score, patterns: data.patterns.split(" ").length, exceptions: data.exceptions === "" ? 0 : data.exceptions.split(" ").length };
}

/** This function tells what differs between a committed record and a new record. Only the `gzip` bytes can differ, within the tolerance. */
export function recordDifferences(committed: HyphenRecord, fresh: HyphenRecord): string[] {
  const differs = (a: EntryWeight, b: EntryWeight): boolean => a.minified !== b.minified || Math.abs(a.gzip - b.gzip) > gzipTolerance * b.gzip;
  const same = (record: HyphenRecord): string => JSON.stringify({ ...record, matcher: null, languages: Object.entries(record.languages).map(([name, language]) => [name, { ...language, weight: null }]) });
  const problems: string[] = [];
  if (same(committed) !== same(fresh)) problems.push("the fields of the record differ from the pinned files and the word lists");
  if (differs(committed.matcher, fresh.matcher)) problems.push("the weight of the matcher differs from the record");
  for (const [name, language] of Object.entries(fresh.languages)) {
    const old = committed.languages[name];
    if (old === undefined || differs(old.weight, language.weight)) problems.push(`the weight of ${name} differs from the record`);
  }
  return problems;
}

/** This function does the checks of the gate. `textOf` gives the text of a pattern file after it checks the SHA-256. With `write`, it writes the modules and the record. */
export async function hyphenGate(root: string, textOf: (file: HyphenFile) => Promise<string>, write: boolean): Promise<{ readonly problems: readonly string[]; readonly record: HyphenRecord }> {
  const paths = hyphenPaths(root);
  const problems: string[] = [];
  const made: Omit<LanguageRecord, "weight">[] = [];
  for (const file of hyphenFiles) {
    const list = readFileSync(paths.words(file.language), "utf8");
    const set = makeSet(file, await textOf(file), list);
    if (write) writeFileSync(paths.source(file.language), set.source);
    if (!existsSync(paths.source(file.language)) || readFileSync(paths.source(file.language), "utf8") !== set.source) problems.push(`the committed set ${file.language} differs from the set of its pinned file`);
    made.push({ file: file.name, commit: texHyphenCommit, sha256: file.sha256, license: file.license, patterns: set.patterns, exceptions: set.exceptions, list: file.list, sample: sampleHash(list), score: set.score, found: share(set.score.both, set.score.listed), confirmed: share(set.score.both, set.score.given) });
  }
  const languages = Object.fromEntries(made.map((language, index) => [hyphenFiles[index]!.language, { ...language, weight: weighEntry(paths.source(hyphenFiles[index]!.language)) }]));
  const record: HyphenRecord = { schema: "typeset-hyphen/1", esbuild: version, gzipLevel: 9, matcher: weighEntry(paths.matcher), languages };
  if (write) writeFileSync(paths.record, `${JSON.stringify(record, null, 2)}\n`);
  if (!existsSync(paths.record)) problems.push("the record does not exist");
  else problems.push(...recordDifferences(JSON.parse(readFileSync(paths.record, "utf8")) as HyphenRecord, record));
  return { problems, record };
}
