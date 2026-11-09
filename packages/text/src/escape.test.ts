import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { PARTS, strings } from "../test/strings.ts";
import { escapeAttribute, escapeHtml, escapeMarkdown, escapeRegExp, escapeWorkflowData, escapeWorkflowProperty } from "./index.ts";

const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const decode = (html: string): string => html.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => NAMED[name] ?? "");

describe("escapeHtml", () => {
  it("escapes the three characters of element content, and no other", () => {
    expect(escapeHtml(`a & b < c > d "e" 'f'`)).toBe(`a &amp; b &lt; c &gt; d "e" 'f'`);
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    expect(escapeHtml("")).toBe("");
  });

  it("gives text with no < and no bare &, that decodes to the input, on 2000 seeded strings", () => {
    for (const text of strings("text/html", 2000)) {
      const html = escapeHtml(text);
      expect(html).not.toMatch(/[<>]|&(?!amp;|lt;|gt;)/);
      expect(decode(html)).toBe(text);
    }
  });
});

describe("escapeAttribute", () => {
  it("escapes the five characters", () => {
    expect(escapeAttribute(`a & b < c > d "e" 'f'`)).toBe("a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;");
  });

  it("gives text with no quote, no < and no bare &, that decodes to the input, on 2000 seeded strings", () => {
    for (const text of strings("text/attribute", 2000)) {
      const value = escapeAttribute(text);
      expect(value).not.toMatch(/["'<>]|&(?!amp;|lt;|gt;|quot;|#39;)/);
      expect(decode(value)).toBe(text);
    }
  });
});

describe("escapeRegExp", () => {
  it("escapes each syntax character, and no other", () => {
    expect(escapeRegExp("^$\\.*+?()[]{}|")).toBe("\\^\\$\\\\\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|");
    expect(escapeRegExp("a-b/c,d=e")).toBe("a-b/c,d=e");
  });

  it("gives a pattern that compiles and matches only the string, with the flag u, the flag v and no flag, on 2000 seeded strings", () => {
    // Each string gets each syntax character, at a seeded place
    const r = random("text/regexp/places");
    const syntax = [..."^$\\.*+?()[]{}|"];
    expect(syntax).toHaveLength(14);
    const texts = strings("text/regexp", 2000).map((base) => syntax.reduce((text, char) => { const at = r.int(0, text.length); return text.slice(0, at) + char + text.slice(at); }, base));
    for (const text of texts) {
      for (const char of syntax) expect(text).toContain(char);
      for (const flags of ["u", "v", ""]) {
        const pattern = new RegExp(`^${escapeRegExp(text)}$`, flags);
        expect(pattern.test(text), `${JSON.stringify(text)} /${flags}`).toBe(true);
        expect(pattern.test(`${text}x`)).toBe(false);
      }
    }
  });
});

describe("escapeMarkdown", () => {
  it("puts a backslash before each ASCII punctuation character", () => {
    const punctuation = PARTS.filter((part) => /^[!-/:-@[-`{-~]$/.test(part)).join("");
    expect(punctuation).toHaveLength(32);
    expect(escapeMarkdown(punctuation)).toBe([...punctuation].map((char) => `\\${char}`).join(""));
    expect(escapeMarkdown("a b é 日本 😀 09")).toBe("a b é 日本 😀 09");
  });

  it("changes each line end to a space", () => {
    expect(escapeMarkdown("a\nb\r\nc\rd")).toBe("a b c d");
  });

  it("gives one line, where each backslash starts an escape of punctuation, on 2000 seeded strings", () => {
    for (const text of strings("text/markdown", 2000)) {
      const line = escapeMarkdown(text);
      expect(line).not.toMatch(/[\r\n]/);
      // Remove each escape pair. Then no punctuation stays.
      expect(line.replace(/\\[!-/:-@[-`{-~]/g, "")).not.toMatch(/[!-/:-@[-`{-~]/);
    }
  });
});

describe("escapeWorkflowData and escapeWorkflowProperty", () => {
  it("escape the characters of a workflow command", () => {
    expect(escapeWorkflowData("50% done\r\nnext: a, b")).toBe("50%25 done%0D%0Anext: a, b");
    expect(escapeWorkflowProperty("50% done\r\nnext: a, b")).toBe("50%25 done%0D%0Anext%3A a%2C b");
  });

  it("give text that decodes to the input, and a property with no : , CR or LF, on 2000 seeded strings", () => {
    for (const text of strings("text/workflow", 2000)) {
      const data = escapeWorkflowData(text);
      const property = escapeWorkflowProperty(text);
      expect(decodeURIComponent(data), JSON.stringify(text)).toBe(text);
      expect(decodeURIComponent(property), JSON.stringify(text)).toBe(text);
      expect(data).not.toMatch(/[\r\n]/);
      expect(property).not.toMatch(/[:,\r\n]/);
    }
  });
});
