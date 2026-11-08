/**
 * The report of the breakers on the corpus. It gives the parity of greedy with `layoutText` of `@mark1russell7/layout-contract/text`,
 * the raggedness of total fit and the spread of balanced. It uses a width function of the code points, so it needs no font
 * file. Start it with `node src/breaking/report.ts`. The output is deterministic.
 */
import { generateSample, type LengthClass, type ScriptId } from "@typeset/corpus";
import { createMeasurer, layoutText, TEXT_UNITS } from "@mark1russell7/layout-contract/text";
import { balanced, greedy, knuthPlass, linesOf, paragraphOf, raggedness, spread, worstRatio, type Breaker, type Paragraph } from "../breaking.ts";

/** The scripts, the length classes and the wrap widths of the report, as the prediction `typeset-t3-breakers` gives them. */
export const reportScripts: readonly ScriptId[] = ["latin", "latin-extended", "greek", "cyrillic"];
export const reportClasses: readonly LengthClass[] = ["paragraph", "page"];
export const reportWidths: readonly number[] = [120, 240, 480];

/** This function gives a width in px from 4 px to 12 px for each code point, from a hash of the code point. */
export function codePointPx(text: string): number {
  let px = 0;
  for (const character of text) px += 4 + (Math.imul(character.codePointAt(0)!, 2654435761) >>> 0) % 801 / 100;
  return px;
}

/** The result of the report. */
export interface Report {
  readonly cases: number;
  readonly parity: number;
  readonly totalFitCases: number;
  readonly totalFitNotWorse: number;
  readonly totalFitMedianReduction: number;
  readonly balancedSameCount: number;
  readonly balancedNotWider: number;
}

/** This function makes the report for the corpus seed `seed` with `perCell` samples for each script and length class. */
export function report(seed = 1, perCell = 20): Report {
  const measurer = createMeasurer(codePointPx);
  const font = "16px report";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  // The width of phase A: the sum of the advances of the word segments, in units
  const widthOf = (text: string): number => {
    let units = 0;
    for (const { segment } of segmenter.segment(text)) units += measurer.advance(segment, font);
    return units;
  };
  const linesFor = (paragraph: Paragraph, breaker: Breaker, limit: number) => linesOf(paragraph, breaker.breaks(paragraph, limit));
  let cases = 0;
  let parity = 0;
  let totalFitCases = 0;
  let totalFitNotWorse = 0;
  const reductions: number[] = [];
  let balancedSameCount = 0;
  let balancedNotWider = 0;
  for (const script of reportScripts) {
    for (const lengthClass of reportClasses) {
      for (let index = 0; index < perCell; index++) {
        const { text } = generateSample(seed, script, lengthClass, index);
        const paragraph = paragraphOf(text, { widthOf });
        for (const wrapWidth of reportWidths) {
          cases++;
          const limit = Math.round(wrapWidth * TEXT_UNITS);
          const greedyLines = linesFor(paragraph, greedy, limit);
          const phaseA = layoutText(text, { font, measurer, lineHeight: 20, wrapWidth });
          if (JSON.stringify(greedyLines.map((line) => line.text)) === JSON.stringify(phaseA.lines)) parity++;
          if (greedyLines.length >= 3) {
            totalFitCases++;
            const before = raggedness(greedyLines, limit);
            const after = raggedness(linesFor(paragraph, knuthPlass, limit), limit);
            if (after <= before) totalFitNotWorse++;
            reductions.push(before === 0 ? 0 : (before - after) / before);
          }
          const balancedLines = linesFor(paragraph, balanced, limit);
          if (balancedLines.length === greedyLines.length) balancedSameCount++;
          if (spread(balancedLines) <= spread(greedyLines)) balancedNotWider++;
        }
      }
    }
  }
  reductions.sort((a, b) => a - b);
  const middle = reductions.length / 2;
  const median = reductions.length === 0 ? 0 : reductions.length % 2 === 1 ? reductions[Math.floor(middle)]! : (reductions[middle - 1]! + reductions[middle]!) / 2;
  return { cases, parity, totalFitCases, totalFitNotWorse, totalFitMedianReduction: median, balancedSameCount, balancedNotWider };
}

/** The seed, the paragraphs of each script and the widths of the report of the justified edge. */
export const justifySeed = 14;
export const justifyPerScript = 60;
export const justifyWidths: readonly number[] = [300, 480, 600];

/** The result of the report of the justified edge. Each mean is the mean of `worstRatio` over the cases. */
export interface JustifyReport {
  readonly paragraphs: number;
  readonly cases: number;
  readonly totalFit: number;
  /** The breaks of total fit with no stretch and no shrink, measured with the stretch and the shrink. */
  readonly raggedTotalFit: number;
  readonly greedy: number;
  /** The cases where the worst line of total fit is within the stretch and the shrink of its glue. */
  readonly totalFitWithin: number;
  readonly greedyWithin: number;
}

/**
 * This function makes the report of the justified edge. Each glue has the stretch of a half of a space and the shrink of a
 * third of a space, as in TeX. The cases do not use hyphens, so the result shows only the glue.
 */
export function justifyReport(seed = justifySeed, perScript = justifyPerScript): JustifyReport {
  const space = codePointPx(" ");
  const sums = { totalFit: 0, raggedTotalFit: 0, greedy: 0, totalFitWithin: 0, greedyWithin: 0 };
  let cases = 0;
  for (const script of reportScripts) {
    for (let index = 0; index < perScript; index++) {
      const { text } = generateSample(seed, script, "paragraph", index);
      const ragged = paragraphOf(text, { widthOf: codePointPx });
      const paragraph = paragraphOf(text, { widthOf: codePointPx, stretch: space / 2, shrink: space / 3 });
      for (const width of justifyWidths) {
        cases++;
        const worst = (breaks: readonly number[]): number => worstRatio(paragraph, linesOf(paragraph, breaks), width);
        const fit = worst(knuthPlass.breaks(paragraph, width));
        const first = worst(greedy.breaks(paragraph, width));
        sums.totalFit += fit;
        sums.raggedTotalFit += worst(knuthPlass.breaks(ragged, width));
        sums.greedy += first;
        if (fit <= 1) sums.totalFitWithin++;
        if (first <= 1) sums.greedyWithin++;
      }
    }
  }
  return { paragraphs: reportScripts.length * perScript, cases, totalFit: sums.totalFit / cases, raggedTotalFit: sums.raggedTotalFit / cases, greedy: sums.greedy / cases, totalFitWithin: sums.totalFitWithin, greedyWithin: sums.greedyWithin };
}

if (import.meta.main) {
  console.log(JSON.stringify(justifyReport(), null, 2));
  const result = report();
  console.log(JSON.stringify(result, null, 2));
  console.log(`parity ${(result.parity / result.cases).toFixed(4)}, total fit not worse ${(result.totalFitNotWorse / result.totalFitCases).toFixed(4)}, median reduction ${result.totalFitMedianReduction.toFixed(4)}, balanced same count ${(result.balancedSameCount / result.cases).toFixed(4)}, balanced not wider ${(result.balancedNotWider / result.cases).toFixed(4)}`);
}
