/** The download of a pinned file: the command keeps the file in a folder and checks its SHA-256 at each read. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** This function gives the SHA-256 of bytes in hexadecimal. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** This function gives the text of an error, with the text of its cause: `fetch` puts the reason of a failed connection there. */
function faultText(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const text = error instanceof Error ? error.message : String(error);
  return cause instanceof Error ? `${text} (${cause.message})` : text;
}

/**
 * This function gives the bytes of a pinned file in `folder`. When the folder does not have the correct bytes, the function
 * downloads the file. It tries each place of `url` in turn, and keeps the first bytes with the SHA-256 `sha`. The SHA-256 holds a
 * mirror to the same bytes. The function throws with the fault of each place when no place gives them.
 */
export async function pinnedBytes(folder: string, name: string, url: string | readonly string[], sha: string): Promise<Buffer> {
  const path = join(folder, name);
  if (existsSync(path) && sha256Of(readFileSync(path)) === sha) return readFileSync(path);
  const faults: string[] = [];
  for (const place of typeof url === "string" ? [url] : url) {
    try {
      const response = await fetch(place);
      if (!response.ok) {
        faults.push(`${place}: HTTP ${response.status}`);
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (sha256Of(bytes) !== sha) {
        faults.push(`${place}: the SHA-256 is ${sha256Of(bytes)}, not ${sha}`);
        continue;
      }
      writeFileSync(path, bytes);
      return readFileSync(path);
    } catch (error) {
      faults.push(`${place}: ${faultText(error)}`);
    }
  }
  throw new Error(`${name}: no place gave the pinned bytes. ${faults.join("; ")}`);
}
