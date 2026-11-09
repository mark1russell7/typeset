/**
 * The committed records of the hyphen patterns, for a reader in a browser. This entry imports only the two data files, so
 * a bundle that uses it gets no Node.js code of the gate.
 */
import hyphenFile from "../../data/hyphen.json" with { type: "json" };
import missesFile from "../../data/hyphen-misses.json" with { type: "json" };
import type { HyphenRecord, MissRecord } from "./gate.ts";

/** The record of the language sets: `data/hyphen.json`. */
export const hyphenRecord: HyphenRecord = hyphenFile as HyphenRecord;

/** The record of the missed places: `data/hyphen-misses.json`. */
export const missRecord: MissRecord = missesFile as MissRecord;
