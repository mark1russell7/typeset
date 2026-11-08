import { random as createRandom, type Random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { Text } from "../text.ts";
import record from "../../test/rope-calls.json" with { type: "json" };

/**
 * A fake shaper that obeys the separator law. Each word between two separators gets a ligature, a contextual form and a
 * width that depends on all the word. The kerning goes between each two adjacent characters, also across a separator.
 */
function fakeWidth(text: string): number {
  const characters = [...text];
  let width = 0;
  let word: string[] = [];
  const endWord = () => {
    for (let i = 0; i < word.length; i++) {
      const code = word[i]!.codePointAt(0)!;
      if (word[i] === "f" && word[i + 1] === "i") {
        width += 9;
        i++;
        continue;
      }
      width += 3 + (code % 7);
      if (word[i + 1] === word[i]) width -= 1;
    }
    if (word.length > 5) width += 0.5;
    word = [];
  };
  for (const character of characters) {
    if (character === " " || character === "\t") {
      endWord();
      width += 4;
    } else word.push(character);
  }
  endWord();
  for (let i = 0; i + 1 < characters.length; i++) width += (((characters[i]!.codePointAt(0)! * 31 + characters[i + 1]!.codePointAt(0)!) % 5) - 2) / 8;
  return width;
}

const alphabet = ["a", "b", "f", "i", "o", "T", "ل", "ا", "न", "्", "😀", "𝒳", " ", " ", " ", "\t"];

function randomText(random: Random, maxLength: number): string {
  const count = random.int(0, maxLength);
  let text = "";
  for (let i = 0; i < count; i++) text += alphabet[random.below(alphabet.length)];
  return text;
}

/** This function gives about `length` code units of words between spaces, from the seed of the record. */
function wordText(length: number): string {
  const random = createRandom(7);
  const words: string[] = [];
  let size = 0;
  while (size < length) {
    const word = randomText(random, 10).replace(/[ 	]/g, "") || "a";
    words.push(word);
    size += word.length + 1;
  }
  return words.join(" ").slice(0, length);
}

function counted(width: (text: string) => number) {
  const counter = { calls: 0, units: 0 };
  const measure = (text: string): number => {
    counter.calls++;
    counter.units += text.length;
    return width(text);
  };
  return { counter, measure };
}

describe("the Text rope", () => {
  it("gives the text, the length and the width of the flat string", () => {
    for (const chunk of [2, 3, 7, 256]) {
      for (let seed = 1; seed <= 50; seed++) {
        const flat = randomText(createRandom(seed), 300);
        const text = Text.from(flat, fakeWidth, { chunk });
        expect(text.toString()).toBe(flat);
        expect(text.length).toBe(flat.length);
        expect(text.width).toBeCloseTo(fakeWidth(flat), 9);
        expect(text.chunks().every((leaf) => leaf.length <= chunk)).toBe(true);
      }
    }
  });

  it("keeps the width equal to the width of the flat string after each edit", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const random = createRandom(seed);
      const chunk = random.pick([2, 5, 16, 64]);
      let flat = randomText(random, 200);
      let text = Text.from(flat, fakeWidth, { chunk });
      for (let step = 0; step < 20; step++) {
        const start = random.int(0, flat.length);
        const end = random.int(start, flat.length);
        const kind = random.below(5);
        if (kind === 0) {
          const added = randomText(random, 20);
          text = text.insert(start, added);
          flat = flat.slice(0, start) + added + flat.slice(start);
        } else if (kind === 1) {
          text = text.remove(start, end);
          flat = flat.slice(0, start) + flat.slice(end);
        } else if (kind === 2) {
          const added = randomText(random, 20);
          text = text.replace(start, end, added);
          flat = flat.slice(0, start) + added + flat.slice(end);
        } else if (kind === 3) {
          text = text.slice(start, end);
          flat = flat.slice(start, end);
        } else {
          const other = randomText(random, 60);
          text = text.concat(Text.from(other, fakeWidth, { chunk }));
          flat += other;
        }
        expect(text.toString(), `seed ${seed}, step ${step}`).toBe(flat);
        expect(text.width, `seed ${seed}, step ${step}`).toBeCloseTo(fakeWidth(flat), 9);
        // The AVL bound: the height is at most 1.45 log2(leaves + 2)
        expect(text.height).toBeLessThanOrEqual(1.45 * Math.log2(text.chunks().length + 2));
      }
    }
  });

  it("gives the width of a range", () => {
    const flat = "The office of the official fish";
    const text = Text.from(flat, fakeWidth, { chunk: 4 });
    for (let start = 0; start <= flat.length; start += 3) {
      for (let end = start; end <= flat.length; end += 5) expect(text.widthOf(start, end)).toBeCloseTo(fakeWidth(flat.slice(start, end)), 9);
    }
  });

  it("does not change a rope after an edit", () => {
    const text = Text.from("left and right", fakeWidth, { chunk: 3 });
    const width = text.width;
    text.insert(4, " middle").remove(0, 2).replace(1, 3, "x");
    expect(text.toString()).toBe("left and right");
    expect(text.width).toBe(width);
  });

  it("is exact for any width function with no separators", () => {
    // This width function does not obey the separator law: it is not a sum of local terms
    const square = (text: string): number => text.length ** 2;
    const text = Text.from("a b c d e f g h", square, { chunk: 3, separators: "" }).insert(3, " x y");
    expect(text.width).toBe(square(text.toString()));
  });

  it("stays within the record of the width calls of one insert, with and without the memory of the windows", () => {
    const flat = wordText(100_000);
    expect(flat.length).toBeGreaterThan(99_000);
    const { counter, measure } = counted(fakeWidth);
    const text = Text.from(flat, measure);
    expect(text.chunks().length).toBe(record.leaves);
    const offsets = [0, 1, 777, 31_415, 50_000, flat.length - 1, flat.length];
    const warm: number[] = [];
    const units: number[] = [];
    for (const at of offsets) {
      counter.calls = 0;
      counter.units = 0;
      const edited = text.insert(at, "x");
      warm.push(counter.calls);
      units.push(counter.units);
      expect(edited.width).toBeCloseTo(fakeWidth(edited.toString()), 6);
    }
    const cold = offsets.map((at) => {
      // A new rope of the same width function clears the memory
      Text.from("", measure);
      counter.calls = 0;
      text.insert(at, "x");
      return counter.calls;
    });
    warm.forEach((calls, i) => {
      expect(calls).toBeLessThanOrEqual(record.warm[i]!);
      expect(calls).toBeLessThanOrEqual(record.base[i]!);
    });
    cold.forEach((calls, i) => {
      expect(calls).toBeLessThanOrEqual(record.cold[i]!);
      expect(calls).toBeLessThanOrEqual(32);
    });
    expect(Math.max(...units)).toBeLessThanOrEqual(4096);
  });

  it("uses the width function of the order of log n times for one edit, on a grid of lengths", () => {
    for (const length of [1_000, 10_000, 100_000, 400_000]) {
      const flat = wordText(length);
      const { counter, measure } = counted(fakeWidth);
      const text = Text.from(flat, measure);
      const limit = 8 * Math.log2(flat.length) + 16;
      for (const at of [0, 1, flat.length >> 2, flat.length >> 1, flat.length - 1, flat.length]) {
        Text.from("", measure);
        counter.calls = 0;
        text.insert(at, "x");
        expect(counter.calls, `${length} at ${at}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("measures again in a new rope, because a width function can change when a font loads", () => {
    let scale = 1;
    const width = (text: string): number => scale * fakeWidth(text);
    const flat = "the office of the fish and the official fish of the office ".repeat(20);
    Text.from(flat, width, { chunk: 16 });
    scale = 2;
    const text = Text.from(flat, width, { chunk: 16 }).insert(7, "x y");
    expect(text.width).toBeCloseTo(width(text.toString()), 9);
  });

  it("stays exact when the windows go over the limit of the memory", () => {
    const random = createRandom(11);
    let flat = wordText(120_000);
    let text = Text.from(flat, fakeWidth, { chunk: 4 });
    for (let step = 0; step < 40; step++) {
      const at = random.int(0, flat.length);
      text = text.insert(at, "fi o");
      flat = flat.slice(0, at) + "fi o" + flat.slice(at);
    }
    expect(text.toString()).toBe(flat);
    expect(text.width).toBeCloseTo(fakeWidth(flat), 5);
  });

  it("joins two ropes of one width function and shares no state with another", () => {
    const left = Text.from("left side ", fakeWidth, { chunk: 4 });
    const right = Text.from("right side", fakeWidth, { chunk: 4 });
    expect(left.concat(right).width).toBeCloseTo(fakeWidth("left side right side"), 9);
    expect(() => left.concat(Text.from("right side", fakeWidth, { chunk: 5 }))).toThrow(TypeError);
  });

  it("refuses a range out of the text and two ropes of different width functions", () => {
    const text = Text.from("abc", fakeWidth);
    expect(() => text.slice(2, 1)).toThrow(RangeError);
    expect(() => text.insert(4, "x")).toThrow(RangeError);
    expect(() => text.remove(0.5, 1)).toThrow(RangeError);
    expect(() => text.concat(Text.from("d", (value) => value.length))).toThrow(TypeError);
    expect(() => Text.from("", fakeWidth, { chunk: 1 })).toThrow(RangeError);
    expect(() => Text.from("", fakeWidth, { separators: "\ud800" })).toThrow(RangeError);
    expect(Text.from("", fakeWidth).width).toBe(0);
    expect(Text.from("", fakeWidth).toString()).toBe("");
  });
});
