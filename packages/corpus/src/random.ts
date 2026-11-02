/**
 * A source of random numbers. The same seed always gives the same sequence on each platform.
 */
export interface Random {
  /** This function gives a number in the range [0, 1). */
  next(): number;
  /** This function gives an integer in the range [low, high], both ends included. */
  int(low: number, high: number): number;
  /** This function gives one item of a list that is not empty. */
  pick<T>(items: readonly T[]): T;
  /** This function gives `true` with the probability `p`. */
  chance(p: number): boolean;
}

/**
 * This function makes a 32-bit hash of a list of numbers and strings. The corpus uses it to make the seed of each sample.
 */
export function hash32(...parts: readonly (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = typeof part === "number" ? `#${part}` : `$${part}`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * This function makes a random source with the algorithm xoshiro128**. The algorithm splitmix32 expands the seed into the state.
 */
export function createRandom(seed: number): Random {
  let s = seed >>> 0;
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k));
  const nextUint = (): number => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };
  const next = (): number => nextUint() / 0x100000000;
  return {
    next,
    int(low, high) {
      if (!Number.isInteger(low) || !Number.isInteger(high) || high < low) throw new RangeError(`no integer in [${low}, ${high}]`);
      return low + Math.floor(next() * (high - low + 1));
    },
    pick(items) {
      if (items.length === 0) throw new RangeError("the list has no items");
      return items[Math.floor(next() * items.length)]!;
    },
    chance(p) {
      return next() < p;
    },
  };
}
