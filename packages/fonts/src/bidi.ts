/**
 * A small model of the Unicode Bidirectional Algorithm (UAX #9) for one paragraph with the base level 0. Blink adds the
 * widths of the words of a canvas in the visual order, so the single-precision sum needs this order. The model has no
 * explicit embeddings, no isolates and no brackets (rule N0). It gets the bidi class of a character from its script and
 * its general category, so it knows the classes of the common characters only.
 */

/** A bidi class of UAX #9. */
type BidiClass = "L" | "R" | "AL" | "EN" | "ES" | "ET" | "AN" | "CS" | "NSM" | "BN" | "B" | "S" | "WS" | "ON";

const nonSpacingMark = /[\p{Mn}\p{Me}]/u;
const currency = /\p{Sc}/u;
const format = /\p{Cf}/u;
const hebrew = /\p{Script_Extensions=Hebrew}/u;
const arabicLetter = /[\p{Script_Extensions=Arabic}\p{Script_Extensions=Syriac}\p{Script_Extensions=Thaana}]/u;
const letter = /[\p{L}\p{Mc}]/u;
const commonSeparators: ReadonlySet<number> = new Set([0x2c, 0x2e, 0x2f, 0x3a, 0xa0, 0x60c, 0x202f, 0x2044]);

/** This function gives the bidi class of a character, from its code point, its script and its general category. */
function bidiClass(character: string): BidiClass {
  const c = character.codePointAt(0)!;
  if (nonSpacingMark.test(character)) return "NSM";
  if ((c >= 0x30 && c <= 0x39) || (c >= 0x6f0 && c <= 0x6f9) || c === 0xb2 || c === 0xb3 || c === 0xb9 || (c >= 0xff10 && c <= 0xff19)) return "EN";
  if ((c >= 0x660 && c <= 0x669) || c === 0x66b || c === 0x66c) return "AN";
  if (c === 0x2b || c === 0x2d || c === 0x2212) return "ES";
  if (c === 0x23 || c === 0x25 || c === 0xb0 || c === 0x2030 || currency.test(character)) return "ET";
  if (commonSeparators.has(c)) return "CS";
  if (c === 0x9 || c === 0xb || c === 0x1f) return "S";
  if (c === 0xa || c === 0xd || (c >= 0x1c && c <= 0x1e) || c === 0x85 || c === 0x2029) return "B";
  if (c === 0x20 || c === 0xc || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x3000) return "WS";
  if (format.test(character)) return "BN";
  if (hebrew.test(character)) return "R";
  if (arabicLetter.test(character)) return "AL";
  return letter.test(character) ? "L" : "ON";
}

/** This function gives the direction of a strong class for the rule N1: `EN` and `AN` count as `R`. */
function strongDirection(type: BidiClass): "L" | "R" | undefined {
  if (type === "L") return "L";
  return type === "R" || type === "EN" || type === "AN" ? "R" : undefined;
}

/**
 * This function gives the bidi level of each code point of a text, in a paragraph with the base level 0. It applies the
 * rules W1 to W7, N1, N2, I1 and L1 of UAX #9.
 */
export function bidiLevels(text: string): number[] {
  const characters = [...text];
  const original = characters.map(bidiClass);
  const types = [...original];
  const n = types.length;
  // W1: a mark gets the class of the character before it
  for (let i = 0; i < n; i++) if (types[i] === "NSM") types[i] = i === 0 || types[i - 1] === "BN" ? "L" : types[i - 1]!;
  // W2 and W3: a European digit after an Arabic letter is an Arabic digit, and an Arabic letter is R
  let strong: BidiClass = "L";
  for (let i = 0; i < n; i++) {
    const type = types[i]!;
    if (type === "L" || type === "R" || type === "AL") strong = type;
    else if (type === "EN" && strong === "AL") types[i] = "AN";
  }
  for (let i = 0; i < n; i++) if (types[i] === "AL") types[i] = "R";
  // W4: one separator between two digits of the same class gets their class
  for (let i = 1; i + 1 < n; i++) {
    const before = types[i - 1]!;
    if (types[i] === "ES" && before === "EN" && types[i + 1] === "EN") types[i] = "EN";
    else if (types[i] === "CS" && (before === "EN" || before === "AN") && types[i + 1] === before) types[i] = before;
  }
  // W5: a sequence of terminators next to a European digit is EN
  for (let i = 0; i < n; i++) {
    if (types[i] !== "ET") continue;
    let end = i;
    while (end < n && types[end] === "ET") end++;
    if ((i > 0 && types[i - 1] === "EN") || (end < n && types[end] === "EN")) types.fill("EN", i, end);
    i = end - 1;
  }
  // W6 and W7: the other separators and terminators are ON, and a European digit after L is L
  for (let i = 0; i < n; i++) if (types[i] === "ES" || types[i] === "ET" || types[i] === "CS") types[i] = "ON";
  strong = "L";
  for (let i = 0; i < n; i++) {
    const type = types[i]!;
    if (type === "L" || type === "R") strong = type;
    else if (type === "EN" && strong === "L") types[i] = "L";
  }
  // N1 and N2: a sequence of neutrals gets the direction of the strong characters on its two sides, or else L
  for (let i = 0; i < n; i++) {
    if (strongDirection(types[i]!) !== undefined) continue;
    let end = i;
    while (end < n && strongDirection(types[end]!) === undefined) end++;
    const before = i === 0 ? "L" : strongDirection(types[i - 1]!)!;
    const after = end === n ? "L" : strongDirection(types[end]!)!;
    types.fill(before === after ? before : "L", i, end);
    i = end - 1;
  }
  // I1: R goes up one level, and the digits go up two levels
  const levels = types.map((type) => (type === "R" ? 1 : type === "AN" || type === "EN" ? 2 : 0));
  // L1: the white space at the end and before each separator goes back to the base level
  const isSpace = (i: number) => original[i] === "WS" || original[i] === "BN";
  for (let i = n - 1; i >= 0 && isSpace(i); i--) levels[i] = 0;
  for (let i = 0; i < n; i++) {
    if (original[i] !== "S" && original[i] !== "B") continue;
    levels[i] = 0;
    for (let k = i - 1; k >= 0 && isSpace(k); k--) levels[k] = 0;
  }
  return levels;
}

/**
 * This function puts items in the visual order of the rule L2 of UAX #9. Each item has the level `levels[i]`. From the
 * highest level to the level 1, it reverses each sequence of items at that level or higher.
 */
export function visualOrder<T>(items: readonly T[], levels: readonly number[]): T[] {
  const order = items.map((_, i) => i);
  const at = [...levels];
  for (let level = Math.max(0, ...levels); level >= 1; level--) {
    for (let i = 0; i < order.length; i++) {
      if (at[i]! < level) continue;
      let end = i;
      while (end < order.length && at[end]! >= level) end++;
      order.splice(i, end - i, ...order.slice(i, end).reverse());
      at.splice(i, end - i, ...at.slice(i, end).reverse());
      i = end;
    }
  }
  return order.map((i) => items[i]!);
}
