/**
 * This module has the escapes of plain text for four targets. The targets are HTML content, an HTML attribute, a
 * regular expression and one line of Markdown. Each function changes only the characters that have a meaning in its target.
 */

const HTML: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const ATTRIBUTE: Readonly<Record<string, string>> = { ...HTML, '"': "&quot;", "'": "&#39;" };

/**
 * This function escapes a text for the content of an HTML element. It changes `&`, `<` and `>` to named character
 * references. The quotes stay, because they have no meaning in element content.
 *
 * @param text - The plain text.
 * @returns The text with `&amp;`, `&lt;` and `&gt;` in place of the three characters.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => HTML[char] ?? char);
}

/**
 * This function escapes a text for an HTML attribute value in double quotes or in single quotes. It changes `&`, `<`,
 * `>`, `"` and `'`. The result is also correct in element content.
 *
 * @param text - The plain text.
 * @returns The text with `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&#39;` in place of the five characters.
 */
export function escapeAttribute(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ATTRIBUTE[char] ?? char);
}

/**
 * This function escapes a text for the pattern of a regular expression, outside a character class. It puts a backslash
 * before each syntax character of ECMAScript: `^ $ \ . * + ? ( ) [ ] { } |`. The pattern matches only the text, with
 * the flag `u`, with the flag `v` and with no flag.
 *
 * @param text - The plain text.
 * @returns A pattern for `new RegExp` that matches the text.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * This function escapes a text for one line of CommonMark or GitHub Markdown: a paragraph, a heading or a table cell.
 * It puts a backslash before each ASCII punctuation character, and changes each line end to a space.
 *
 * A backslash before an ASCII punctuation character always gives the character itself. Thus no character of the result
 * starts emphasis, code, a link, HTML, an entity, a list or a table column. Four spaces at the start of a line still
 * make a code block.
 *
 * @param text - The plain text.
 * @returns The text for one line of Markdown.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/\r\n?|\n/g, " ").replace(/[!-/:-@[-`{-~]/g, "\\$&");
}
