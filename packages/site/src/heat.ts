/** The scale of the heat maps: the error in px, in bins of approximately 5 times. */

/** The upper ends of the bins of the error, in px. A larger error goes into the last bin. */
export const heatBins: readonly number[] = [0.002, 0.01, 0.05, 0.25, 1, 5];

/** This function gives the bin of an error from 0 to `heatBins.length`, or -1 when the error is NaN. */
export function heatLevel(errorPx: number): number {
  if (Number.isNaN(errorPx)) return -1;
  const size = Math.abs(errorPx);
  const index = heatBins.findIndex((end) => size <= end);
  return index < 0 ? heatBins.length : index;
}

/** This function gives the label of a bin, for the legend. */
export function heatLabel(level: number): string {
  if (level === 0) return `≤ ${heatBins[0]}`;
  if (level >= heatBins.length) return `> ${heatBins[heatBins.length - 1]}`;
  return `≤ ${heatBins[level]}`;
}

/** This function gives a width or an error in px as text, with more digits for a small value. */
export function formatPx(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const size = Math.abs(value);
  if (size === 0) return "0";
  if (size < 0.0001) return "≈ 0";
  if (size < 0.01) return value.toFixed(4);
  if (size < 1) return value.toFixed(3);
  if (size < 100) return value.toFixed(2);
  return value.toFixed(1);
}

/** This function gives an error in px as text with its sign, for example `+0.25`. */
export function formatSigned(value: number): string {
  const text = formatPx(value);
  return value > 0 && !text.startsWith("≈") ? `+${text}` : text;
}
