export { classOf, offsetsOf, unlistedFailures, type Reasons } from "./check.ts";
export { parseTests, scoreTests, type BreakTest, type Failure, type Score } from "./parse.ts";
export { gzipTolerance, hyphenGate, hyphenPaths, makeSet, recordDifferences, sampleHash, weighEntry, type EntryWeight, type HyphenRecord, type LanguageRecord } from "./hyphen/gate.ts";
export { parsePatterns, setSource, type PatternData } from "./hyphen/patterns.ts";
export { hyphenFiles, hyphenUrl, texHyphenCommit, type HyphenFile, type WordList } from "./hyphen/sources.ts";
export { parseWords, scoreWords, share, type ListedWord, type WordScore } from "./hyphen/words.ts";
export { fileUrl, propertyFiles, testFiles, unicodeVersion, type UnicodeFile } from "./sources.ts";
export { makeTable, resolveClass, tableSource, type LineTable } from "./tables.ts";
