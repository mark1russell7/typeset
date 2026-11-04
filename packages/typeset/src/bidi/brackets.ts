import { bracketPairs } from "./table.ts";

let brackets: Map<number, number> | undefined;

/**
 * This function gives the value of a code point for the `brackets` of `resolveLevels`. The value is above 0 for an opening
 * paired bracket, below 0 for a closing paired bracket, and 0 for each other code point. U+3009 and U+232A have the same value.
 */
export function bracketOf(codePoint: number): number {
  if (brackets === undefined) {
    brackets = new Map();
    const lengths = bracketPairs.split(" ").map((length) => Number.parseInt(length, 36));
    let open = 0;
    for (let i = 0; i < lengths.length; i += 2) {
      open += lengths[i]!;
      const close = open + lengths[i + 1]!;
      const id = close === 0x232a ? 0x3009 : close;
      brackets.set(open, id);
      brackets.set(close, -id);
    }
  }
  return brackets.get(codePoint) ?? 0;
}
