/**
 * The command `node src/fetch.ts <folder>`. It downloads the font files of the corpus and the extra font into the folder.
 * It checks the SHA-256 of each file. A file that is already there with the correct hash stays. A wrong hash stops the command.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extraSource, sequenceSources, fileName, fontSources, sourceUrl } from "./sources.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const folder = process.argv[2];
  if (folder === undefined) throw new Error("give the folder of the fonts");
  mkdirSync(folder, { recursive: true });
  for (const source of [...fontSources, extraSource, ...sequenceSources]) {
    const file = join(folder, fileName(source.id));
    if (existsSync(file) && sha256(readFileSync(file)) === source.sha256) continue;
    const response = await fetch(sourceUrl(source));
    if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status} from ${sourceUrl(source)}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hash = sha256(bytes);
    if (hash !== source.sha256) throw new Error(`${source.id}: the SHA-256 is ${hash}, not ${source.sha256}`);
    writeFileSync(file, bytes);
    console.log(`${source.id}: ${bytes.byteLength} bytes`);
  }
}

if (import.meta.main) await main();
