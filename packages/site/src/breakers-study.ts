/**
 * The study of the line breakers (roadmap item T15). It breaks seeded texts of the corpus with each breaker of
 * `@mark1russell7/typeset/breaking`. It gives the results as the data of a record of the format `response-records/1`.
 * The study needs no font file and measures no time, so its result is the same on each computer.
 */
import { scriptIds, generateSample, type LengthClass, type ScriptId } from "@typeset/corpus";
import { breakers, linesOf, paragraphOf, raggedness, worstRatio, type Paragraph } from "@mark1russell7/typeset/breaking";
import { complexBreaks, lineBreaks } from "@mark1russell7/typeset/segmentation";
import { RESPONSE_RECORDS_SCHEMA, fitResponse, type ResponseData, type ResponseFitOptions, type ResponsePoint, type ResponseRecord } from "@mark1russell7/rigor-statistics";

/** The ids of the breakers of the study, in the order of `breakers`. */
export type BreakerId = keyof typeof breakers;

/** The breakers, the texts and the widths of the study. */
export const study = {
  seed: 1,
  breakers: Object.keys(breakers) as readonly BreakerId[],
  scripts: scriptIds,
  classes: ["line", "paragraph", "page"] as readonly LengthClass[],
  /** The number of texts of each script and length class. */
  perCell: 3,
  /** The widths of the lines, in the units of `widthOf`. */
  widths: [120, 240, 480, 960] as readonly number[],
  /** The stretch and the shrink of each glue: a half and a third of the width of a space. */
  glue: { stretch: 4, shrink: 8 / 3 },
} as const;

/**
 * The options of the fit of the record. Each measure has a log scale. A line wider than its width gives a raggedness up to
 * 30, and the median is 0.003. On a linear scale, the fit of the raggedness had a larger error than the mean. The floor
 * 0.0001 is the value of each 0: one line, or lines with no free space.
 */
export const fitOptions: ResponseFitOptions = { folds: 5, seed: 1, log: ["lines", "raggedness", "worstRatio"], logFloor: 1e-4 };

/** This function gives the width of a text in the study: 8 units for each code point, as in the bench of the breakers. */
export function widthOf(text: string): number {
  return 8 * [...text].length;
}

/** This function gives the break places inside a word by the rules of UAX #14, with the word boundaries of `Intl.Segmenter` in Thai. */
export function breakPlaces(word: string): readonly number[] {
  return lineBreaks(word, { complex: complexBreaks }).map((place) => place.offset);
}

/** This function gives the paragraph of a text of the study: justified glue, and the break places of `breakPlaces`. */
export function studyParagraph(text: string): Paragraph {
  return paragraphOf(text, { widthOf, breaks: breakPlaces, ...study.glue });
}

/** The results of one breaker on one text at one width. */
export interface BreakResult {
  readonly lines: number;
  readonly raggedness: number;
  /** The worst adjustment ratio. It is `null` when a line has no glue, so the line cannot stretch or shrink. */
  readonly worstRatio: number | null;
  /** The text of each line, for the comparison of two breakers. */
  readonly texts: readonly string[];
}

/** This function breaks a paragraph with one breaker at one width, and gives the measures. */
export function breakResult(paragraph: Paragraph, breaker: BreakerId, width: number): BreakResult {
  const lines = linesOf(paragraph, breakers[breaker].breaks(paragraph, width));
  const ratio = worstRatio(paragraph, lines, width);
  return { lines: lines.length, raggedness: raggedness(lines, width), worstRatio: Number.isFinite(ratio) ? ratio : null, texts: lines.map((line) => line.text) };
}

/** One text of the study. */
export interface StudyText {
  /** The id of the text: the script, the length class and the index. It is the group of its points. */
  readonly id: string;
  readonly script: ScriptId;
  readonly lengthClass: LengthClass;
  readonly text: string;
}

/** This function gives the texts of the study, in a fixed order. */
export function studyTexts(): StudyText[] {
  const texts: StudyText[] = [];
  for (const script of study.scripts) {
    for (const lengthClass of study.classes) {
      for (let index = 0; index < study.perCell; index++) {
        const { text } = generateSample(study.seed, script, lengthClass, index);
        texts.push({ id: `${script}/${lengthClass}/${index}`, script, lengthClass, text });
      }
    }
  }
  return texts;
}

/** The smallest and the largest length of a text of the study, in code points: the range of the classes `line` to `page`. */
const lengthRange: readonly [number, number] = [20, 6000];

/** This function gives the data of the record: one point for each text, width and breaker. */
export function studyData(texts: readonly StudyText[] = studyTexts()): ResponseData {
  const points: ResponsePoint[] = [];
  for (const text of texts) {
    const paragraph = studyParagraph(text.text);
    const length = [...text.text].length;
    for (const width of study.widths) {
      for (const breaker of study.breakers) {
        const result = breakResult(paragraph, breaker, width);
        const point: ResponsePoint = {
          id: `${text.id}/${width}/${breaker}`,
          group: text.id,
          values: { breaker, script: text.script, length, width },
          measures: { lines: result.lines, raggedness: result.raggedness, worstRatio: result.worstRatio },
          ...(result.worstRatio === null ? { absent: { worstRatio: "no-glue" } } : {}),
        };
        points.push(point);
      }
    }
  }
  return {
    schema: RESPONSE_RECORDS_SCHEMA,
    name: "typeset line breakers",
    dimensions: [
      { id: "breaker", label: "Breaker", unit: "", kind: "categorical", levels: [...study.breakers] },
      { id: "script", label: "Script", unit: "", kind: "categorical", levels: [...study.scripts] },
      { id: "length", label: "Text length", unit: "code points", kind: "continuous", range: lengthRange, log: true },
      { id: "width", label: "Line width", unit: "units", kind: "continuous", range: [study.widths[0]!, study.widths.at(-1)!], log: true },
    ],
    measures: [
      { id: "lines", label: "Lines", unit: "", direction: "lower" },
      { id: "raggedness", label: "Raggedness", unit: "", direction: "lower" },
      { id: "worstRatio", label: "Worst adjustment ratio", unit: "", direction: "lower" },
    ],
    reasons: [{ id: "no-glue", label: "A line has no glue, so it cannot stretch or shrink" }],
    points,
  };
}

/** This function gives the record of the study: the data and the fit of `fitOptions`. */
export function studyRecord(data: ResponseData = studyData()): ResponseRecord {
  return fitResponse(data, fitOptions);
}

/** This function gives the JSON text of a record, with one line for each point, so a diff shows the points that changed. */
export function recordText(record: ResponseRecord): string {
  const { points, ...head } = record;
  return `${JSON.stringify(head).slice(0, -1)},"points":[\n${points.map((point) => JSON.stringify(point)).join(",\n")}\n]}\n`;
}
