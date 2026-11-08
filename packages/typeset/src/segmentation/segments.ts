/**
 * The segments of UAX #29, from `Intl.Segmenter`. The results follow the Unicode version of the runtime. The locale is the root
 * locale, so the language of the host has no effect.
 */
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter("und", { granularity: "word" });

/** This function gives the grapheme clusters of a text, in their order. */
export function graphemes(text: string): readonly string[] {
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
}

/** This function gives the offset in UTF-16 units of each word boundary of a text, with the end of the text and without its start. */
export function wordBreaks(text: string): readonly number[] {
  const offsets = Array.from(wordSegmenter.segment(text), (part) => part.index).slice(1);
  if (text.length > 0) offsets.push(text.length);
  return offsets;
}

/**
 * This function gives the word boundaries of each word of a list. Each entry equals `wordBreaks` of its word. The function
 * segments the words in one pass, joined by line feeds, because UAX #29 breaks before and after each line feed (WB3a, WB3b).
 * A word that ends in a carriage return gets its own pass, because a carriage return and a line feed stay together (WB3).
 */
export function wordBreaksOf(words: readonly string[]): readonly (readonly number[])[] {
  const result: (readonly number[])[] = [];
  const lists: number[][] = [];
  const starts: number[] = [];
  const parts: string[] = [];
  let offset = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    if (word.endsWith("\r")) {
      result[index] = wordBreaks(word);
      continue;
    }
    const own: number[] = [];
    result[index] = own;
    lists.push(own);
    starts.push(offset);
    parts.push(word);
    offset += word.length + 1;
  }
  const text = parts.join("\n");
  let at = 0;
  // The boundaries come in order, so one sweep gives each boundary to its word. The boundary at the end of a word is the
  // start of the next line feed. The boundary after that line feed is the start of the next word, so no word gets it.
  for (const part of wordSegmenter.segment(text)) {
    const boundary = part.index;
    while (at < lists.length && boundary > starts[at]! + parts[at]!.length) at++;
    if (at < lists.length && boundary > starts[at]!) lists[at]!.push(boundary - starts[at]!);
  }
  const last = lists.length - 1;
  if (last >= 0 && parts[last]!.length > 0) lists[last]!.push(parts[last]!.length);
  return result;
}

/**
 * This function is a hook `complex` for `lineBreaks`. It gives the word boundaries inside a run of class SA, from
 * `Intl.Segmenter` of the runtime. The runtime has the dictionary, so the entry ships no dictionary. In a browser, the places
 * follow the dictionary of that browser.
 */
export function complexBreaks(run: string): readonly number[] {
  return wordBreaks(run).slice(0, -1);
}
