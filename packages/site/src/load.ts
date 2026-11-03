/** The download of the font files and their faces in the page. */
import { engines, readFont, type EngineName, type Font } from "@mark1russell7/typeset/fonts";
import { cssInstance } from "@typeset/widths";
import type { FontChoice } from "./catalog.ts";

/** A font of the site: its file, its face in the page and the model of each engine. */
export interface LoadedFont {
  readonly choice: FontChoice;
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** The CSS family of the face. No system font has this name, so the canvas cannot use a system font. */
  readonly family: string;
  /** The range of the weight axis, or `[400, 400]` for a font with no weight axis. */
  readonly weights: readonly [min: number, max: number];
  /** This function gives the model of the font for an engine at a CSS weight. */
  model(engine: EngineName, weight: number): Font;
}

const files = new Map<string, Promise<LoadedFont>>();

/** This function reads a response body and reports the share of the bytes that came, from 0 to 1. */
async function readBody(response: Response, progress: (share: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const total = Number(response.headers.get("content-length") ?? 0);
  if (response.body === null || total === 0) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    progress(Math.min(1, received / total));
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/**
 * This function downloads a font file, adds it to the page as a FontFace and gives it with its models. The face has the
 * ranges of the axes of the font, so the browser uses the weight axis and not a synthetic bold. A second call for the
 * same font gives the first result.
 */
export function loadFont(choice: FontChoice, progress: (share: number) => void): Promise<LoadedFont> {
  const known = files.get(choice.id);
  if (known !== undefined) return known;
  const loading = (async (): Promise<LoadedFont> => {
    const response = await fetch(choice.url);
    if (!response.ok) throw new Error(`the download of ${choice.family} gave the status ${response.status}`);
    const bytes = await readBody(response, progress);
    const base = readFont(bytes);
    const wght = base.axes.find((axis) => axis.tag === "wght");
    const wdth = base.axes.find((axis) => axis.tag === "wdth");
    const family = `typeset-${choice.id}`;
    const face = new FontFace(family, bytes, {
      weight: wght === undefined ? "normal" : `${wght.min} ${wght.max}`,
      stretch: wdth === undefined ? "normal" : `${wdth.min}% ${wdth.max}%`,
    });
    await face.load();
    document.fonts.add(face);
    // One read of the tables for each engine, and one instance for each engine and weight
    const models = new Map<string, Font>();
    const modelOf = (engine: EngineName, weight: number): Font => {
      const key = `${engine}/${weight}`;
      let font = models.get(key);
      if (font === undefined) {
        const { deltas, metrics } = engines[engine];
        const read = models.get(engine) ?? readFont(bytes, { instance: cssInstance(), deltas, metrics });
        models.set(engine, read);
        font = read.at(cssInstance(weight));
        models.set(key, font);
      }
      return font;
    };
    return {
      choice,
      bytes,
      family,
      weights: wght === undefined ? [400, 400] : [wght.min, wght.max],
      model: modelOf,
    };
  })();
  files.set(choice.id, loading);
  loading.catch(() => files.delete(choice.id));
  return loading;
}
