import type { Reader } from "./binary.ts";
import { axisScalar } from "./variations.ts";

/** The composite flags of `glyf` that change the length of a component record. */
const ARG_1_AND_2_ARE_WORDS = 0x1;
const WE_HAVE_A_SCALE = 0x8;
const MORE_COMPONENTS = 0x20;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x40;
const WE_HAVE_A_TWO_BY_TWO = 0x80;
/** The composite flag that gives the metrics of the component to the composite glyph. */
const USE_MY_METRICS = 0x200;

/** The points of the glyphs of a `glyf` table. */
export interface GlyphPoints {
  /** The count of points of each glyph, as `gvar` counts them. The four phantom points are not in the count. */
  readonly counts: Uint32Array;
  /** The component with the flag USE_MY_METRICS of each composite glyph, or -1. */
  readonly metrics: Int32Array;
}

/**
 * This function reads the composite records that start at `at`. It gives their length in bytes and the count of
 * components. It also gives the first component with the flag USE_MY_METRICS, or -1.
 */
function components(glyph: Reader, at: number): { count: number; length: number; metrics: number } {
  let count = 0;
  let offset = at;
  let metrics = -1;
  for (;;) {
    const flags = glyph.u16(offset);
    if ((flags & USE_MY_METRICS) !== 0 && metrics < 0) metrics = glyph.u16(offset + 2);
    offset += 4 + ((flags & ARG_1_AND_2_ARE_WORDS) !== 0 ? 4 : 2);
    if ((flags & WE_HAVE_A_SCALE) !== 0) offset += 2;
    else if ((flags & WE_HAVE_AN_X_AND_Y_SCALE) !== 0) offset += 4;
    else if ((flags & WE_HAVE_A_TWO_BY_TWO) !== 0) offset += 8;
    count++;
    if ((flags & MORE_COMPONENTS) === 0) return { count, length: offset - at, metrics };
  }
}

/**
 * This function gives the points of each glyph. A glyph of contours has the points of its contours. A composite glyph
 * has one point for each component.
 */
export function readPointCounts(glyf: Reader, loca: Reader, indexToLocFormat: number, numGlyphs: number): GlyphPoints {
  const counts = new Uint32Array(numGlyphs);
  const metrics = new Int32Array(numGlyphs).fill(-1);
  const offsetOf = (glyph: number) => (indexToLocFormat === 0 ? loca.u16(glyph * 2) * 2 : loca.u32(glyph * 4));
  for (let glyph = 0; glyph < numGlyphs; glyph++) {
    const start = offsetOf(glyph);
    if (offsetOf(glyph + 1) <= start) continue;
    const contours = glyf.i16(start);
    if (contours > 0) counts[glyph] = glyf.u16(start + 10 + (contours - 1) * 2) + 1;
    else if (contours < 0) {
      const found = components(glyf, start + 10);
      counts[glyph] = found.count;
      metrics[glyph] = found.metrics;
    }
  }
  return { counts, metrics };
}

/** This function reads a 255UInt16 of WOFF2. It gives the value and the next offset. */
function read255(stream: Reader, at: number): [number, number] {
  const code = stream.u8(at);
  if (code === 253) return [stream.u16(at + 1), at + 3];
  if (code === 254) return [stream.u8(at + 1) + 506, at + 2];
  if (code === 255) return [stream.u8(at + 1) + 253, at + 2];
  return [code, at + 1];
}

/** This function gives the points of each glyph from the transformed `glyf` table of WOFF2. */
export function readTransformedPointCounts(glyf: Reader, numGlyphs: number): GlyphPoints {
  const counts = new Uint32Array(numGlyphs);
  const metrics = new Int32Array(numGlyphs).fill(-1);
  const sizes = Array.from({ length: 7 }, (_, i) => glyf.u32(8 + i * 4));
  const contourStream = glyf.part(36, sizes[0]);
  const pointStream = glyf.part(36 + sizes[0]!, sizes[1]);
  // The composite stream comes after the streams of the contours, the points, the flags and the glyphs
  const compositeStream = glyf.part(36 + sizes[0]! + sizes[1]! + sizes[2]! + sizes[3]!, sizes[4]);
  let pointAt = 0;
  let compositeAt = 0;
  const glyphs = Math.min(numGlyphs, glyf.u16(4));
  for (let glyph = 0; glyph < glyphs; glyph++) {
    const contours = contourStream.i16(glyph * 2);
    if (contours > 0) {
      let total = 0;
      for (let c = 0; c < contours; c++) {
        const [points, next] = read255(pointStream, pointAt);
        total += points;
        pointAt = next;
      }
      counts[glyph] = total;
    } else if (contours < 0) {
      const found = components(compositeStream, compositeAt);
      counts[glyph] = found.count;
      metrics[glyph] = found.metrics;
      compositeAt += found.length;
    }
  }
  return { counts, metrics };
}

/** This function reads packed point numbers. It gives the point numbers, or `undefined` for all the points, and the next offset. */
function readPoints(data: Reader, at: number): [number[] | undefined, number] {
  let count = data.u8(at++);
  if ((count & 0x80) !== 0) count = ((count & 0x7f) << 8) | data.u8(at++);
  if (count === 0) return [undefined, at];
  const points: number[] = [];
  let last = 0;
  while (points.length < count) {
    const control = data.u8(at++);
    const words = (control & 0x80) !== 0;
    const run = (control & 0x7f) + 1;
    for (let k = 0; k < run && points.length < count; k++) {
      last += words ? data.u16(at) : data.u8(at);
      at += words ? 2 : 1;
      points.push(last);
    }
  }
  return [points, at];
}

/** This function reads `count` packed deltas. It gives the deltas and the next offset. */
function readDeltas(data: Reader, at: number, count: number): [number[], number] {
  const deltas: number[] = [];
  while (deltas.length < count) {
    const control = data.u8(at++);
    const run = (control & 0x3f) + 1;
    const kind = control & 0xc0;
    for (let k = 0; k < run && deltas.length < count; k++) {
      if (kind === 0x80) deltas.push(0);
      else if (kind === 0x40) {
        deltas.push(data.i16(at));
        at += 2;
      } else if (kind === 0xc0) {
        deltas.push(data.u32(at) | 0);
        at += 4;
      } else deltas.push((data.u8(at++) << 24) >> 24);
    }
  }
  return [deltas, at];
}

/**
 * This function gives the advance delta of each glyph at the coordinates, from the phantom points of `gvar`. The delta
 * is the x delta of the second phantom point minus the x delta of the first. With `round`, the difference is rounded to
 * whole font units, and a half goes away from 0, as HarfBuzz rounds it.
 */
export function gvarAdvanceDeltas(gvar: Reader, pointCounts: Uint32Array, coordinates: readonly number[], deltas: "round" | "exact"): Float64Array {
  const axisCount = gvar.u16(4);
  const sharedCount = gvar.u16(6);
  const sharedAt = gvar.u32(8);
  const glyphCount = Math.min(gvar.u16(12), pointCounts.length);
  const longOffsets = (gvar.u16(14) & 1) !== 0;
  const dataAt = gvar.u32(16);
  const offsetOf = (glyph: number) => (longOffsets ? gvar.u32(20 + glyph * 4) : gvar.u16(20 + glyph * 2) * 2);
  const peakOf = (at: number) => Array.from({ length: axisCount }, (_, a) => gvar.i16(at + a * 2) / 16384);
  const shared = Array.from({ length: sharedCount }, (_, t) => peakOf(sharedAt + t * axisCount * 2));
  const result = new Float64Array(pointCounts.length);
  for (let glyph = 0; glyph < glyphCount; glyph++) {
    const start = offsetOf(glyph);
    const end = offsetOf(glyph + 1);
    if (end <= start) continue;
    const data = gvar.part(dataAt + start, end - start);
    const tupleCount = data.u16(0) & 0x0fff;
    const sharedPoints = (data.u16(0) & 0x8000) !== 0;
    let serialized = data.u16(2);
    let header = 4;
    const allPoints = pointCounts[glyph]! + 4;
    let sharedList: number[] | undefined;
    if (sharedPoints) [sharedList, serialized] = readPoints(data, serialized);
    const first = pointCounts[glyph]!;
    let left = 0;
    let right = 0;
    for (let t = 0; t < tupleCount; t++) {
      const size = data.u16(header);
      const index = data.u16(header + 2);
      header += 4;
      let peak: number[];
      if ((index & 0x8000) !== 0) {
        peak = Array.from({ length: axisCount }, (_, a) => data.i16(header + a * 2) / 16384);
        header += axisCount * 2;
      } else peak = shared[index & 0x0fff] ?? [];
      let startTuple: number[] | undefined;
      let endTuple: number[] | undefined;
      if ((index & 0x4000) !== 0) {
        startTuple = Array.from({ length: axisCount }, (_, a) => data.i16(header + a * 2) / 16384);
        endTuple = Array.from({ length: axisCount }, (_, a) => data.i16(header + axisCount * 2 + a * 2) / 16384);
        header += axisCount * 4;
      }
      let scalar = 1;
      for (let a = 0; a < axisCount && scalar !== 0; a++) {
        const p = peak[a] ?? 0;
        const s = startTuple?.[a] ?? Math.min(p, 0);
        const e = endTuple?.[a] ?? Math.max(p, 0);
        scalar *= axisScalar(s, p, e, coordinates[a] ?? 0);
      }
      const tupleEnd = serialized + size;
      if (scalar !== 0) {
        let at = serialized;
        let points = sharedList;
        if ((index & 0x2000) !== 0) [points, at] = readPoints(data, at);
        const count = points === undefined ? allPoints : points.length;
        const [xs] = readDeltas(data, at, count);
        const deltaOf = (point: number): number => {
          if (points === undefined) return xs[point] ?? 0;
          const k = points.indexOf(point);
          return k < 0 ? 0 : xs[k]!;
        };
        left += scalar * deltaOf(first);
        right += scalar * deltaOf(first + 1);
      }
      serialized = tupleEnd;
    }
    const delta = right - left;
    result[glyph] = deltas === "round" ? Math.sign(delta) * Math.round(Math.abs(delta)) : delta;
  }
  return result;
}
