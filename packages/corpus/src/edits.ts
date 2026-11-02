import { generateText } from "./generate.ts";
import { deriveSeed, random as createRandom } from "@mark1russell7/rigor-generators";
import type { ScriptId } from "./scripts.ts";

/**
 * One edit of a text. The positions are UTF-16 code units, as `String.prototype.slice` uses them.
 * A generated edit always starts and ends on a code point boundary.
 */
export type Edit =
  | { readonly kind: "insert"; readonly at: number; readonly text: string }
  | { readonly kind: "delete"; readonly at: number; readonly length: number }
  | { readonly kind: "replace"; readonly at: number; readonly length: number; readonly text: string };

/** The input of `generateEdits`. */
export interface EditSpec {
  readonly seed: number;
  /** The script of the inserted text. */
  readonly script: ScriptId;
  /** The text before the first edit. */
  readonly base: string;
  /** The count of edits. */
  readonly count: number;
}

/** This function applies one edit to a text. It throws a `RangeError` when the edit does not fit the text. */
export function applyEdit(text: string, edit: Edit): string {
  const length = edit.kind === "insert" ? 0 : edit.length;
  if (!Number.isInteger(edit.at) || edit.at < 0 || edit.at + length > text.length || length < 0) {
    throw new RangeError(`the edit ${edit.kind} at ${edit.at} with length ${length} does not fit a text of ${text.length} code units`);
  }
  const inserted = edit.kind === "delete" ? "" : edit.text;
  return text.slice(0, edit.at) + inserted + text.slice(edit.at + length);
}

/** This function applies a sequence of edits, in order, to a text. */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  return edits.reduce(applyEdit, text);
}

/** This function gives `true` when a position of a text is not between the two halves of a surrogate pair. */
export function isBoundary(text: string, at: number): boolean {
  if (at <= 0 || at >= text.length) return true;
  const before = text.charCodeAt(at - 1);
  const after = text.charCodeAt(at);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

/** This function moves a position back to the nearest code point boundary. */
function snap(text: string, at: number): number {
  const clamped = Math.max(0, Math.min(text.length, at));
  return isBoundary(text, clamped) ? clamped : clamped - 1;
}

/** This function moves a position forward over one code point. */
function stepForward(text: string, at: number): number {
  if (at >= text.length) return at;
  const code = text.codePointAt(at)!;
  return at + (code > 0xffff ? 2 : 1);
}

/**
 * This function generates a sequence of edits as a person makes them.
 * The edits are text at a cursor, backspace, a paste, and the deletion or the replacement of a selection.
 * Each edit fits the text that the edits before it make.
 */
export function generateEdits(spec: EditSpec): Edit[] {
  const random = createRandom(deriveSeed(spec.seed, `edits/${spec.script}`));
  const edits: Edit[] = [];
  let text = spec.base;
  let cursor = snap(text, random.int(0, text.length));
  for (let i = 0; i < spec.count; i++) {
    const roll = random.next();
    let edit: Edit;
    if (roll < 0.1 && text.length > 0) {
      // A jump of the cursor to a new position before the edit
      cursor = snap(text, random.int(0, text.length));
    }
    if (roll < 0.55 || text.length === 0) {
      const typed = generateText(random, spec.script, 1);
      edit = { kind: "insert", at: cursor, text: typed };
      cursor += typed.length;
    } else if (roll < 0.75) {
      if (cursor === 0) {
        // The key Delete at the start of the text
        edit = { kind: "delete", at: 0, length: stepForward(text, 0) };
      } else {
        // The key Backspace: one code point before the cursor
        const from = snap(text, cursor - 1);
        edit = { kind: "delete", at: from, length: cursor - from };
        cursor = from;
      }
    } else if (roll < 0.85) {
      const pasted = generateText(random, spec.script, random.int(5, 60));
      edit = { kind: "insert", at: cursor, text: pasted };
      cursor += pasted.length;
    } else {
      const a = snap(text, random.int(0, text.length));
      const b = snap(text, Math.min(text.length, a + random.int(1, 40)));
      const at = Math.min(a, b);
      const length = Math.max(a, b) - at;
      if (roll < 0.93) {
        edit = { kind: "delete", at, length };
        cursor = at;
      } else {
        const replacement = generateText(random, spec.script, random.int(1, 20));
        edit = { kind: "replace", at, length, text: replacement };
        cursor = at + replacement.length;
      }
    }
    text = applyEdit(text, edit);
    edits.push(edit);
  }
  return edits;
}
