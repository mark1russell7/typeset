/** The facts of the record of the breakers that the site shows above the explorer. This module does not read the corpus. */
import { heldOutError, type ResponseRecord } from "@mark1russell7/rigor-statistics";

/** The held-out error of the fit of one measure, on the log scale of the model. */
export interface BreakerFit {
  readonly id: string;
  readonly label: string;
  /** The mean absolute error of the fit, as a base-10 logarithm. */
  readonly mae: number;
  /** The mean absolute error of the mean of the training points. */
  readonly baselineMae: number;
  /** The number of points with a value. */
  readonly n: number;
}

/** The facts of a record of the breakers. */
export interface BreakerFacts {
  readonly points: number;
  /** The number of texts: the groups of the points. */
  readonly texts: number;
  readonly folds: number;
  readonly fits: readonly BreakerFit[];
}

/** This function gives the facts of a parsed record. */
export function breakerFacts(record: ResponseRecord): BreakerFacts {
  return {
    points: record.points.length,
    texts: new Set(record.points.map((point) => point.group ?? point.id)).size,
    folds: record.folds.length,
    fits: record.measures.map((measure) => {
      const error = heldOutError(record, measure.id);
      return { id: measure.id, label: measure.label, mae: error.mae, baselineMae: error.baselineMae, n: error.n };
    }),
  };
}
