'use client';

import { useEffect } from 'react';

type RGB = [number, number, number];

/** Brand gold: used when a cover's colour cannot be read (no cover, or the server forbids it). */
export const DEFAULT_RGB: RGB = [246, 183, 60];

const cache = new Map<string, Promise<RGB | null>>();

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255)) as RGB;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255)) as RGB;
}

/**
 * The cover's most vivid colour, adjusted to glow on a dark background. Colourful pixels count
 * more than grey ones, so a mostly black cover with a red logo gives red, not black.
 */
function vivid(data: Uint8ClampedArray): RGB | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const px: RGB = [data[i], data[i + 1], data[i + 2]];
    const [, s, l] = rgbToHsl(px);
    const weight = 0.05 + s * s * (1 - Math.abs(l - 0.5) * 1.6);
    if (weight <= 0) continue;
    r += px[0] * weight;
    g += px[1] * weight;
    b += px[2] * weight;
    total += weight;
  }
  if (!total) return null;
  const [h, s, l] = rgbToHsl([r / total, g / total, b / total]);
  if (s < 0.12) return DEFAULT_RGB; // a grey cover: keep the brand colour
  return hslToRgb(h, Math.min(0.85, Math.max(0.55, s * 1.25)), Math.min(0.66, Math.max(0.56, l)));
}

/** Smallest variant the provider offers: enough to read a colour, ~7 KB. */
const small = (url: string) => url.replace(/(480x480|1000x1000)(\.jpg)/, '150x150$2');

export function artworkColor(url: string): Promise<RGB | null> {
  const src = small(url);
  let job = cache.get(src);
  if (!job) {
    job = new Promise<RGB | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 24;
          c.height = 24;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, 24, 24);
          resolve(vivid(ctx.getImageData(0, 0, 24, 24).data));
        } catch {
          resolve(null); // the image server does not allow reading its pixels
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cache.set(src, job);
  }
  return job;
}

/** Tint the whole app (backdrop, player, progress line) with the colour of `artwork`. */
export function useSongColor(artwork: string | null | undefined): void {
  useEffect(() => {
    let alive = true;
    const apply = ([r, g, b]: RGB) => {
      const s = document.documentElement.style;
      s.setProperty('--dyn-r', String(r));
      s.setProperty('--dyn-g', String(g));
      s.setProperty('--dyn-b', String(b));
    };
    if (!artwork || !artwork.startsWith('https://')) {
      apply(DEFAULT_RGB);
      return;
    }
    void artworkColor(artwork).then((rgb) => alive && apply(rgb ?? DEFAULT_RGB));
    return () => {
      alive = false;
    };
  }, [artwork]);
}
