/**
 * A small rule machine over a text of letters. Each rule is a pattern, and the machine finds the longest match of all
 * rules at a position in one pass. It moves an automaton of each rule over the letters, so the time is linear in the
 * length of the match. A regular expression with `^` and `$` gives the same matches, but a search over each end is
 * quadratic. This module is internal to typeset.
 */

/** A pattern of a rule. A string is a sequence of its letters. */
export type Pattern =
  | string
  | { readonly kind: "set"; readonly letters: string }
  | { readonly kind: "any" }
  | { readonly kind: "seq"; readonly parts: readonly Pattern[] }
  | { readonly kind: "alt"; readonly parts: readonly Pattern[] }
  | { readonly kind: "star"; readonly part: Pattern }
  | { readonly kind: "opt"; readonly part: Pattern };

/** This function gives a pattern that matches one of the letters. */
export const set = (letters: string): Pattern => ({ kind: "set", letters });
/** The pattern that matches any one letter. */
export const any: Pattern = { kind: "any" };
/** This function gives a pattern that matches the parts one after the other. */
export const seq = (...parts: Pattern[]): Pattern => ({ kind: "seq", parts });
/** This function gives a pattern that matches one of the parts. */
export const alt = (...parts: Pattern[]): Pattern => ({ kind: "alt", parts });
/** This function gives a pattern that matches the part 0 or more times. */
export const star = (part: Pattern): Pattern => ({ kind: "star", part });
/** This function gives a pattern that matches the part 0 or 1 times. */
export const opt = (part: Pattern): Pattern => ({ kind: "opt", part });

/** This function escapes a letter for a regular expression. */
const escape = (letter: string): string => letter.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");

/** This function gives the source of a regular expression with the same matches as a pattern. The tests use it. */
export function patternSource(pattern: Pattern): string {
  if (typeof pattern === "string") return [...pattern].map(escape).join("");
  switch (pattern.kind) {
    case "set":
      return `[${[...pattern.letters].map(escape).join("")}]`;
    case "any":
      return "[^]";
    case "seq":
      return pattern.parts.map((part) => `(?:${patternSource(part)})`).join("");
    case "alt":
      return `(?:${pattern.parts.map(patternSource).join("|")})`;
    case "star":
      return `(?:${patternSource(pattern.part)})*`;
    case "opt":
      return `(?:${patternSource(pattern.part)})?`;
  }
}

/**
 * The automaton of one rule. A state with `letters` steps to `next` on one of its letters, or on any letter when
 * `letters` is `null`. A state with `split` has steps with no letter to each of its states. State 0 accepts.
 */
interface State {
  readonly letters?: string | null;
  next?: number;
  split?: number[];
}

/** The automaton of one rule, with its start state. */
export interface Machine {
  readonly states: readonly State[];
  readonly start: number;
}

/** This function builds the automaton of a pattern, by the construction of Thompson. */
export function compile(pattern: Pattern): Machine {
  const states: State[] = [{}];
  const build = (p: Pattern, next: number): number => {
    if (typeof p === "string") return [...p].reduceRight((to, letter) => states.push({ letters: letter, next: to }) - 1, next);
    switch (p.kind) {
      case "set":
        return states.push({ letters: p.letters, next }) - 1;
      case "any":
        return states.push({ letters: null, next }) - 1;
      case "seq":
        return p.parts.reduceRight((to, part) => build(part, to), next);
      case "alt":
        return states.push({ split: p.parts.map((part) => build(part, next)) }) - 1;
      case "opt":
        return states.push({ split: [build(p.part, next), next] }) - 1;
      case "star": {
        const loop = states.push({ split: [] }) - 1;
        states[loop]!.split = [build(p.part, loop), next];
        return loop;
      }
    }
  };
  return { states, start: build(pattern, 0) };
}

/** This function adds a state and each state that it reaches with no letter to a set. */
function close(machine: Machine, state: number, into: Set<number>): void {
  const stack = [state];
  while (stack.length > 0) {
    const s = stack.pop()!;
    if (into.has(s)) continue;
    into.add(s);
    for (const to of machine.states[s]!.split ?? []) stack.push(to);
  }
}

/**
 * This function gives the longest match of the rules in `text` from `at`, which ends at `end` or before it. A tie of two
 * rules goes to the first rule. A match has at least one letter. It gives `undefined` when no rule matches.
 */
export function longestMatch(machines: readonly Machine[], text: string, at: number, end: number): { readonly length: number; readonly rule: number } | undefined {
  let best: { length: number; rule: number } | undefined;
  let current = machines.map((machine) => {
    const states = new Set<number>();
    close(machine, machine.start, states);
    return states;
  });
  for (let position = at; position < end && current.some((states) => states.size > 0); position++) {
    const letter = text[position]!;
    current = current.map((states, rule) => {
      const machine = machines[rule]!;
      const next = new Set<number>();
      for (const s of states) {
        const state = machine.states[s]!;
        if (state.letters !== undefined && (state.letters === null || state.letters.includes(letter))) close(machine, state.next!, next);
      }
      return next;
    });
    const length = position + 1 - at;
    const rule = current.findIndex((states) => states.has(0));
    if (rule >= 0) best = { length, rule };
  }
  return best;
}
