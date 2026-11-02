import { Reader } from "./binary.ts";

/** A function that decompresses Brotli data. Node gives one as `brotliDecompressSync` of `node:zlib`. */
export type Decompress = (data: Uint8Array) => Uint8Array;

/** The tables of a font, by tag. A table that the decoder does not need can be absent. */
export type TableMap = ReadonlyMap<string, Reader>;

/** The tags of the WOFF2 table directory, in the order of the WOFF2 specification. */
const knownTags = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
] as const;

/** This function gives the tables of a TrueType, OpenType or WOFF2 file. */
export function readTables(bytes: Uint8Array, decompress?: Decompress): TableMap {
  const file = new Reader(bytes);
  if (file.length < 12) throw new RangeError("the file is too short for a font");
  const signature = file.tag(0);
  if (signature === "wOF2") {
    if (decompress === undefined) throw new Error("a WOFF2 file needs a Brotli decompress function");
    return readWoff2(file, decompress);
  }
  if (signature === "wOFF") throw new Error("WOFF 1 files are not supported");
  if (signature === "ttcf") throw new Error("font collections are not supported");
  if (file.u32(0) !== 0x00010000 && signature !== "OTTO" && signature !== "true") throw new Error(`the signature ${JSON.stringify(signature)} is not a font`);
  const tables = new Map<string, Reader>();
  const count = file.u16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    tables.set(file.tag(record), file.part(file.u32(record + 8), file.u32(record + 12)));
  }
  return tables;
}

/** This function reads a UIntBase128 number of WOFF2 and gives the number and the next offset. */
function base128(file: Reader, offset: number): [value: number, next: number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = file.u8(offset + i);
    if (i === 0 && byte === 0x80) throw new RangeError("a UIntBase128 has a leading zero");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new RangeError("a UIntBase128 is longer than 5 bytes");
}

/**
 * This function gives the tables of a WOFF2 file. The `glyf` and `loca` tables stay in their transformed form,
 * because the width does not use them. A transformed `hmtx` table becomes a plain table again.
 */
function readWoff2(file: Reader, decompress: Decompress): TableMap {
  const flavor = file.u32(4);
  if (flavor === 0x74746366) throw new Error("WOFF2 font collections are not supported");
  const count = file.u16(12);
  const compressedLength = file.u32(20);
  let offset = 48;
  const entries: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const flags = file.u8(offset++);
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = file.tag(offset);
      offset += 4;
    } else {
      const known = knownTags[flags & 0x3f];
      if (known === undefined) throw new RangeError(`the WOFF2 tag index ${flags & 0x3f} is unknown`);
      tag = known;
    }
    const version = (flags >> 6) & 3;
    let length: number;
    [length, offset] = base128(file, offset);
    // For glyf and loca, the version 0 is the transform. For the other tables, each version other than 0 is a transform
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed) [length, offset] = base128(file, offset);
    entries.push({ tag, length, transformed });
  }
  const data = new Reader(decompress(file.bytes.subarray(offset, offset + compressedLength)));
  const tables = new Map<string, Reader>();
  let at = 0;
  for (const entry of entries) {
    tables.set(entry.tag, data.part(at, entry.length));
    at += entry.length;
  }
  const hmtx = entries.find((entry) => entry.tag === "hmtx");
  if (hmtx?.transformed === true) tables.set("hmtx", untransformHmtx(tables));
  return tables;
}

/** This function gives a plain `hmtx` table from the transform of WOFF2. Only the advances matter, so each side bearing is 0. */
function untransformHmtx(tables: Map<string, Reader>): Reader {
  const source = tables.get("hmtx")!;
  const hhea = tables.get("hhea");
  if (hhea === undefined) throw new Error("a transformed hmtx needs hhea");
  const metrics = hhea.u16(34);
  const plain = new Uint8Array(metrics * 4);
  const view = new DataView(plain.buffer);
  for (let i = 0; i < metrics; i++) view.setUint16(i * 4, source.u16(1 + i * 2));
  return new Reader(plain);
}
