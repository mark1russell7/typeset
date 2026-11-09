import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hyphenPaths, type HyphenRecord } from "./gate.ts";
import { hintGroup, hintGroups, hintedReport, prefixAlternative, withAlternative, type HintFile } from "./hinted.ts";
import { hyphenFiles } from "./sources.ts";
import { hintedEntries, hintOf, pageHint, pronGrafTemplates, spanishSection, unescapeXml } from "./wikitext.ts";
import { parseWords } from "./words.ts";

const root = new URL("../../../../", import.meta.url).pathname.replace(/^\/(\w:)/u, "$1");
const paths = hyphenPaths(root);

describe("the reader of the pages dump", () => {
  it("gives each template pron-graf up to its closing braces, also with templates inside it", () => {
    const text = "a {{pron-graf|ayuda=des-ha-cer|g={{x|y}}}} b {{pron-graf}} c";
    expect(pronGrafTemplates(text)).toEqual(["{{pron-graf|ayuda=des-ha-cer|g={{x|y}}}}", "{{pron-graf}}"]);
  });

  it("gives the first hint ayuda, also ayuda2, and no hint for an empty value", () => {
    expect(hintOf("{{pron-graf|ayuda=sub-ra-yar}}")).toBe("sub-ra-yar");
    expect(hintOf("{{pron-graf|fone=x|ayuda2 = bien-es-tar |ayuda=b}}")).toBe("bien-es-tar");
    expect(hintOf("{{pron-graf|ayuda=}}")).toBeUndefined();
    expect(hintOf("{{pron-graf}}")).toBeUndefined();
  });

  it("keeps only the Spanish section of a page", () => {
    const text = "== {{lengua|en}} ==\n{{pron-graf|ayuda=en}}\n== {{lengua|es}} ==\n{{pron-graf|ayuda=es}}\n== {{lengua|it}} ==\nit";
    expect(spanishSection(text)).toBe("{{pron-graf|ayuda=es}}");
    expect(pageHint(text)).toBe("es");
  });

  it("changes the XML entities and removes the comments", () => {
    expect(unescapeXml("&lt;a&gt; &amp;amp; &quot;b&quot; <!-- c --> d")).toBe('<a> &amp; "b"  d');
  });

  it("gives each Spanish entry of the main namespace with a hint, one time", async () => {
    const dump = [
      "<page>",
      "<title>deshacer</title>",
      "<ns>0</ns>",
      '<text bytes="9" xml:space="preserve">== {{lengua|es}} ==',
      "{{pron-graf|ayuda=des-ha-cer}}</text>",
      "</page>",
      "<page>",
      "<title>Plantilla:x</title>",
      "<ns>10</ns>",
      '<text xml:space="preserve">== {{lengua|es}} == {{pron-graf|ayuda=x}}</text>',
      "</page>",
      "<page>",
      "<title>casa</title>",
      "<ns>0</ns>",
      '<text xml:space="preserve">== {{lengua|es}} ==</text>',
      "<title>vacía</title>",
      "<ns>0</ns>",
      '<text bytes="0" />',
      "</page>",
    ];
    expect(await hintedEntries(dump)).toEqual([{ word: "deshacer", hint: "des-ha-cer" }]);
  });
});

describe("the groups of a hint", () => {
  it("gives the first part of a boundary hint, other, or respelling", () => {
    expect(hintGroup("deshacer", "des-ha-cer")).toBe("des");
    expect(hintGroup("subrayar", "sub-ra-yar")).toBe("sub");
    expect(hintGroup("bienestar", "bien-es-tar")).toBe("other");
    expect(hintGroup("Ávila", "Á.vi.la")).toBe("other");
    expect(hintGroup("mouse", "maus")).toBe("respelling");
  });
});

describe("the second place of a prefix", () => {
  it("gives the place one letter earlier before a vowel or an onset, and no place else", () => {
    expect(prefixAlternative("desamparo", "des")).toBe(2);
    expect(prefixAlternative("subrayar", "sub")).toBe(2);
    expect(prefixAlternative("sublunar", "sub")).toBe(2);
    expect(prefixAlternative("enajenar", "en")).toBe(1);
    expect(prefixAlternative("desrizar", "des")).toBeUndefined();
    expect(prefixAlternative("deshacer", "des")).toBeUndefined();
    expect(prefixAlternative("reabrir", "re")).toBeUndefined();
    expect(prefixAlternative("abrazar", "a")).toBeUndefined();
  });

  it("counts the second place only when the set gives it and not the boundary", () => {
    const [entry] = parseWords("des-am-pa-ro");
    expect(withAlternative(entry!, "des", () => [2, 5])).toEqual({ word: "desamparo", places: [2, 5, 7] });
    expect(withAlternative(entry!, "des", () => [3, 5])).toBe(entry);
    expect(withAlternative(entry!, "des", () => [5])).toBe(entry);
  });
});

describe("hintedReport", () => {
  const hints: HintFile = {
    schema: "typeset-hyphen-hints/1",
    dump: { name: "test", url: "test", sha256: "0" },
    counts: { entries: 3, lemmas: 2, groups: Object.fromEntries(hintGroups.map((group) => [group, { entries: 0, lemmas: 0 }])) as HintFile["counts"]["groups"] },
    seed: "test",
    sample: [["des-ha-cer", "des"], ["bien-es-tar", "other"]],
    inMain: ["deshacer"],
  };
  const hyphenate = (word: string): readonly number[] => (word === "deshacer" ? [3, 5] : word === "bienestar" ? [3, 6] : word === "casa" ? [2] : []);

  it("scores the sample of the part, each group, and the main words without a hint", () => {
    const report = hintedReport(hints, parseWords("des-ha-cer ca-sa"), hyphenate, 2, 2, { runs: 200, seed: "test" });
    expect(report.hinted).toMatchObject({ words: 2, found: 0.75, confirmed: 0.75 });
    expect(report.hinted.groups.des).toMatchObject({ words: 1, found: 1, confirmed: 1 });
    expect(report.hinted.groups.other).toMatchObject({ words: 1, found: 0.5, confirmed: 0.5 });
    expect(report.hinted.groups.sub.words).toBe(0);
    expect(report.module).toMatchObject({ words: 1, found: 1, confirmed: 1 });
    expect(report.hinted.intervals.found.low).toBeLessThanOrEqual(0.75);
    expect(report.hinted.intervals.found.high).toBeGreaterThanOrEqual(0.75);
  });
});

describe("the hint part of es", () => {
  const record = JSON.parse(readFileSync(paths.record, "utf8")) as HyphenRecord;
  const file = hyphenFiles.find((entry) => entry.language === "es")!;
  const hints = JSON.parse(readFileSync(paths.hints("es"), "utf8")) as HintFile;

  it("comes from the pinned dump, with one form for each lemma of the part", () => {
    expect(hints.dump.sha256).toBe(file.hinted!.dump.sha256);
    expect(hints.sample).toHaveLength(Math.min(10000, hints.counts.lemmas));
    expect(new Set(hints.sample.map(([form]) => form)).size).toBe(hints.sample.length);
    const sum = hintGroups.reduce((total, group) => total + hints.counts.groups[group].entries, 0);
    expect(sum).toBe(hints.counts.entries);
  });

  it("is in the record, with each group and the module part, at or above its floors", () => {
    const parts = record.languages["es"]!.parts!;
    expect(parts.lemmas).toBe(hints.counts.lemmas);
    expect(Object.keys(parts.hinted.groups)).toEqual([...hintGroups]);
    expect(parts.hinted.found).toBeGreaterThanOrEqual(file.hinted!.floor.found);
    expect(parts.hinted.confirmed).toBeGreaterThanOrEqual(file.hinted!.floor.confirmed);
    expect(parts.module.words + hints.inMain.length).toBe(10000);
  });
});
