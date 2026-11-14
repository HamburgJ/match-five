// lib/key.mjs - load the word-level key snapshot (data/key.json) for the generator side.
//
// Key snapshot format (schema 1), written by build-key.mjs and read independently by verify-boards.test.js:
// {
//   schema: 1, version, pilot, provenance,
//   words:    { wid: { text, article: 'a'|'an'|'', engine: bool, senses: { sid: { gloss, prominence } } } },
//   headings: { hid: { label, spoken, family: 'anchor'|'property'|'joke'|'verb'|'computed',
//                      closedSet: string|null, rule: string|null, negative: string | { has, not } } },
//   cells:    { hid: { wid: [tier, sid|null, text|null] } },   // every non-N cell inside coverage
//   coverage: { words: [wid], headings: [hid] }                 // every cell inside is judged; unlisted = N
// }
// Tiers (dossier v2 3.4): L, S (yes); O (true but obscure: yes for uniqueness, never the answer);
// A (arguable: never on a board); n (soft no: yes only in the generous count); N (confident no).
import { readFileSync } from 'node:fs';

export const YES_STRICT = new Set(['L', 'S', 'O']); // R2 graph
export const YES_GENEROUS = new Set(['L', 'S', 'O', 'n']); // R3 graph
export const HONEST = new Set(['L', 'S']); // R4 / R5

export function loadKey(path) {
  const key = JSON.parse(readFileSync(path, 'utf8'));
  return wrapKey(key);
}

export function wrapKey(key) {
  const covW = new Set(key.coverage.words), covH = new Set(key.coverage.headings);
  const cellOf = (wid, hid) => {
    if (!covW.has(wid) || !covH.has(hid)) throw new Error(`cell outside key coverage: ${wid} x ${hid}`);
    const c = key.cells[hid]?.[wid];
    return c ? { tier: c[0], sense: c[1] ?? null, text: c[2] ?? null } : { tier: 'N', sense: null, text: null };
  };
  const tier = (wid, hid) => key.cells[hid]?.[wid]?.[0] || 'N';
  const isComputed = (hid) => key.headings[hid].family === 'computed';
  const family = (hid) => key.headings[hid].family;
  // adjacency lists (strict yes and generous yes) for proposals
  const strictH = new Map(), strictW = new Map(), genW = new Map();
  for (const hid of key.coverage.headings) strictH.set(hid, []);
  for (const wid of key.coverage.words) { strictW.set(wid, []); genW.set(wid, []); }
  for (const [hid, row] of Object.entries(key.cells)) {
    if (!covH.has(hid)) continue;
    for (const [wid, c] of Object.entries(row)) {
      if (!covW.has(wid)) continue;
      if (YES_STRICT.has(c[0])) { strictH.get(hid).push(wid); strictW.get(wid).push(hid); }
      if (YES_GENEROUS.has(c[0])) genW.get(wid).push(hid);
    }
  }
  return {
    raw: key, tier, cellOf, isComputed, family,
    words: key.coverage.words, headings: key.coverage.headings,
    word: (wid) => key.words[wid], heading: (hid) => key.headings[hid],
    takers: (hid) => strictH.get(hid) || [], homes: (wid) => strictW.get(wid) || [], genHomes: (wid) => genW.get(wid) || [],
  };
}
