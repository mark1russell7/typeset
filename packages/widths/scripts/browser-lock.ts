/**
 * The job `changes` of the Fonts workflow starts this script with the base lock and the head lock. The script writes
 * `changed=true` to `GITHUB_OUTPUT` when the browser packages differ.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { browserChanged, browserVersions } from "../src/browser-lock.ts";

const [basePath, headPath] = process.argv.slice(2);
if (basePath === undefined || headPath === undefined) throw new Error("usage: browser-lock.ts <base lock> <head lock>");
const base = readFileSync(basePath, "utf8");
const head = readFileSync(headPath, "utf8");
const changed = browserChanged(base, head);
console.log(`Browser packages of the base lock: ${browserVersions(base).join(", ") || "none"}.`);
console.log(`Browser packages of the head lock: ${browserVersions(head).join(", ") || "none"}.`);
console.log(changed ? "The browser changed, so the width arms run." : "The browser did not change.");
const output = process.env["GITHUB_OUTPUT"];
if (output) appendFileSync(output, `changed=${changed}\n`);
