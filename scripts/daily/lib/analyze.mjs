// lib/analyze.mjs - every board rule of dossier v2 3.5 (R1-R8, R11) and the derived data a board ships with,
// generator side. A board is W (10 word ids) and H (10 heading ids); index 0-4 is section 1 (top five),
// 5-9 section 2 (bottom five). The answer is ans[w] = heading index.
import { popcount, countPM, perfectMatching, enumeratePM, uniquenessCertificate, forcedPath } from './match.mjs';
import { YES_STRICT, YES_GENEROUS, HONEST } from './key.mjs';

export const N = 10, SIZE = 5;

export function graphs(K, W, H) {
  const T = W.map((w) => H.map((h) => K.tier(w, h)));
  const strict = new Array(N).fill(0), gen = new Array(N).fill(0), honest = new Array(N).fill(0);
  let arguable = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const t = T[i][j];
    if (t === 'A') arguable++;
    if (YES_STRICT.has(t)) strict[i] |= 1 << j;
    if (YES_GENEROUS.has(t)) gen[i] |= 1 << j;
    if (HONEST.has(t)) honest[i] |= 1 << j;
  }
  return { T, strict, gen, honest, arguable };
}

// Editorial rules from the pilot's cold-solve review (not in the dossier's R list; README "Board rules"):
//   E1 no word is named by a heading on its own board ("Screen" with "Has a screen", "Coin" with "Coin");
//   E2 no two headings share a base predicate ("Has a trunk" with "Has a trunk, no branches"): the second
//      heading's first half equals the first's, so every taker of one is a taker of the other.
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'is', 'isn', 't', 'can', 'has', 'no', 'not', 'of', 'in', 'to', 'you', 'someone', 'and', 'or', 's']);
export const labelTokens = (label) => label.toLowerCase().split(/[^a-z]+/).filter((x) => x && !FUNCTION_WORDS.has(x));
export const names = (label, text) => { const x = text.toLowerCase(); return labelTokens(label).some((k) => k === x || k === `${x}s` || k === `${x}es` || x === `${k}s`); };
export const baseNegative = (neg) => String(typeof neg === 'string' ? neg : (neg && neg.has) || '').toLowerCase().trim();
export function editorialClashes(K, W, H) {
  const named = [], echo = [];
  for (let i = 0; i < W.length; i++) for (let j = 0; j < H.length; j++) if (names(K.heading(H[j]).label, K.word(W[i]).text)) named.push([i, j]);
  for (let j = 0; j < H.length; j++) for (let k = j + 1; k < H.length; k++) {
    const a = K.heading(H[j]), b = K.heading(H[k]);
    if (a.family === 'computed' || b.family === 'computed') continue; // R8 already allows only one
    if (baseNegative(a.negative) && baseNegative(a.negative) === baseNegative(b.negative)) echo.push([j, k]);
  }
  return { named, echo };
}

/** Literal weight (R6): L on a semantic heading 2; S, or L on a computed heading, 1; O 0. */
export const litWeight = (K, t, hid) => (t === 'L' && !K.isComputed(hid) ? 2 : t === 'L' || t === 'S' ? 1 : 0);

/** Section-1 analysis: honest fillings (R5) and the moves each tied most-literal filling needs (R6). */
export function section1(K, W, H, T, ans) {
  const s1 = [];
  const cur = new Array(SIZE), used = new Array(SIZE).fill(false);
  const rec = (i) => {
    if (i === SIZE) { s1.push(cur.slice()); return; }
    for (let s = 0; s < SIZE; s++) if (!used[s] && HONEST.has(T[i][s])) { used[s] = true; cur[i] = s; rec(i + 1); used[s] = false; }
  };
  rec(0);
  if (!s1.length) return { fillings: 0, literal: [], moves: [] };
  const weight = (x) => x.reduce((a, s, i) => a + litWeight(K, T[i][s], H[s]), 0);
  const top = Math.max(...s1.map(weight));
  const literal = s1.filter((x) => weight(x) === top);
  const moves = literal.map((x) => x.filter((s, i) => ans[i] !== s).length);
  return { fillings: s1.length, literal, moves };
}

/**
 * Full analysis. Returns { ok, fails: [rule...], ... }. `ok` means R1-R8, R11, E1 and E2 hold
 * (R9 is the editorial stranger check, R10 is checked by fit.mjs on the pool).
 */
export function analyzeBoard(K, W, H, { requireOpen = false } = {}) {
  const fails = [];
  const g = graphs(K, W, H);
  if (new Set(W).size !== N || new Set(H).size !== N) fails.push('distinct');
  if (g.arguable) fails.push('R1');
  const m = perfectMatching(g.strict);
  const strictCount = m ? countPM(g.strict) : 0;
  const genCount = m ? countPM(g.gen) : 0;
  if (strictCount !== 1) fails.push('R2');
  if (genCount !== 1) fails.push('R3');
  if (strictCount !== 1) return { ok: false, fails, strictCount, genCount };
  const ans = m;
  if (ans.some((h, w) => !HONEST.has(g.T[w][h]))) fails.push('R4');
  const sec = section1(K, W, H, g.T, ans);
  if (sec.fillings < 1) fails.push('R5');
  const r6 = sec.moves.length ? Math.min(...sec.moves) : 0;
  if (r6 < 2) fails.push('R6');
  if (requireOpen && sec.fillings < 2) fails.push('open');
  const degW = g.strict.map(popcount);
  const takers = H.map((_, j) => g.strict.filter((a) => a & (1 << j)).length);
  const meanDeg = degW.reduce((a, b) => a + b, 0) / N;
  if (degW.some((d) => d < 1 || d > 4) || takers.some((t) => t > 4) || meanDeg < 1.9 - 1e-9 || meanDeg > 2.6 + 1e-9) fails.push('R7');
  const computed = H.filter((h) => K.isComputed(h));
  if (computed.length > 1) fails.push('R8');
  // R11: glosses, negatives, articles
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const t = g.T[i][j];
    if (t === 'S' || t === 'O') {
      const c = K.cellOf(W[i], H[j]);
      if (!c.text || c.text.trim().split(/\s+/).length > 6) { fails.push('R11'); i = N; break; }
    }
  }
  for (const h of H) { const neg = K.heading(h).negative; if (!neg || (typeof neg === 'object' && (!neg.has || !neg.not))) fails.push('R11'); }
  for (const w of W) if (typeof K.word(w).article !== 'string') fails.push('R11');
  const clash = editorialClashes(K, W, H);
  if (clash.named.length) fails.push('E1');
  if (clash.echo.length) fails.push('E2');

  const cert = uniquenessCertificate(g.strict, ans);
  const path = forcedPath(g.strict);
  // second lives in the answer, ahas, and the nudge
  const hasLiteralHomeElsewhere = (i) => H.some((h, j) => j !== ans[i] && g.T[i][j] === 'L' && !K.isComputed(h));
  const sPairs = [];
  for (let i = 0; i < N; i++) if (g.T[i][ans[i]] === 'S') {
    const c = K.cellOf(W[i], H[ans[i]]);
    const obv = Array.isArray(K.raw.cells[H[ans[i]]][W[i]]) ? K.raw.cells[H[ans[i]]][W[i]][3] : undefined;
    sPairs.push({ w: i, h: ans[i], sense: c.sense, gloss: c.text, aha: hasLiteralHomeElsewhere(i), obv: typeof obv === 'number' ? obv : (hasLiteralHomeElsewhere(i) ? 0.3 : 0.6) });
  }
  const aha = sPairs.filter((p) => p.aha);
  // nudge: the least obvious S answer pair (ties: the later one in the proof order)
  let nudge = null;
  if (sPairs.length) {
    const pos = new Map(cert.map((w, i) => [w, i]));
    nudge = [...sPairs].sort((a, b) => a.obv - b.obv || pos.get(b.w) - pos.get(a.w))[0].w;
  }
  // exclusive headings (the "takes only one of today's words" pin sentence): every other board word is N
  const exclusive = H.map((_, j) => W.every((_, i) => i === ans.indexOf(j) || g.T[i][j] === 'N'));
  // leftover bin: the computed heading's answer word also fits another heading (strict yes)
  let leftover = false;
  const cj = H.findIndex((h) => K.isComputed(h));
  if (cj >= 0) { const wi = ans.indexOf(cj); leftover = H.some((_, j) => j !== cj && (g.strict[wi] & (1 << j))); }
  const cells = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (g.T[i][j] !== 'N') { const c = K.cellOf(W[i], H[j]); cells.push([i, j, c.tier, c.sense, c.text]); }
  return {
    ok: fails.length === 0, fails: [...new Set(fails)], strictCount, genCount, ans, cert, path,
    s1Fillings: sec.fillings, literalFillings: sec.literal, literalMoves: sec.moves, r6,
    degW, takers, meanDeg, maxTakers: Math.max(...takers),
    computed: computed.length, jokes: H.filter((h) => K.family(h) === 'joke').length, verbs: H.filter((h) => K.family(h) === 'verb').length,
    closedSets: [...new Set(H.map((h) => K.heading(h).closedSet).filter(Boolean))],
    sPairs, aha, nudge, exclusive, leftover, cells,
    oCells: cells.filter((c) => c[2] === 'O').length, nCells: cells.filter((c) => c[2] === 'n').length,
  };
}

/** All perfect matchings of the generous graph, up to a cap (for diagnostics and the review screen). */
export function rivals(K, W, H, cap = 50) {
  const g = graphs(K, W, H);
  return enumeratePM(g.gen, N, cap);
}
