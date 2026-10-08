// lib/fit.mjs - R10 Fits (dossier v2 3.5), generator side: every heading label fits its line budget and
// every word fits its well and its tray cell, computed from the fonts' advance widths and pair kerning
// (fit/advance-tables.json) and the phone geometry (fit/layout.json). A hard filter on the pool.
import { readFileSync } from 'node:fs';

const here = (f) => new URL(`../fit/${f}`, import.meta.url);
let T = null, G = null;
const load = () => {
  if (!T) { T = JSON.parse(readFileSync(here('advance-tables.json'), 'utf8')).tables; G = JSON.parse(readFileSync(here('layout.json'), 'utf8')); }
};

export function textWidth(s, table, px) {
  load();
  const t = T[table];
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const a = t.advance[s[i]];
    if (a === undefined) throw new Error(`no advance width for "${s[i]}" in ${table}`);
    w += a;
    if (i) w += t.kern[s[i - 1] + s[i]] || 0;
  }
  return w * px;
}

export function geometry(viewport) {
  load();
  const col = (viewport - 2 * G.gutter - (G.columns - 1) * G.gap) / G.columns;
  const label = col - 2 * G.cardBorder - 2 * G.cardPadding;
  return { col, label, well: label - 2 * G.wellBorder - 2 * G.tilePaddingX, tray: col - 2 * G.trayBorder - 2 * G.trayPaddingX };
}

/** Greedy line breaking at spaces, as CSS does. Returns the number of lines, or Infinity if a word is wider than a line. */
export function labelLines(label, px, width) {
  const words = label.split(' ');
  let lines = 0, cur = '';
  for (const w of words) {
    if (textWidth(w, 'label', px) > width) return Infinity;
    const cand = cur ? `${cur} ${w}` : w;
    if (textWidth(cand, 'label', px) <= width) cur = cand;
    else { lines++; cur = w; }
  }
  return lines + (cur ? 1 : 0);
}

export function fitsLabel(label) {
  load();
  const out = [];
  for (const c of G.checks) {
    const g = geometry(c.viewport);
    const lines = labelLines(label, c.labelPx, g.label - G.safetyPx);
    out.push({ viewport: c.viewport, lines, ok: lines <= c.labelMaxLines });
  }
  return { ok: out.every((x) => x.ok), checks: out };
}

export function fitsWord(word) {
  load();
  const out = [];
  for (const c of G.checks) {
    const g = geometry(c.viewport);
    const w = textWidth(word, 'word', c.wordPx);
    out.push({ viewport: c.viewport, width: Math.round(w * 10) / 10, well: Math.round(g.well * 10) / 10, tray: Math.round(g.tray * 10) / 10, ok: w <= g.well - G.safetyPx && w <= g.tray - G.safetyPx });
  }
  return { ok: out.every((x) => x.ok), checks: out };
}
