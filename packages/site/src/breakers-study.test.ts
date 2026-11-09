import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { heldOutError, parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { breakerFacts } from "./breakers-view.ts";
import { breakPlaces, breakResult, recordText, study, studyData, studyParagraph, studyRecord, studyTexts } from "./breakers-study.ts";

const file = join(import.meta.dirname, "..", "data", "breakers-response.json");
const committed = readFileSync(file, "utf8");

describe("the study of the breakers", () => {
  it("gives the break places of UAX #14 inside a word, with the words of Thai", () => {
    expect(breakPlaces("漢字かな")).toEqual([1, 2, 3, 4]);
    expect(breakPlaces("word")).toEqual([4]);
    expect(breakPlaces("ภาษาไทย")).toEqual([4, 7]);
  });

  it("gives null for the worst ratio of a line with no glue and free space", () => {
    const paragraph = studyParagraph("漢字漢字漢字");
    expect(breakResult(paragraph, "greedy", 20)).toMatchObject({ lines: 3, worstRatio: null });
    expect(breakResult(paragraph, "greedy", 48)).toMatchObject({ lines: 1, worstRatio: 0 });
  });

  it("has one group for each text, with a point for each width and breaker", () => {
    const data = studyData();
    const texts = studyTexts();
    expect(texts).toHaveLength(study.scripts.length * study.classes.length * study.perCell);
    expect(data.points).toHaveLength(texts.length * study.widths.length * study.breakers.length);
    const groups = new Map<string, number>();
    for (const point of data.points) groups.set(point.group!, (groups.get(point.group!) ?? 0) + 1);
    expect([...groups.keys()]).toEqual(texts.map((text) => text.id));
    expect(new Set(groups.values())).toEqual(new Set([study.widths.length * study.breakers.length]));
  });

  it("keeps the line count of greedy with balanced, at each text and width", () => {
    const { points } = studyData();
    for (let i = 0; i < points.length; i += study.breakers.length) {
      const [greedy, , balanced] = points.slice(i, i + study.breakers.length);
      expect(balanced!.measures["lines"]).toBe(greedy!.measures["lines"]);
    }
  });
});

describe("the record data/breakers-response.json", () => {
  it("is current: a new fit of a new run gives the same bytes", { timeout: 60_000 }, () => {
    expect(committed).toBe(recordText(studyRecord()));
  });

  it("is a record of response-records/1, and each fit has a smaller held-out error than the mean", () => {
    const parsed = parseResponseRecord(JSON.parse(committed));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.faults));
    expect(parsed.record.dimensions.map((d) => d.id)).toEqual(["breaker", "script", "length", "width"]);
    expect(parsed.record.measures.map((m) => m.id)).toEqual(["lines", "raggedness", "worstRatio"]);
    for (const measure of parsed.record.measures) {
      const error = heldOutError(parsed.record, measure.id);
      expect(error.mae, measure.id).toBeLessThan(error.baselineMae);
    }
    const facts = breakerFacts(parsed.record);
    expect([facts.points, facts.texts, facts.folds]).toEqual([1296, 108, 5]);
    expect(facts.fits.map((fit) => [fit.id, fit.n])).toEqual([["lines", 1296], ["raggedness", 1296], ["worstRatio", 897]]);
  });
});
