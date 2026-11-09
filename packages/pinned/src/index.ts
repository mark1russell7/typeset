/**
 * The pinned files of the gates. The manifest `pinned.json` at the root of the repository lists each file with its mirror, its
 * SHA-256, its size and its group. The store is a release of the repository with one asset for each file. A gate reads a file
 * only from a folder. It does not fetch a file from a mirror. A missing or changed file stops the gate with a message.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A pinned file. */
export interface PinnedFile {
  /** The name of the file in a folder. */
  readonly name: string;
  /** The mirror of the file. Only the refresh command reads it. */
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
  /** The group of the file. A restore step gets the files of one or more groups. */
  readonly group: string;
}

/** The manifest of the pinned files. */
export interface PinnedManifest {
  readonly schema: "typeset-pinned/1";
  /** The repository of the store, as `owner/name`. */
  readonly repository: string;
  /** The tag of the release that holds the assets. */
  readonly store: string;
  readonly files: readonly PinnedFile[];
}

/** The path of the manifest in this repository. */
export const manifestPath: string = join(import.meta.dirname, "..", "..", "..", "pinned.json");

/** This function gives the SHA-256 of bytes in hexadecimal. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** This function gives the name of the asset of a file in the store. The hash is in the name, so an asset does not change at any time. */
export function assetName(file: PinnedFile): string {
  return `${file.sha256.slice(0, 16)}-${file.name}`;
}

/** This function reads a manifest and checks its form. */
export function readManifest(path: string = manifestPath): PinnedManifest {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as PinnedManifest;
  if (manifest.schema !== "typeset-pinned/1") throw new Error(`${path}: the schema is ${String(manifest.schema)}, not typeset-pinned/1`);
  const names = new Set<string>();
  for (const file of manifest.files) {
    if (!/^[\w.-]+$/u.test(file.name)) throw new Error(`${path}: the name ${file.name} is not a plain file name`);
    if (!/^[0-9a-f]{64}$/u.test(file.sha256)) throw new Error(`${path}: ${file.name} has no SHA-256 of 64 hex digits`);
    if (!Number.isInteger(file.bytes) || file.bytes <= 0) throw new Error(`${path}: ${file.name} has no size`);
    if (names.has(file.name)) throw new Error(`${path}: the name ${file.name} is in the manifest two times`);
    names.add(file.name);
  }
  return manifest;
}

/** This function gives the entry of a file in a manifest. It throws when the manifest does not have the file. */
export function pinnedFile(manifest: PinnedManifest, name: string): PinnedFile {
  const file = manifest.files.find((entry) => entry.name === name);
  if (file === undefined) throw new Error(`${name} is not in the manifest pinned.json. Add it, then start the workflow pinned-refresh.yml.`);
  return file;
}

/** This function gives the command that restores the files of a group into a folder. */
export function restoreCommand(group: string, folder: string): string {
  return `node packages/pinned/src/main.ts restore --group ${group} --folder ${folder}`;
}

/**
 * This function reads a pinned file from a folder. It throws when the file is not in the folder, or when its size or its SHA-256
 * differs from the manifest. The message names the file and the restore command. The function does not fetch the file.
 */
export function readPinned(folder: string, file: PinnedFile): Buffer {
  const path = join(folder, file.name);
  if (!existsSync(path)) throw new Error(`${file.name}: the file is not in ${folder}. Restore it with: ${restoreCommand(file.group, folder)}`);
  const bytes = readFileSync(path);
  const sha = sha256Of(bytes);
  if (bytes.byteLength !== file.bytes || sha !== file.sha256) {
    throw new Error(`${file.name}: the file in ${folder} has ${bytes.byteLength} bytes and the SHA-256 ${sha}, not ${file.bytes} bytes and ${file.sha256}. Delete it and restore it with: ${restoreCommand(file.group, folder)}`);
  }
  return bytes;
}

/** This function tells if a folder has the correct bytes of a file. */
export function hasPinned(folder: string, file: PinnedFile): boolean {
  const path = join(folder, file.name);
  if (!existsSync(path)) return false;
  const bytes = readFileSync(path);
  return bytes.byteLength === file.bytes && sha256Of(bytes) === file.sha256;
}

/** This function gives the files of the groups, in the order of the manifest. It throws for a group with no file. */
export function groupFiles(manifest: PinnedManifest, groups: readonly string[]): PinnedFile[] {
  for (const group of groups) {
    if (!manifest.files.some((file) => file.group === group)) throw new Error(`the manifest has no file in the group ${group}`);
  }
  return manifest.files.filter((file) => groups.includes(file.group));
}
