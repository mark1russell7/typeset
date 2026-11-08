/**
 * The weight of each public entry of `@mark1russell7/typeset`: the bytes that a user pays. This module bundles an entry
 * with `esbuild`, with tree shaking, minified, with its dependencies, and then applies `gzip` at level 9.
 *
 * Source bytes do not show this cost. A file in the import closure of an entry gives 0 bytes when no export uses it. This
 * module is not part of the timing harness. It starts no process for a case, and its bytes do not depend on the runner.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildSync } from "esbuild";

/** The bytes of one entry. */
export interface EntryWeight {
  readonly minified: number;
  readonly gzip: number;
  /** The bytes of each input file in the output. A file with 0 bytes is not here. */
  readonly files: Readonly<Record<string, number>>;
}

/** The weights of the entries of one tree, by the name of the entry. */
export type Weights = Readonly<Record<string, EntryWeight>>;

/** One entry of a comparison with the last release. */
export interface WeightRow {
  readonly entry: string;
  readonly minified: number;
  readonly gzip: number;
  /** The minified bytes at the release. This value is `null` for an entry that the release does not have. */
  readonly releaseMinified: number | null;
  /** The `gzip` bytes at the release. This value is `null` for an entry that the release does not have. */
  readonly releaseGzip: number | null;
  /**
   * The growth in `gzip` bytes, from the release or from the base of the line of a new entry. This value is `null` for a
   * new entry with no line.
   */
  readonly growth: number | null;
  /** The line of a new entry. A row has no line when the release has the entry. */
  readonly line?: NewEntryLine;
  /** This value is `true` when the row fails the gate. The field `cause` tells the rule. */
  readonly over: boolean;
  /** `no-line`: a new entry has no line. `line-limit`: a new entry is over the limit of its line. `growth`: the growth is over the limit. */
  readonly cause?: "no-line" | "line-limit" | "growth";
}

/**
 * The line of an entry that no release has. The first CI measure is the base, and the limit comes from the prediction of
 * the item, which was made before the code. After a release with the entry, the gate ignores the line.
 */
export interface NewEntryLine {
  readonly limitGzipBytes: number;
  readonly baseGzipBytes: number;
  /** The CI run of the first measure. */
  readonly run: string;
  readonly reason: string;
}

/** The lines of the new entries, by the name of the entry. */
export type NewEntryLines = Readonly<Record<string, NewEntryLine>>;

/** This function gives the name and the file of each public entry in the `exports` of a package. */
export function publicEntries(exports: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(exports).filter(([name]) => name !== "./package.json");
}

/**
 * This function gives the weight of one entry. The field `nodePaths` finds the dependencies of a tree that has no
 * `node_modules`. The platform is the browser, because a browser user pays for these bytes.
 */
export function weighEntry(root: string, file: string, nodePaths: readonly string[]): EntryWeight {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [file],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    logLevel: "silent",
    nodePaths: [...nodePaths],
  });
  const code = result.outputFiles[0]!.contents;
  const output = Object.values(result.metafile.outputs)[0]!;
  const files = Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0);
  return { minified: code.length, gzip: gzipSync(code, { level: 9 }).length, files: Object.fromEntries(files.map(([path, input]) => [path, input.bytesInOutput])) };
}

/** This function gives the weight of each public entry of the package in the folder `root`. */
export function weighTree(root: string, nodePaths: readonly string[]): Weights {
  const { exports } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { exports: Record<string, string> };
  return Object.fromEntries(publicEntries(exports).map(([name, file]) => [name, weighEntry(root, file, nodePaths)]));
}

/**
 * This function compares the head with the release. A growth equal to the limit passes, and a `null` limit only reports.
 * A new entry needs a line in `lines`. Its growth is from the base of the line. Its `gzip` bytes are at most the limit
 * of the line. A new entry with no line fails.
 */
export function compareWeights(head: Weights, release: Weights, limit: number | null, lines: NewEntryLines = {}): WeightRow[] {
  return Object.entries(head).map(([entry, weight]) => {
    const released = release[entry];
    const line = released === undefined ? lines[entry] : undefined;
    const base = released?.gzip ?? line?.baseGzipBytes;
    const growth = base === undefined ? null : weight.gzip - base;
    const cause =
      limit === null ? undefined
      : released === undefined && line === undefined ? "no-line"
      : line !== undefined && weight.gzip > line.limitGzipBytes ? "line-limit"
      : growth !== null && growth > limit ? "growth"
      : undefined;
    const row = { entry, minified: weight.minified, gzip: weight.gzip, releaseMinified: released?.minified ?? null, releaseGzip: released?.gzip ?? null, growth, over: cause !== undefined };
    return { ...row, ...(line === undefined ? {} : { line }), ...(cause === undefined ? {} : { cause }) };
  });
}

/** This function gives `true` when two measures of one tree give equal bytes for each entry. */
export function sameWeights(first: Weights, second: Weights): boolean {
  return Object.keys(first).every((entry) => first[entry]!.minified === second[entry]?.minified && first[entry]!.gzip === second[entry]?.gzip);
}

function run(command: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** This function gives the newest release tag of the repository in the folder `repo`. */
export function latestTag(repo: string): string {
  const tag = run("git", ["tag", "--list", "v*", "--sort=-v:refname"], repo).split("\n")[0];
  if (!tag) throw new Error("the repository has no release tag");
  return tag;
}

/** This function gives the weights of the package at a tag. The dependencies come from `nodePaths`, so only the source differs. */
export function weighRelease(repo: string, tag: string, nodePaths: readonly string[]): Weights {
  const folder = mkdtempSync(join(tmpdir(), "typeset-weight-"));
  try {
    const archive = join(folder, "release.tar");
    run("git", ["archive", "--format=tar", "-o", archive, tag, "packages/typeset/src", "packages/typeset/package.json"], repo);
    // A relative name: GNU `tar` reads the `D:` of a Windows path as a remote host
    run("tar", ["-xf", "release.tar"], folder);
    return weighTree(join(folder, "packages", "typeset"), nodePaths);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
