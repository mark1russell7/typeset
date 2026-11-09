/**
 * The reader of a pages dump of the Spanish Wiktionary. For a Spanish entry, the module `generar-pron/es` makes the syllables from
 * the title, or from the hint `ayuda` of the template `pron-graf` when an editor types one. This reader finds the entries with a hint.
 */

/** A Spanish entry with a hint: the title and the first hint of its template `pron-graf`. */
export interface HintedEntry {
  readonly word: string;
  readonly hint: string;
}

/** This function gives the text of each template `pron-graf` in a text, up to its closing braces. */
export function pronGrafTemplates(text: string): string[] {
  const templates: string[] = [];
  let start = text.indexOf("{{pron-graf");
  while (start >= 0) {
    let depth = 0;
    let end = start;
    for (; end < text.length - 1; end += 1) {
      const pair = text.slice(end, end + 2);
      if (pair === "{{") {
        depth += 1;
        end += 1;
      } else if (pair === "}}") {
        depth -= 1;
        end += 1;
        if (depth === 0) break;
      }
    }
    templates.push(text.slice(start, end + 1));
    start = text.indexOf("{{pron-graf", end + 1);
  }
  return templates;
}

/** This function gives the first hint `ayuda` of a template, or `undefined`. The parameters `ayuda2` to `ayuda9` also count. */
export function hintOf(template: string): string | undefined {
  const match = /\|\s*ayuda\d?\s*=\s*([^|}]*)/u.exec(template);
  const hint = match?.[1]?.trim();
  return hint === undefined || hint === "" ? undefined : hint;
}

/** This function gives the text of the Spanish section of the text of a page. A section starts with a heading `{{lengua|es}}`. */
export function spanishSection(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let inside = false;
  for (const line of lines) {
    const heading = /^==\s*\{\{lengua\|([^}|]+)/u.exec(line);
    if (heading !== null) inside = heading[1]!.trim() === "es";
    else if (inside) kept.push(line);
  }
  return kept.join("\n");
}

/** This function changes the XML entities of a dump to their characters, and removes the HTML comments. */
export function unescapeXml(text: string): string {
  const plain = text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#039;", "'").replaceAll("&amp;", "&");
  return plain.replace(/<!--[\s\S]*?-->/gu, "");
}

/** This function gives the first hint of the Spanish section of the text of a page, or `undefined`. */
export function pageHint(text: string): string | undefined {
  for (const template of pronGrafTemplates(spanishSection(unescapeXml(text)))) {
    const hint = hintOf(template);
    if (hint !== undefined) return hint;
  }
  return undefined;
}

/**
 * This function reads the lines of a pages dump and gives each Spanish entry of the main namespace that has a hint. It gives
 * each title one time, with the first hint of its Spanish section.
 */
export async function hintedEntries(lines: AsyncIterable<string> | Iterable<string>): Promise<HintedEntry[]> {
  const found = new Map<string, string>();
  let title = "";
  let namespace = "";
  let text: string[] | undefined;
  const keep = (page: readonly string[]): void => {
    if (namespace !== "0" || found.has(title)) return;
    const hint = pageHint(page.join("\n"));
    if (hint !== undefined) found.set(title, hint);
  };
  for await (const line of lines) {
    if (text !== undefined) {
      const end = line.indexOf("</text>");
      text.push(end < 0 ? line : line.slice(0, end));
      if (end < 0) continue;
      keep(text);
      text = undefined;
      continue;
    }
    const titleMatch = /<title>(.*)<\/title>/u.exec(line);
    if (titleMatch !== null) title = unescapeXml(titleMatch[1]!);
    const namespaceMatch = /<ns>(\d+)<\/ns>/u.exec(line);
    if (namespaceMatch !== null) namespace = namespaceMatch[1]!;
    const open = line.indexOf("<text");
    if (open < 0) continue;
    const body = line.indexOf(">", open);
    if (line.slice(open, body + 1).endsWith("/>")) continue;
    const rest = line.slice(body + 1);
    const close = rest.indexOf("</text>");
    text = [close < 0 ? rest : rest.slice(0, close)];
    if (close < 0) continue;
    keep(text);
    text = undefined;
  }
  return [...found].map(([word, hint]) => ({ word, hint }));
}
