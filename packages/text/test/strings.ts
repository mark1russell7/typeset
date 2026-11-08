/** The seeded strings of the tests: short strings with many characters that have a meaning in HTML, patterns and Markdown. */
import { random } from "@mark1russell7/rigor-generators";

/** The parts of a string. Each ASCII punctuation character is here, with letters, digits, line ends and other scripts. */
export const PARTS: readonly string[] = [
  ..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  "a",
  "Z",
  "0",
  "9",
  " ",
  "    ",
  "\t",
  "\n",
  "\r",
  "\r\n",
  "é",
  "日本",
  "😀",
  "&amp;",
  "</p>",
];

/** This function gives `count` strings of 0 to 24 parts, from the seed `seed`. The same seed gives the same strings. */
export function strings(seed: string, count: number): string[] {
  const r = random(seed);
  return Array.from({ length: count }, () => Array.from({ length: r.int(0, 24) }, () => r.pick(PARTS)).join(""));
}
