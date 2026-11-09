/**
 * The command of the pinned files.
 *
 * - `restore --group <a,b> --folder <dir>` gets the files of the groups from the store of the manifest with `gh`. A file that is in
 *   the folder with the correct bytes stays. The command does not fetch a file from a mirror.
 * - `refresh [--all]` fetches each file whose asset is not in the store from its mirror, checks its size and its SHA-256, and
 *   uploads it. With `--all`, it also fetches each other file and checks that its mirror gives the same bytes. A difference stops
 *   the command with an error. The command makes the release of the store when the release is not there.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { assetName, groupFiles, hasPinned, readManifest, readPinned, sha256Of, type PinnedFile, type PinnedManifest } from "./index.ts";

/** This function starts `gh` with an argument list, and gives its output. */
function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

/** This function gets the files of the groups from the store into the folder. */
function restore(manifest: PinnedManifest, groups: readonly string[], folder: string): void {
  mkdirSync(folder, { recursive: true });
  const files = groupFiles(manifest, groups);
  const missing = files.filter((file) => !hasPinned(folder, file));
  if (missing.length > 0) {
    const download = join(folder, ".pinned-download");
    rmSync(download, { recursive: true, force: true });
    gh(["release", "download", manifest.store, "--repo", manifest.repository, "--dir", download, ...missing.flatMap((file) => ["--pattern", assetName(file)])]);
    for (const file of missing) renameSync(join(download, assetName(file)), join(folder, file.name));
    rmSync(download, { recursive: true, force: true });
  }
  for (const file of files) readPinned(folder, file);
  console.log(`pinned: ${files.length} files of ${groups.join(", ")} in ${folder}, ${missing.length} from the store ${manifest.store}`);
}

/** This function gives the names of the assets of the store. It makes the release when it is not there. */
function storeAssets(manifest: PinnedManifest): Set<string> {
  const releases = gh(["release", "list", "--repo", manifest.repository, "--json", "tagName", "--jq", ".[].tagName", "--limit", "200"]).split("\n");
  if (!releases.includes(manifest.store)) {
    const notes = "The store of the pinned files of the gates. Each asset is a file of pinned.json, named by its SHA-256. Do not delete or change an asset.";
    gh(["release", "create", manifest.store, "--repo", manifest.repository, "--title", "Pinned files of the gates", "--notes", notes, "--prerelease", "--latest=false"]);
    return new Set();
  }
  return new Set(gh(["release", "view", manifest.store, "--repo", manifest.repository, "--json", "assets", "--jq", ".assets[].name"]).split("\n").filter(Boolean));
}

/** This function fetches a file from its mirror and gives a fault when its size or its SHA-256 differs from the manifest. */
async function fromMirror(file: PinnedFile): Promise<{ readonly bytes?: Uint8Array; readonly fault?: string }> {
  try {
    const response = await fetch(file.url);
    if (!response.ok) return { fault: `${file.name}: HTTP ${response.status} from ${file.url}` };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha = sha256Of(bytes);
    if (bytes.byteLength !== file.bytes || sha !== file.sha256) return { fault: `${file.name}: ${file.url} gives ${bytes.byteLength} bytes and the SHA-256 ${sha}, not ${file.bytes} bytes and ${file.sha256}` };
    return { bytes };
  } catch (error) {
    return { fault: `${file.name}: the fetch of ${file.url} failed: ${String(error)}` };
  }
}

/** A file whose mirror does not give the bytes of the manifest. */
interface MirrorFault {
  readonly file: PinnedFile;
  readonly fault: string;
}

/**
 * This function makes the faults loud in a GitHub Actions run. Each file gets one error annotation, and the summary of the job
 * gets a table with the file and its mirror. The caller then fails the run.
 */
function report(faults: readonly MirrorFault[]): void {
  for (const { file, fault } of faults) console.log(`::error title=The mirror of ${file.name} differs from pinned.json::${fault.replaceAll("\n", " ")}`);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary === undefined) return;
  const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = faults.map(({ file, fault }) => `| ${cell(file.name)} | ${cell(file.url)} | ${cell(fault)} |`);
  const lines = ["## The mirrors of pinned files differ from pinned.json", "", "Change pinned.json by a pull request, or give the file a new mirror.", "", "| File | Mirror | Fault |", "|---|---|---|", ...rows, ""];
  appendFileSync(summary, `${lines.join("\n")}\n`);
}

/** This function uploads each missing asset to the store. With `all`, it also checks the mirror of each other file. */
async function refresh(manifest: PinnedManifest, all: boolean, folder: string): Promise<void> {
  const assets = storeAssets(manifest);
  mkdirSync(folder, { recursive: true });
  const faults: MirrorFault[] = [];
  let uploaded = 0;
  for (const file of manifest.files) {
    const missing = !assets.has(assetName(file));
    if (!missing && !all) continue;
    const { bytes, fault } = await fromMirror(file);
    if (fault !== undefined || bytes === undefined) {
      faults.push({ file, fault: fault ?? `${file.name}: no bytes` });
      continue;
    }
    if (!missing) continue;
    const path = join(folder, assetName(file));
    writeFileSync(path, bytes);
    gh(["release", "upload", manifest.store, path, "--repo", manifest.repository]);
    uploaded += 1;
    console.log(`pinned: uploaded ${assetName(file)} (${file.bytes} bytes)`);
  }
  console.log(`pinned: ${uploaded} assets uploaded, ${assets.size + uploaded} of ${manifest.files.length} files in the store ${manifest.store}`);
  if (faults.length > 0) {
    report(faults);
    throw new Error(`the mirrors of ${faults.length} files do not give the bytes of the manifest:\n${faults.map(({ fault }) => fault).join("\n")}`);
  }
}

const { positionals, values } = parseArgs({ allowPositionals: true, options: { group: { type: "string" }, folder: { type: "string" }, all: { type: "boolean" } } });
const manifest = readManifest();
if (positionals[0] === "restore") {
  if (values.group === undefined || values.folder === undefined) throw new Error("restore needs --group <a,b> and --folder <dir>");
  restore(manifest, values.group.split(","), values.folder);
} else if (positionals[0] === "refresh") {
  await refresh(manifest, values.all === true, values.folder ?? join(process.cwd(), ".pinned-refresh"));
} else {
  throw new Error("give the command restore or refresh");
}
