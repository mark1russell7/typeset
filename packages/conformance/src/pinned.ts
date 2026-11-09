/** The download of a pinned file: the command keeps the file in a folder and checks its SHA-256 at each read. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** This function gives the SHA-256 of bytes in hexadecimal. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * This function gives the bytes of a pinned file in `folder`. It downloads the file from `url` when the folder does not have the
 * correct bytes. It throws when the downloaded bytes do not have the SHA-256 `sha`.
 */
export async function pinnedBytes(folder: string, name: string, url: string, sha: string): Promise<Buffer> {
  const path = join(folder, name);
  if (existsSync(path) && sha256Of(readFileSync(path)) === sha) return readFileSync(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256Of(bytes) !== sha) throw new Error(`${name}: the SHA-256 is ${sha256Of(bytes)}, not ${sha}`);
  writeFileSync(path, bytes);
  return readFileSync(path);
}
