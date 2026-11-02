import type { Reader } from "./binary.ts";

/** One axis of `fvar`, in the user units of the axis. */
export interface Axis {
  readonly tag: string;
  readonly min: number;
  readonly default: number;
  readonly max: number;
}

/** The coordinates of an instance in user units, by axis tag. An axis that is absent has its default value. */
export type Instance = Readonly<Record<string, number>>;

/** This function reads a 16.16 fixed number. */
function fixed(table: Reader, offset: number): number {
  return (table.u16(offset) << 16 >> 16) + table.u16(offset + 2) / 65536;
}

/** This function reads a 2.14 fixed number. */
function f2dot14(table: Reader, offset: number): number {
  return table.i16(offset) / 16384;
}

/** This function rounds a number to the 2.14 grid, as HarfBuzz and FreeType do with each normalized coordinate. */
function toF2dot14(value: number): number {
  return Math.round(value * 16384) / 16384;
}

/** This function gives the axes of `fvar`. */
export function readAxes(fvar: Reader): Axis[] {
  const offset = fvar.u16(4);
  const count = fvar.u16(8);
  const size = fvar.u16(10);
  const axes: Axis[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * size;
    axes.push({ tag: fvar.tag(at), min: fixed(fvar, at + 4), default: fixed(fvar, at + 8), max: fixed(fvar, at + 12) });
  }
  return axes;
}

/**
 * This function gives the normalized coordinates of an instance. Each coordinate is in -1 to 1, on the 2.14 grid. The
 * segment maps of `avar` change it when the font has them. A value outside the range of an axis is clamped to the range.
 */
export function normalize(axes: readonly Axis[], avar: Reader | undefined, instance: Instance): number[] {
  const coordinates = axes.map((axis) => {
    const value = Math.min(axis.max, Math.max(axis.min, instance[axis.tag] ?? axis.default));
    if (value < axis.default) return toF2dot14(axis.default === axis.min ? 0 : (value - axis.default) / (axis.default - axis.min));
    if (value > axis.default) return toF2dot14(axis.max === axis.default ? 0 : (value - axis.default) / (axis.max - axis.default));
    return 0;
  });
  if (avar === undefined || avar.u16(0) !== 1) return coordinates;
  let at = 8;
  const count = Math.min(avar.u16(6), axes.length);
  for (let a = 0; a < count; a++) {
    const pairs = avar.u16(at);
    const from: number[] = [];
    const to: number[] = [];
    for (let p = 0; p < pairs; p++) {
      from.push(f2dot14(avar, at + 2 + p * 4));
      to.push(f2dot14(avar, at + 4 + p * 4));
    }
    at += 2 + pairs * 4;
    coordinates[a] = toF2dot14(mapSegment(from, to, coordinates[a]!));
  }
  return coordinates;
}

/** This function maps a coordinate through one segment map of `avar`, by linear interpolation between its points. */
function mapSegment(from: readonly number[], to: readonly number[], value: number): number {
  if (from.length === 0) return value;
  if (value <= from[0]!) return to[0]! + value - from[0]!;
  for (let i = 1; i < from.length; i++) {
    if (value === from[i]) return to[i]!;
    if (value < from[i]!) return to[i - 1]! + ((value - from[i - 1]!) * (to[i]! - to[i - 1]!)) / (from[i]! - from[i - 1]!);
  }
  return to[to.length - 1]! + value - from[from.length - 1]!;
}

/** An ItemVariationStore at fixed coordinates. */
export interface VariationStore {
  /** This function gives the delta of the item `inner` of the data `outer`, in font units, not rounded. */
  delta(outer: number, inner: number): number;
}

/** This function reads an ItemVariationStore and computes the scalar of each region at the coordinates. */
export function readVariationStore(store: Reader, coordinates: readonly number[]): VariationStore {
  const regions = store.part(store.u32(2));
  const axisCount = regions.u16(0);
  const regionCount = regions.u16(2);
  const scalars: number[] = [];
  for (let r = 0; r < regionCount; r++) {
    let scalar = 1;
    for (let a = 0; a < axisCount && scalar !== 0; a++) {
      const at = 4 + (r * axisCount + a) * 6;
      scalar *= axisScalar(f2dot14(regions, at), f2dot14(regions, at + 2), f2dot14(regions, at + 4), coordinates[a] ?? 0);
    }
    scalars.push(scalar);
  }
  const dataCount = store.u16(6);
  const data = Array.from({ length: dataCount }, (_, i) => store.part(store.u32(8 + i * 4)));
  return {
    delta(outer, inner) {
      const table = data[outer];
      if (table === undefined || inner >= table.u16(0)) return 0;
      const wordField = table.u16(2);
      const longWords = (wordField & 0x8000) !== 0;
      const words = wordField & 0x7fff;
      const count = table.u16(4);
      const wordSize = longWords ? 4 : 2;
      const smallSize = longWords ? 2 : 1;
      const rowSize = words * wordSize + (count - words) * smallSize;
      let at = 6 + count * 2 + inner * rowSize;
      let sum = 0;
      for (let i = 0; i < count; i++) {
        let value: number;
        if (i < words) {
          value = longWords ? table.u32(at) | 0 : table.i16(at);
          at += wordSize;
        } else {
          value = longWords ? table.i16(at) : (table.u8(at) << 24) >> 24;
          at += smallSize;
        }
        const scalar = scalars[table.u16(6 + i * 2)] ?? 0;
        if (scalar !== 0) sum += scalar * value;
      }
      return sum;
    },
  };
}

/** This function gives the scalar of one axis of a region, as the OpenType specification defines it. */
function axisScalar(start: number, peak: number, end: number, value: number): number {
  if (start > peak || peak > end) return 1;
  if (start < 0 && end > 0 && peak !== 0) return 1;
  if (peak === 0 || value === peak) return 1;
  if (value <= start || value >= end) return 0;
  return value < peak ? (value - start) / (peak - start) : (end - value) / (end - peak);
}

/** This function gives the outer and inner index of a glyph in a DeltaSetIndexMap. A glyph after the end uses the last entry. */
export function mapIndex(map: Reader, index: number): [outer: number, inner: number] {
  const format = map.u8(0);
  const entryFormat = map.u8(1);
  const count = format === 0 ? map.u16(2) : map.u32(2);
  const start = format === 0 ? 4 : 6;
  if (count === 0) return [0, index];
  const size = ((entryFormat >> 4) & 3) + 1;
  const innerBits = (entryFormat & 0xf) + 1;
  const at = start + Math.min(index, count - 1) * size;
  let entry = 0;
  for (let i = 0; i < size; i++) entry = entry * 256 + map.u8(at + i);
  const innerCount = 2 ** innerBits;
  return [Math.floor(entry / innerCount), entry % innerCount];
}

/**
 * This function gives the advances of an instance. Each delta of `HVAR` is rounded to whole font units, as FreeType rounds
 * it: a half goes up. The advances stay as they are when the font has no `HVAR` table.
 */
export function instanceAdvances(advances: Uint16Array, hvar: Reader | undefined, coordinates: readonly number[]): Float64Array {
  const result = Float64Array.from(advances);
  if (hvar === undefined || coordinates.every((value) => value === 0)) return result;
  const store = readVariationStore(hvar.part(hvar.u32(4)), coordinates);
  const mapOffset = hvar.u32(8);
  const map = mapOffset === 0 ? undefined : hvar.part(mapOffset);
  for (let glyph = 0; glyph < result.length; glyph++) {
    const [outer, inner] = map === undefined ? [0, glyph] : mapIndex(map, glyph);
    result[glyph] = advances[glyph]! + Math.round(store.delta(outer, inner));
  }
  return result;
}
