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
