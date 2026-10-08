// Long words in narrow slot columns. Five columns on a 360 px phone leave
// about 57 px per slot, and "Strawberry" is 4.9 em wide in Roboto 500, so at
// 13 px it would break mid-word. Instead each slot's word and heading carry
// their measured width in em (--fit-em), and App.css sizes them with container
// units: clamp(floor, column width / em width, normal size). A word shrinks
// only as much as its column needs, and only below the floor does it wrap.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const FONTS = {
  word: '500 100px Roboto, sans-serif',
  heading: '600 100px Outfit, sans-serif',
} as const;

export type FitFont = keyof typeof FONTS;

const cache = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;

/** Width of `text` in em in the given web font, or undefined when it can't be measured. */
export function emWidth(text: string, font: FitFont): number | undefined {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (context === undefined) {
    try {
      context = document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  if (!context) return undefined;
  context.font = FONTS[font];
  const width = context.measureText(text).width / 100;
  if (!(width > 0)) return undefined;
  cache.set(key, width);
  return width;
}

/** The widest single word of a heading in em: headings wrap between words, never inside one. */
export function widestWordEm(text: string, font: FitFont): number | undefined {
  const widths = text.split(/\s+/).map((word) => emWidth(word, font) ?? 0);
  const widest = Math.max(0, ...widths);
  return widest > 0 ? widest : undefined;
}

/** The style that carries a measured width to CSS. */
export function fitStyle(em: number | undefined): CSSProperties | undefined {
  return em === undefined ? undefined : ({ '--fit-em': em.toFixed(3) } as CSSProperties);
}

/**
 * Re-render once the web fonts are loaded, so widths measured earlier in a
 * fallback font are measured again in the real ones.
 */
export function useWebFontsMeasured(): number {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || typeof fonts.load !== 'function') return undefined;
    let live = true;
    Promise.all(Object.values(FONTS).map((font) => fonts.load(font)))
      .then(() => {
        cache.clear();
        if (live) setGeneration((value) => value + 1);
      })
      .catch(() => {
        // Fonts blocked: the fallback measurements stand.
      });
    return () => {
      live = false;
    };
  }, []);
  return generation;
}
