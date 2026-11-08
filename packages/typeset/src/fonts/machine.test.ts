import { random as createRandom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { alt, any, compile, longestMatch, opt, patternSource, seq, set, star, type Pattern } from "./machine.ts";

/** This function gives the longest match of the rules by a regular expression for each end, from the longest end. */
function regexMatch(rules: readonly Pattern[], text: string, at: number, end: number): { length: number; rule: number } | undefined {
  const expressions = rules.map((rule) => new RegExp(`^(?:${patternSource(rule)})$`));
  for (let stop = end; stop > at; stop--) {
    const rule = expressions.findIndex((expression) => expression.test(text.slice(at, stop)));
    if (rule >= 0) return { length: stop - at, rule };
  }
  return undefined;
}

/** This function gives a random pattern over the letters `abc`, with at most `depth` levels. */
function randomPattern(random: Random, depth: number): Pattern {
  const kind = depth === 0 ? random.below(3) : random.below(8);
  const part = (): Pattern => randomPattern(random, depth - 1);
  switch (kind) {
    case 0:
      return "abc"[random.below(3)]!;
    case 1:
      return set(["ab", "bc", "ac"][random.below(3)]!);
    case 2:
      return random.below(4) === 0 ? any : "ab";
    case 3:
      return seq(part(), part(), part());
    case 4:
      return alt(part(), part());
    case 5:
      return star(part());
    default:
      return opt(part());
  }
}

describe("the rule machine", () => {
  it("gives the longest match and the first rule of a tie, as a regular expression does", () => {
    const random = createRandom(16);
    for (let trial = 0; trial < 2000; trial++) {
      const rules = Array.from({ length: 1 + random.below(3) }, () => randomPattern(random, 3));
      const machines = rules.map(compile);
      const text = Array.from({ length: random.below(12) }, () => "abc"[random.below(3)]!).join("");
      const at = random.below(text.length + 1);
      const end = at + random.below(text.length - at + 1);
      expect(longestMatch(machines, text, at, end), `seed ${random.seed}, trial ${trial}, rules ${rules.map(patternSource).join(" ; ")}, text ${text}`).toEqual(regexMatch(rules, text, at, end));
    }
  });

  it("matches a star of a star and an empty rule without a loop, and never gives a match of no letters", () => {
    const machines = [compile(star(star("a"))), compile(opt("b"))];
    expect(longestMatch(machines, "aaab", 0, 4)).toEqual({ length: 3, rule: 0 });
    expect(longestMatch(machines, "c", 0, 1)).toBeUndefined();
    expect(longestMatch(machines, "b", 0, 1)).toEqual({ length: 1, rule: 1 });
  });
});
