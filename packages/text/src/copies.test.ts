import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { describe, expect, it } from "vitest";
import { differences } from "../test/differences.ts";
import { strings } from "../test/strings.ts";
import { escapeAttribute, escapeHtml, escapeMarkdown, escapeRegExp } from "./index.ts";

interface Copy {
  readonly id: string;
  readonly group: "html" | "attribute" | "regexp" | "markdown";
  readonly name: string;
  readonly call: "text" | "each character";
  readonly body: string;
  readonly context?: string;
  readonly repo: string;
  readonly path: string;
  readonly commit: string;
}

const { copies } = JSON.parse(readFileSync(new URL("../test/copies.json", import.meta.url), "utf8")) as { copies: readonly Copy[] };
const homes = { html: escapeHtml, attribute: escapeAttribute, regexp: escapeRegExp, markdown: escapeMarkdown } as const;
const texts = strings("text/copies", 1000);

// Each copy runs as its repository has it. The test removes only the types and the word `export`.
function run(copy: Copy): (text: string) => string {
  const source = [copy.context ?? "", copy.body.replace(/^\s*export\s+/, "")].join("\n");
  const make = new Function(`${stripTypeScriptTypes(source)}\nreturn ${copy.name};`) as () => (text: string) => string;
  const fn = make();
  return copy.call === "each character" ? (text) => [...text].map(fn).join("") : fn;
}

describe("the copies of the codeatlas list", () => {
  it("has 53 copies of the four groups, each with its repository, path, commit and body", () => {
    expect(copies).toHaveLength(53);
    expect(copies.filter((copy) => copy.group === "html")).toHaveLength(1);
    expect(copies.filter((copy) => copy.group === "attribute")).toHaveLength(31);
    expect(copies.filter((copy) => copy.group === "regexp")).toHaveLength(16);
    expect(copies.filter((copy) => copy.group === "markdown")).toHaveLength(5);
    for (const copy of copies) {
      expect(copy.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(copy.body).toContain(copy.name);
      expect(copy.id).toBe(`${copy.repo}/${copy.path}:${copy.id.split(":").at(-1)}`);
    }
  });

  it("lists each copy in at most one difference, and each listed id is a copy", () => {
    const listed = differences.flatMap((difference) => difference.copies);
    expect(new Set(listed).size).toBe(listed.length);
    const ids = new Set(copies.map((copy) => copy.id));
    for (const id of listed) expect(ids.has(id), id).toBe(true);
  });

  for (const copy of copies) {
    it(`${copy.id} gives the output of the home, or the committed difference`, () => {
      const fn = run(copy);
      const home = homes[copy.group];
      const difference = differences.find((d) => d.copies.includes(copy.id));
      const to = difference?.to ?? ((text: string) => text);
      const when = difference?.when ?? (() => true);
      let differs = 0;
      for (const text of texts) {
        const output = fn(text);
        if (output !== home(text)) differs += 1;
        if (when(text)) expect(output, JSON.stringify(text)).toBe(to(home(text)));
      }
      // A difference in the list is real: the copy gives other output on at least one string
      if (difference === undefined) expect(differs).toBe(0);
      else expect(differs).toBeGreaterThan(0);
    });
  }
});
