import { createRandom } from "@typeset/corpus";

/** This function gives the quantile `q` of a list of numbers, with linear interpolation. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new RangeError("the list has no values");
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}

/** This function gives the median of a list of numbers. */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/** This function gives the relative spread of a list: (maximum - minimum) / median. */
export function relativeSpread(values: readonly number[]): number {
  return (Math.max(...values) - Math.min(...values)) / median(values);
}

/** The median of a list of ratios and its bootstrap interval. */
export interface RatioEstimate {
  readonly ratio: number;
  /** The 5 % and the 95 % quantiles of the bootstrap medians. */
  readonly interval: readonly [low: number, high: number];
}

/**
 * This function gives the median of a list of ratios and a 90 % bootstrap interval of that median.
 * The seed makes the interval the same on each run.
 */
export function medianWithInterval(ratios: readonly number[], resamples = 2000, seed = 1): RatioEstimate {
  if (ratios.length === 0) throw new RangeError("the list has no ratios");
  const random = createRandom(seed);
  const medians: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const resample = Array.from({ length: ratios.length }, () => random.pick(ratios));
    medians.push(median(resample));
  }
  return { ratio: median(ratios), interval: [quantile(medians, 0.05), quantile(medians, 0.95)] };
}
