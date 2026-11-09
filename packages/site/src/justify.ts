/**
 * The model of the section "Justified lines" (roadmap item T14). It breaks a text with a breaker of
 * `@mark1russell7/typeset/breaking` and the hyphen patterns of a language, and it gives the adjustment ratio of each line.
 * It also reads the records of the language sets. This module has no DOM code, so the tests examine it in Node.
 */
import { adjustmentRatios, breakers, linesOf, paragraphOf, type WidthOf } from "@mark1russell7/typeset/breaking";

/** The languages of the section, in the order of the page. */
export const languageIds = ["en-us", "de", "fr"] as const;

/** The id of a language of the section. */
export type LanguageId = (typeof languageIds)[number];

/** This function gives `true` when a value is the id of a language of the section. */
export function isLanguageId(value: string): value is LanguageId {
  return (languageIds as readonly string[]).includes(value);
}

/** The `hyphenate` hook of `paragraphOf`: the offsets in a word where a break with a hyphen is possible. */
export type Hyphenate = (word: string) => readonly number[];

/**
 * This constant gives the loader of the hook of each language. Each loader is a dynamic import, so the patterns of a
 * language load only when the visitor selects the language. A test makes sure that no module imports them statically.
 */
export const hyphenLoaders: Readonly<Record<LanguageId, () => Promise<Hyphenate>>> = {
  "en-us": async () => (await import("@mark1russell7/typeset/hyphen/en-us")).hyphenate,
  de: async () => (await import("@mark1russell7/typeset/hyphen/de")).hyphenate,
  fr: async () => (await import("@mark1russell7/typeset/hyphen/fr")).hyphenate,
};

/** The names of the languages on the page. */
export const languageNames: Readonly<Record<LanguageId, string>> = { "en-us": "English (US)", de: "German", fr: "French" };

/** The first text of each language. Each text has long words, so a narrow line needs hyphens. */
export const sampleTexts: Readonly<Record<LanguageId, string>> = {
  "en-us":
    "Justified text puts each line flush with both margins. The space between the words stretches or shrinks to fill the measure, and a hyphen inside a long word gives the breaker more places to choose from. Total fit examines the whole paragraph before it chooses any break, so one unfortunate line does not force extraordinary gaps on its neighbors.",
  de: "Die Silbentrennung macht den Blocksatz ruhiger. Ohne Trennung bleiben in schmalen Spalten große Lücken zwischen den Wörtern, besonders bei langen Zusammensetzungen wie Donaudampfschifffahrtsgesellschaft oder Rechtsschutzversicherungsbedingungen. Der Umbruch über den ganzen Absatz wählt jede Zeile so, dass die Abstände gleichmäßig bleiben.",
  fr: "La césure rend la composition justifiée plus régulière. Sans elle, une colonne étroite laisse de grands blancs entre les mots, surtout avec des termes longs comme anticonstitutionnellement ou incompréhensibilité. L'algorithme du paragraphe entier choisit chaque coupure en tenant compte de toutes les lignes, et non de la seule ligne courante.",
};

/** One line of a justified paragraph. */
export interface JustifiedLine {
  readonly text: string;
  /**
   * The adjustment ratio of the line. It is infinite when the line has free space and no glue. The ratio of the last
   * line is not more than 0, because the last line does not stretch.
   */
  readonly ratio: number;
  /** The width to add to each space of the line, in the unit of `widthOf`. It is negative when the spaces shrink. */
  readonly extra: number;
  /** This value is `true` when the line ends at a hyphen. */
  readonly hyphen: boolean;
}

/** The lines of a paragraph, with the measures of the section. */
export interface JustifyView {
  readonly lines: readonly JustifiedLine[];
  /** The measure of the justified edge: the largest absolute ratio of the lines. It is infinite when a line has no glue and free space. */
  readonly worst: number;
  /** The count of the lines that end at a hyphen. */
  readonly hyphens: number;
}

/** The options of `justifyView`. */
export interface JustifyOptions {
  readonly widthOf: WidthOf;
  /** The width of a line, in the unit of `widthOf`. */
  readonly width: number;
  readonly breaker: keyof typeof breakers;
  /** The stretch and the shrink of each space, in the unit of `widthOf`. */
  readonly stretch: number;
  readonly shrink: number;
  /** The hook of the language. When it is absent, a word does not break. */
  readonly hyphenate?: Hyphenate;
}

/** This function breaks a text into lines, and gives the ratio of each line and the measures of the paragraph. */
export function justifyView(text: string, options: JustifyOptions): JustifyView {
  const { widthOf, width, stretch, shrink, hyphenate } = options;
  const paragraph = paragraphOf(text, { widthOf, stretch, shrink, ...(hyphenate === undefined ? {} : { hyphenate }) });
  const lines = linesOf(paragraph, breakers[options.breaker].breaks(paragraph, width));
  const ratios = adjustmentRatios(paragraph, lines, width);
  const view = lines.map((line, i): JustifiedLine => {
    const ratio = ratios[i]!;
    const end = paragraph.items[line.end];
    const extra = Number.isFinite(ratio) ? ratio * (ratio >= 0 ? stretch : shrink) : 0;
    return { text: line.text, ratio, extra, hyphen: end?.type === "penalty" && end.text !== "" };
  });
  return {
    lines: view,
    worst: Math.max(0, ...view.map((line) => Math.abs(line.ratio))),
    hyphens: view.filter((line) => line.hyphen).length,
  };
}

/** This function gives the text of a ratio for the page: two decimals, or a word when the line has no glue. */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "no glue";
  const text = ratio.toFixed(2);
  return text === "-0.00" ? "0.00" : text;
}

// ---------------------------------------------------------------- the records of the language sets

/** The target of the found rate of each language: 95 % of the places of the word list. */
export const wordTarget = 0.95;

/** The classes of a missed place, in the order of the record. */
export const missClasses = ["shift", "silent", "other"] as const;

/** One row of the table of the language sets. */
export interface SetRow {
  readonly language: LanguageId;
  readonly patterns: number;
  readonly exceptions: number;
  /** The name of the word list. */
  readonly list: string;
  /** The share of the places of the word list that the patterns find. */
  readonly found: number;
  /** The share of the places of the patterns that the word list confirms. */
  readonly confirmed: number;
  /** The `gzip` bytes of the entry of the language. */
  readonly gzip: number;
  readonly misses: number;
  /** The count of the missed places of each class. */
  readonly classes: Readonly<Record<(typeof missClasses)[number], number>>;
}

interface LanguageEntry {
  readonly patterns: number;
  readonly exceptions: number;
  readonly list: { readonly name: string };
  readonly found: number;
  readonly confirmed: number;
  readonly weight: { readonly gzip: number };
}

type MissEntry = Readonly<Record<(typeof missClasses)[number] | "misses", number>>;

/** This function gives a field of an object that it does not know, or an error with the path of the field. */
function field(value: unknown, key: string, path: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) throw new Error(`the record has no ${path}.${key}`);
  return (value as Record<string, unknown>)[key];
}

/** This function reads a share of 0 to 1 or a count, and throws an error for each other value. */
function numberAt(value: unknown, key: string, path: string, share: boolean): number {
  const n = field(value, key, path);
  if (typeof n !== "number" || n < 0 || (share ? n > 1 : !Number.isInteger(n))) throw new Error(`the record has the value ${String(n)} at ${path}.${key}`);
  return n;
}

/**
 * This function reads the record of the language sets (`data/hyphen.json` of the conformance package) and the record of
 * the missed places (`data/hyphen-misses.json`). It gives a row for each language of `languageIds`.
 */
export function setRows(record: unknown, misses: unknown): SetRow[] {
  return languageIds.map((language) => {
    const set = field(field(record, "languages", "hyphen"), language, "hyphen.languages") as LanguageEntry;
    const miss = field(field(misses, "languages", "misses"), language, "misses.languages") as MissEntry;
    const at = `hyphen.languages.${language}`;
    const classes = Object.fromEntries(missClasses.map((name) => [name, numberAt(miss, name, `misses.languages.${language}`, false)])) as SetRow["classes"];
    const list = field(field(set, "list", at), "name", `${at}.list`);
    if (typeof list !== "string") throw new Error(`the record has no list name at ${at}`);
    return {
      language,
      patterns: numberAt(set, "patterns", at, false),
      exceptions: numberAt(set, "exceptions", at, false),
      list,
      found: numberAt(set, "found", at, true),
      confirmed: numberAt(set, "confirmed", at, true),
      gzip: numberAt(field(set, "weight", at), "gzip", `${at}.weight`, false),
      misses: numberAt(miss, "misses", `misses.languages.${language}`, false),
      classes,
    };
  });
}
