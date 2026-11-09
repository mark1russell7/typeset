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
import { floorFaults, hyphenFiles, texHyphenCommit, type HyphenFile } from "./sources.ts";
import { classReport, countDefects, parseForms, referenceRules, rulesOf, type ClassReport, type ReferenceFile, type RuleCount } from "./classes.ts";
import { makeLayer, withLayer, type Layer } from "./layer.ts";
import { parseLexique, type ReferenceList } from "./lexique.ts";
import { countMisses, coveredPlaces, fHalf, parseWords, scoreWords, share, type MissCounts, type WordScore } from "./words.ts";

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
  /** The share of the places of the list within the limits that the set gives (recall). */
  readonly found: number;
  /** The share of all places of the list that the set gives, also the places outside the limits. */
  readonly foundAll: number;
  /** The share of the places of the set that the list holds (precision). */
  readonly confirmed: number;
  /** The F-score with beta 0.5 of `found` and `confirmed`. */
  readonly fHalf: number;
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

/** The defects of each reference rule of a language, on the sample and on the full reference list. It also gives the count of entries of the layer. */
export interface ReferenceReport {
  readonly layer: number;
  readonly sample: Readonly<Record<string, RuleCount>>;
  readonly full: { readonly list: string; readonly words: number; readonly rules: Readonly<Record<string, RuleCount>> };
}

/** The missed places of one language, the report of each reference class, and the defects of each reference rule. */
export type LanguageMisses = MissCounts & { readonly misses: number; readonly classes: Readonly<Record<string, ClassReport>>; readonly reference: ReferenceReport | null };

/**
 * The record of the missed places. For each language, it gives the count of all missed places, of each class and of each cause
 * of a class. It also gives the report of each reference class.
 */
export interface MissRecord {
  readonly schema: "typeset-hyphen-misses/4";
  readonly languages: Readonly<Record<string, LanguageMisses>>;
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
export function hyphenPaths(root: string): { readonly source: (language: string) => string; readonly words: (language: string) => string; readonly matcher: string; readonly record: string; readonly misses: string; readonly forms: (file: string) => string; readonly layer: (language: string) => string } {
  return {
    source: (language) => join(root, "packages", "typeset", "src", "hyphen", `${language}.ts`),
    words: (language) => join(root, "packages", "conformance", "data", "hyphen", `${language}.txt`),
    matcher: join(root, "packages", "typeset", "src", "hyphen.ts"),
    record: join(root, "packages", "conformance", "data", "hyphen.json"),
    misses: join(root, "packages", "conformance", "data", "hyphen-misses.json"),
    forms: (file) => join(root, "packages", "conformance", "data", "hyphen", file),
    layer: (language) => join(root, "packages", "conformance", "data", "hyphen", `${language}-layer.json`),
  };
}

/** This function gives the SHA-256 of a word sample, without the white space at its end. */
export function sampleHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * This function makes the module of a language from the text of its file and the text of its word list. The function `formsOf`
 * gives the text of a file of forms. The `reference` gives the layer and the full reference list of a language with reference rules.
 */
export function makeSet(file: HyphenFile, text: string, list: string, formsOf: (name: string) => string, reference?: { readonly layer: Layer; readonly full: ReferenceList }): { readonly source: string; readonly score: WordScore; readonly misses: LanguageMisses; readonly patterns: number; readonly exceptions: number } {
  const pinned = parsePatterns(text);
  const data = { ...pinned, ...withLayer(pinned, reference?.layer) };
  const words = parseWords(list);
  const hyphenate = hyphenator(data);
  const score = scoreWords(words, hyphenate, data.left, data.right);
  const covered = coveredPlaces(data);
  const rules = referenceRules[file.language];
  const forms = rules === undefined ? new Map<string, readonly string[]>() : parseForms(formsOf(rules.forms));
  const phoneticOf = (word: string): readonly string[] => forms.get(word) ?? [];
  const classes = Object.fromEntries((rules?.classes ?? []).map((rule) => [rule.name, classReport(words, hyphenate, covered, data.left, data.right, rule, phoneticOf)]));
  let report: ReferenceReport | null = null;
  if (rules !== undefined && reference !== undefined) {
    const before = hyphenator(pinned);
    const full = countDefects(reference.full.words, rulesOf(rules), hyphenate, before, (word) => reference.full.phonetic.get(word) ?? []);
    report = { layer: reference.layer.entries.length, sample: countDefects(words, rulesOf(rules), hyphenate, before, phoneticOf), full: { list: reference.full.name, words: reference.full.words.length, rules: full } };
  }
  const misses = { misses: score.listed - score.both, ...countMisses(words, hyphenate, covered, data.left, data.right), classes, reference: report };
  const origin: HyphenSource = {
    language: file.language,
    file: file.name,
    commit: texHyphenCommit,
    sha256: file.sha256,
    license: file.license,
    words: { list: file.list.name, independent: file.list.independent, count: score.words, found: share(score.both, score.listed), confirmed: share(score.both, score.given) },
  };
  const entries = reference?.layer.entries.length ?? 0;
  const notes = entries === 0 ? [] : [`The exceptions also hold the ${entries} words of the layer data/hyphen/${file.language}-layer.json of @typeset/conformance.`];
  return { source: setSource(data, origin, notes), score, misses, patterns: data.patterns.split(" ").length, exceptions: data.exceptions === "" ? 0 : data.exceptions.split(" ").length };
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
export async function hyphenGate(root: string, textOf: (file: HyphenFile) => Promise<string>, referenceText: (file: ReferenceFile) => Promise<string>, write: boolean): Promise<{ readonly problems: readonly string[]; readonly record: HyphenRecord; readonly misses: MissRecord }> {
  const paths = hyphenPaths(root);
  const problems: string[] = [];
  const made: Omit<LanguageRecord, "weight">[] = [];
  const missed: [string, LanguageMisses][] = [];
  for (const file of hyphenFiles) {
    const list = readFileSync(paths.words(file.language), "utf8");
    const text = await textOf(file);
    const rules = referenceRules[file.language];
    let reference: { readonly layer: Layer; readonly full: ReferenceList } | undefined;
    if (rules !== undefined) {
      const full = parseLexique(await referenceText(rules.list));
      const layer = makeLayer(file.language, parsePatterns(text), full, rules);
      const layerText = `${JSON.stringify(layer, null, 2)}
`;
      if (write) writeFileSync(paths.layer(file.language), layerText);
      if (!existsSync(paths.layer(file.language)) || readFileSync(paths.layer(file.language), "utf8") !== layerText) problems.push(`the layer of ${file.language} differs from the layer of the pinned set and the reference list`);
      reference = { layer, full };
    }
    const set = makeSet(file, text, list, (name) => readFileSync(paths.forms(name), "utf8"), reference);
    for (const rule of rules === undefined ? [] : rulesOf(rules)) {
      const full = set.misses.reference?.full.rules[rule.name];
      if (full === undefined) continue;
      if (full.defects > 0) problems.push(`the set ${file.language} with its layer breaks the rule ${rule.name} ${full.defects} times on the full list`);
      if (rule.conflictLimit !== undefined && full.conflicts.length > rule.conflictLimit) problems.push(`the rule ${rule.name} of ${file.language} has ${full.conflicts.length} conflicts, over its limit ${rule.conflictLimit}`);
    }
    if (write) writeFileSync(paths.source(file.language), set.source);
    if (!existsSync(paths.source(file.language)) || readFileSync(paths.source(file.language), "utf8") !== set.source) problems.push(`the committed set ${file.language} differs from the set of its pinned file`);
    missed.push([file.language, set.misses]);
    problems.push(...floorFaults(file.language, { found: share(set.score.both, set.score.listed), confirmed: share(set.score.both, set.score.given) }, file.floor));
    made.push({ file: file.name, commit: texHyphenCommit, sha256: file.sha256, license: file.license, patterns: set.patterns, exceptions: set.exceptions, list: file.list, sample: sampleHash(list), score: set.score, found: share(set.score.both, set.score.listed), foundAll: share(set.score.both, set.score.places), confirmed: share(set.score.both, set.score.given), fHalf: fHalf(set.score) });
  }
  const languages = Object.fromEntries(made.map((language, index) => [hyphenFiles[index]!.language, { ...language, weight: weighEntry(paths.source(hyphenFiles[index]!.language)) }]));
  const record: HyphenRecord = { schema: "typeset-hyphen/1", esbuild: version, gzipLevel: 9, matcher: weighEntry(paths.matcher), languages };
  if (write) writeFileSync(paths.record, `${JSON.stringify(record, null, 2)}\n`);
  if (!existsSync(paths.record)) problems.push("the record does not exist");
  else problems.push(...recordDifferences(JSON.parse(readFileSync(paths.record, "utf8")) as HyphenRecord, record));
  const misses: MissRecord = { schema: "typeset-hyphen-misses/4", languages: Object.fromEntries(missed) };
  const missText = `${JSON.stringify(misses, null, 2)}\n`;
  if (write) writeFileSync(paths.misses, missText);
  if (!existsSync(paths.misses) || readFileSync(paths.misses, "utf8") !== missText) problems.push("the record of the missed places differs from the sets and the word lists");
  return { problems, record, misses };
}
