// generate.mjs - the Match Five Daily board generator (dossier v2 7.4). U3's simulated-annealing prototype
// (dossier-tools/generate.mjs, v2-tools/gen-v2.mjs) scaled to a sense-level key of hundreds of words:
//   - every board rule is a term in the annealing energy AND a hard filter on the result:
//     R1 no A cell; R2 strict (L+S+O) count 1; R3 generous (L+S+O+n) count 1; R4 answer uses only L+S;
//     R7 word degree 1-4, at most 4 takers per heading, mean degree 1.9-2.6; R8 at most 1 computed heading;
//     at most 2 joke headings and at most 1 verb heading per board (7.2); E1 no word named by a heading on its
//     board; E2 no two headings sharing a base predicate (lib/analyze.mjs);
//   - R10 Fits and the joke-heading taker rule (3+ fair takers, 7.2) filter the pool before annealing;
//   - the section split (the "deal") is scored against R5 and R6 over every tied most-literal filling;
//   - usage terms spread boards across the vocabulary, so the calendar step has room to meet its caps.
// Proposals are local: a replacement word usually fits one of the board's headings, a replacement heading
// usually takes one of the board's words (a random 10x10 block of a sparse key has no matchings at all).
//
// Run: node scripts/daily/generate.mjs --key <key.json> --seed 1 --boards 200 [--want easy|hard] [--nocomputed]
//        [--usage work/usage.json] --out work/candidates/<name>.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadKey } from './lib/key.mjs';
import { perfectMatching, popcount } from './lib/match.mjs';
import { analyzeBoard, graphs, litWeight, N, SIZE, names, baseNegative } from './lib/analyze.mjs';
import { playersFor, bandsFor } from './lib/players.mjs';
import { fitsLabel, fitsWord } from './lib/fit.mjs';

const CODE = { N: 0, n: 1, A: 2, O: 3, S: 4, L: 5 };
const STRICT = (c) => c >= 3, GEN = (c) => c === 1 || c >= 3, HONEST = (c) => c >= 4;

export function makePool(K, { nocomputed = false, skipFit = false } = {}) {
  const fitW = new Map(), fitH = new Map();
  const words = K.words.filter((w) => { const f = skipFit ? { ok: true } : fitsWord(K.word(w).text); fitW.set(w, f); return f.ok && !K.word(w).excluded; });
  const fairTakers = (h) => K.words.filter((w) => ['L', 'S'].includes(K.tier(w, h))).length;
  const headings = K.headings.filter((h) => {
    const meta = K.heading(h);
    if (meta.status === 'rejected') return false;
    if (nocomputed && meta.family === 'computed') return false;
    const f = skipFit ? { ok: true } : fitsLabel(meta.label);
    fitH.set(h, f);
    if (!f.ok) return false;
    if (meta.family === 'joke' && fairTakers(h) < 3) return false;
    return K.takers(h).length >= 1;
  });
  return { words, headings, fitW, fitH };
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Count perfect matchings of a 10x10 bitmask graph: DP over heading masks in a fixed word order. */
const dp = new Float64Array(1 << N);
function count10(adj) {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort((a, b) => popcount(adj[a]) - popcount(adj[b]));
  if (!adj[order[0]]) return 0;
  dp.fill(0); dp[0] = 1;
  for (let mask = 0; mask < (1 << N) - 1; mask++) {
    const v = dp[mask];
    if (!v) continue;
    const i = popcount(mask);
    for (let a = adj[order[i]] & ~mask; a; a &= a - 1) dp[mask | (a & -a)] += v;
  }
  return dp[(1 << N) - 1];
}

export function makeGenerator(K, pool, opts = {}) {
  const rand = rng(opts.seed || 1);
  const W = pool.words, H = pool.headings, nW = W.length, nH = H.length;
  const wIdx = new Map(W.map((w, i) => [w, i])), hIdx = new Map(H.map((h, i) => [h, i]));
  const code = new Uint8Array(nW * nH);
  const homes = W.map(() => []), takers = H.map(() => []);
  for (let j = 0; j < nH; j++) for (let i = 0; i < nW; i++) {
    const c = CODE[K.tier(W[i], H[j])];
    code[i * nH + j] = c;
    if (STRICT(c)) { homes[i].push(j); takers[j].push(i); }
  }
  const fam = H.map((h) => K.family(h));
  // the share of days an item may appear on under the calendar caps (7.6): usage is measured against it
  const ALLOW = { anchor: 1 / 7, property: 1 / 14, joke: 1 / 42, computed: 1 / 14, verb: 2 / 7 };
  const allowH = H.map((h) => ALLOW[K.family(h)] || 1 / 14);
  const allowW = W.map((w) => (K.word(w).engine ? 1 / 30 : 6 / 120));
  // second lives (word:sense on an S cell) and joke pairs (joke heading, word) get ids for usage tracking
  const pairId = new Map();
  const sPair = new Int32Array(nW * nH).fill(-1), jPair = new Int32Array(nW * nH).fill(-1);
  for (let j = 0; j < nH; j++) for (let i = 0; i < nW; i++) {
    const c = code[i * nH + j];
    if (c === 4) { const k = 's|' + W[i] + ':' + (K.cellOf(W[i], H[j]).sense || '*'); if (!pairId.has(k)) pairId.set(k, pairId.size); sPair[i * nH + j] = pairId.get(k); }
    if (c >= 4 && fam[j] === 'joke') { const k = 'j|' + H[j] + '>' + W[i]; if (!pairId.has(k)) pairId.set(k, pairId.size); jPair[i * nH + j] = pairId.get(k); }
  }
  const pairUse = new Float64Array(pairId.size);
  const wordUse = new Float64Array(nW), headUse = new Float64Array(nH);
  if (opts.usage) {
    for (const [w, u] of Object.entries(opts.usage.words || {})) if (wIdx.has(w)) wordUse[wIdx.get(w)] = u;
    for (const [h, u] of Object.entries(opts.usage.headings || {})) if (hIdx.has(h)) headUse[hIdx.get(h)] = u;
    for (const [p, u] of Object.entries(opts.usage.pairs || {})) if (pairId.has(p)) pairUse[pairId.get(p)] = u;
  }
  let made = opts.usage?.boards || 0;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  let want = opts.want || null;
  // day restrictions from the calendar step: words, headings and answer pairs the caps forbid today
  const okW = new Uint8Array(nW).fill(1), okH = new Uint8Array(nH).fill(1), badPair = new Uint8Array(pairId.size);
  function restrict({ words = [], headings = [], pairs = [] } = {}) {
    okW.fill(1); okH.fill(1); badPair.fill(0);
    for (const w of words) if (wIdx.has(w)) okW[wIdx.get(w)] = 0;
    for (const h of headings) if (hIdx.has(h)) okH[hIdx.get(h)] = 0;
    for (const p of pairs) if (pairId.has(p)) badPair[pairId.get(p)] = 1;
  }
  // E1 and E2, precomputed over the pool
  const namedBad = new Uint8Array(nW * nH);
  for (let a = 0; a < nW; a++) for (let b = 0; b < nH; b++) if (names(K.heading(pool.headings[b]).label, K.word(pool.words[a]).text)) namedBad[a * nH + b] = 1;
  const echoGroup = new Int32Array(nH).fill(-1);
  { const ids = new Map(); pool.headings.forEach((h, b) => { const m = K.heading(h); const k = baseNegative(m.negative); if (!k || m.family === 'computed') return; if (!ids.has(k)) ids.set(k, ids.size); echoGroup[b] = ids.get(k); }); }
  const pickOk = (list, ok, n) => {
    for (let t = 0; t < 6 && list.length; t++) { const x = pick(list); if (ok[x]) return x; }
    for (let t = 0; t < 50; t++) { const x = Math.floor(rand() * n); if (ok[x]) return x; }
    return -1;
  };

  function measure(ws, hs) {
    const adj = new Array(N).fill(0), gen = new Array(N).fill(0);
    let arguable = 0;
    for (let a = 0; a < N; a++) {
      const base = ws[a] * nH;
      for (let b = 0; b < N; b++) {
        const c = code[base + hs[b]];
        if (c === 2) arguable++;
        if (STRICT(c)) adj[a] |= 1 << b;
        if (GEN(c)) gen[a] |= 1 << b;
      }
    }
    let clash = 0;
    for (let a = 0; a < N; a++) { const base = ws[a] * nH; for (let b = 0; b < N; b++) if (namedBad[base + hs[b]]) clash++; }
    for (let b = 0; b < N; b++) if (echoGroup[hs[b]] >= 0) for (let c = b + 1; c < N; c++) if (echoGroup[hs[c]] === echoGroup[hs[b]]) clash++;
    let excess = 0, sumDeg = 0;
    for (let a = 0; a < N; a++) { const d = popcount(adj[a]); sumDeg += d; excess += Math.max(0, d - 4) + (d === 0 ? 1 : 0); }
    for (let b = 0; b < N; b++) { let t = 0; for (let a = 0; a < N; a++) if (adj[a] & (1 << b)) t++; excess += Math.max(0, t - 4); }
    const mean = sumDeg / N;
    const count = count10(adj);
    const genCount = count ? count10(gen) : 0;
    let mech = 0, jokes = 0, verbs = 0, props = 0, anchors = 0;
    for (const h of hs) { const f = fam[h]; if (f === 'computed') mech++; else if (f === 'joke') jokes++; else if (f === 'verb') verbs++; else if (f === 'property') props++; else anchors++; }
    let answerO = 0, sPairs = 0, ahaPairs = 0, notL = 0, pairUsage = 0;
    if (count === 1) {
      const m = perfectMatching(adj);
      for (let a = 0; a < N; a++) {
        const cell = ws[a] * nH + hs[m[a]];
        let aha = false;
        if (code[cell] === 4) for (let b = 0; b < N; b++) if (b !== m[a] && code[ws[a] * nH + hs[b]] === 5 && fam[hs[b]] !== 'computed') { aha = true; break; }
        if (sPair[cell] >= 0 && aha) { pairUsage += pairUse[sPair[cell]] / (1 + made / 90); if (badPair[sPair[cell]]) pairUsage += 40; }
        if (jPair[cell] >= 0) { pairUsage += 2 * pairUse[jPair[cell]] / (1 + made / 120); if (badPair[jPair[cell]]) pairUsage += 40; }
        const c = code[cell];
        if (c === 3) answerO++;
        if (c !== 5 || fam[hs[m[a]]] === 'computed') notL++;
        if (c === 4) {
          sPairs++;
          for (let b = 0; b < N; b++) if (b !== m[a] && code[ws[a] * nH + hs[b]] === 5 && fam[hs[b]] !== 'computed') { ahaPairs++; break; }
        }
      }
    }
    const band = Math.max(0, 1.9 - mean) + Math.max(0, mean - 2.6);
    const feasible = clash === 0 && arguable === 0 && excess === 0 && count === 1 && genCount === 1 && mech <= 1 && jokes <= 2 && verbs <= 1 && answerO === 0 && band === 0 && pairUsage < 40;
    // usage against capacity: an item used on more than its allowed share of boards is pushed out
    let usage = 0;
    const denom = Math.max(20, made);
    for (const w of ws) { const r = wordUse[w] / denom / allowW[w]; usage += 0.4 * r + 2 * Math.max(0, r - 0.6) ** 2; }
    for (const h of hs) { const r = headUse[h] / denom / allowH[h]; usage += 0.4 * r + 2 * Math.max(0, r - 0.6) ** 2; }
    // composition the calendar can sustain: about 1 joke, at most 3 properties, the rest anchors
    const composition = 3 * Math.max(0, jokes - 1) + 1.5 * Math.max(0, props - 3) + 0.8 * (mech + verbs) - 0.3 * Math.min(anchors, 6);
    let E = 40 * arguable + 30 * clash + 15 * excess + (count ? 6 * Math.log2(count) + 5 * Math.log2(Math.max(1, genCount)) : 60)
      + 12 * Math.max(0, mech - 1) + 12 * Math.max(0, jokes - 2) + 12 * Math.max(0, verbs - 1) + 20 * answerO + 25 * band - 1.5 * mean
      + (opts.usageWeight ?? 0.6) * usage + (opts.compositionWeight ?? 1) * composition + 1.5 * pairUsage;
    if (count === 1 && want === 'hard') E -= 3 * Math.min(3, ahaPairs) + 1.0 * Math.min(5, notL);
    if (count === 1 && want === 'easy') E += 2 * Math.max(0, ahaPairs - 1) + 0.5 * Math.max(0, notL - 3);
    if (count === 1 && want === 'mid') E -= 2 * Math.min(2, ahaPairs) + 0.5 * Math.min(4, notL);
    return { E, feasible, mean };
  }

  function propose(ws, hs) {
    const tw = ws.slice(), th = hs.slice();
    if (rand() < 0.6) {
      const i = Math.floor(rand() * N);
      const w = pickOk(rand() < 0.75 ? takers[th[Math.floor(rand() * N)]] : [], okW, nW);
      if (w < 0 || tw.includes(w)) return null;
      tw[i] = w;
    } else {
      const j = Math.floor(rand() * N);
      const h = pickOk(rand() < 0.75 ? homes[tw[Math.floor(rand() * N)]] : [], okH, nH);
      if (h < 0 || th.includes(h)) return null;
      th[j] = h;
    }
    return [tw, th];
  }

  function anneal(iters = 6000) {
    // seed: one random heading's neighbourhood
    let ws = [], hs = [];
    const h0 = pickOk([], okH, nH);
    if (h0 < 0) return null;
    hs.push(h0);
    for (let guard = 0; ws.length < N && guard < 2000; guard++) {
      const w = pickOk(rand() < 0.7 && guard < 200 ? takers[hs[Math.floor(rand() * hs.length)]] : [], okW, nW);
      if (w >= 0 && !ws.includes(w)) ws.push(w);
    }
    for (let guard = 0; hs.length < N && guard < 2000; guard++) {
      const h = pickOk(rand() < 0.8 && guard < 200 ? homes[ws[Math.floor(rand() * ws.length)]] : [], okH, nH);
      if (h >= 0 && !hs.includes(h)) hs.push(h);
    }
    if (ws.length < N || hs.length < N) return null;
    let cur = measure(ws, hs), best = null;
    for (let it = 0, T = 3; it < iters; it++, T *= 0.9993) {
      const p = propose(ws, hs);
      if (!p) continue;
      const e = measure(p[0], p[1]);
      if (e.E <= cur.E || rand() < Math.exp((cur.E - e.E) / T)) {
        ws = p[0]; hs = p[1]; cur = e;
        if (e.feasible && (!best || e.E < best.E)) best = { ws: ws.slice(), hs: hs.slice(), E: e.E };
      }
    }
    return best;
  }

  // the deal: split words and headings into the two sections (answer pairs stay together in a section
  // only by chance; the score asks for R5, R6 >= 2 over every tied most-literal filling, an open section 1)
  function sectionScore(a, monday) {
    if (!a || a.strictCount !== 1 || a.s1Fillings < 1) return -Infinity;
    const r6 = a.r6;
    const openBonus = monday ? Math.min(a.s1Fillings, 3) * 0.3 : (a.s1Fillings >= 2 ? 2 : -4) + Math.min(a.s1Fillings, 4) * 0.4;
    return Math.min(r6, 3) * 3 - Math.max(0, r6 - 4) * 2 + openBonus + Math.min(a.path.rounds.length, 4) * 0.5;
  }
  function deal(wsIds, hsIds, monday) {
    const adjM = graphs(K, wsIds, hsIds);
    const m = perfectMatching(adjM.strict);
    const order = [...Array(N).keys()].sort(() => rand() - 0.5);
    let wSec = new Array(N), hSec = new Array(N);
    order.forEach((w, i) => { wSec[w] = i < SIZE ? 0 : 1; hSec[m[w]] = i < SIZE ? 0 : 1; });
    const build = (wsx, hsx) => {
      const Wb = [...wsIds.filter((_, i) => wsx[i] === 0), ...wsIds.filter((_, i) => wsx[i] === 1)];
      const Hb = [...hsIds.filter((_, j) => hsx[j] === 0), ...hsIds.filter((_, j) => hsx[j] === 1)];
      return { W: Wb, H: Hb, a: analyzeBoard(K, Wb, Hb, { requireOpen: !monday }) };
    };
    let cur = build(wSec, hSec), score = sectionScore(cur.a, monday);
    for (let it = 0; it < 250; it++) {
      const w2 = wSec.slice(), h2 = hSec.slice(), arr = rand() < 0.5 ? w2 : h2;
      const i = Math.floor(rand() * N), j = Math.floor(rand() * N);
      if (arr[i] === arr[j]) continue;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const nb = build(w2, h2);
      const sc = sectionScore(nb.a, monday);
      if (sc >= score) { wSec = w2; hSec = h2; cur = nb; score = sc; }
    }
    return cur;
  }

  function note(W2, H2, ans) {
    made++;
    for (const w of W2) wordUse[wIdx.get(w)]++;
    for (const h of H2) headUse[hIdx.get(h)]++;
    if (ans) for (let a = 0; a < N; a++) {
      const cell = wIdx.get(W2[a]) * nH + hIdx.get(H2[ans[a]]);
      if (sPair[cell] >= 0) pairUse[sPair[cell]]++;
      if (jPair[cell] >= 0) pairUse[jPair[cell]]++;
    }
  }

  function one({ want: w = null, sims = 200 } = {}) {
    want = w;
    const fin = anneal();
    if (!fin) return null;
    const wsIds = fin.ws.map((i) => W[i]), hsIds = fin.hs.map((j) => H[j]);
    let d = deal(wsIds, hsIds, false);
    if (!d.a.ok) d = deal(wsIds, hsIds, true);
    const a = analyzeBoard(K, d.W, d.H);
    if (!a.ok) return null;
    const T = graphs(K, d.W, d.H).T;
    const p = playersFor(K, d.W, d.H, T, a.ans, sims);
    return {
      W: d.W, H: d.H, ans: a.ans, bands: bandsFor(a, p), players: p,
      stats: { s1Fillings: a.s1Fillings, literalMoves: a.literalMoves, r6: a.r6, meanDeg: a.meanDeg, maxTakers: a.maxTakers, rounds: a.path.rounds.length, computed: a.computed, jokes: a.jokes, verbs: a.verbs, closedSets: a.closedSets, leftover: a.leftover, aha: a.aha.length, sPairs: a.sPairs.length, oCells: a.oCells, nCells: a.nCells },
    };
  }

  return { anneal, deal, note, one, restrict, W, H, usage: () => ({ boards: made, words: Object.fromEntries(W.map((w, i) => [w, wordUse[i]]).filter(([, u]) => u)), headings: Object.fromEntries(H.map((h, i) => [h, headUse[i]]).filter(([, u]) => u)), pairs: Object.fromEntries([...pairId].map(([k, i]) => [k, pairUse[i]]).filter(([, u]) => u)) }) };
}

/** Generate up to `boards` candidate boards. Each passes every rule; bands come from the players. */
export function generate(K, { seed = 1, boards = 100, want = null, nocomputed = false, skipFit = false, usage = null, maxAnneals = boards * 6, sims = 200, log = () => {} } = {}) {
  const pool = makePool(K, { nocomputed, skipFit });
  const G = makeGenerator(K, pool, { seed, want, usage });
  const out = [], seen = new Set();
  let anneals = 0, finals = 0, rejected = {};
  const t0 = Date.now();
  while (out.length < boards && anneals < maxAnneals) {
    anneals++;
    const fin = G.anneal();
    if (!fin) continue;
    finals++;
    const wsIds = fin.ws.map((i) => G.W[i]), hsIds = fin.hs.map((j) => G.H[j]);
    const key = [...wsIds].sort().join(',') + '|' + [...hsIds].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // try a normal (open) deal first; Monday boards may keep a forced section 1
    let d = G.deal(wsIds, hsIds, false);
    if (!d.a.ok) d = G.deal(wsIds, hsIds, true);
    const a = analyzeBoard(K, d.W, d.H);
    if (!a.ok) { for (const f of a.fails) rejected[f] = (rejected[f] || 0) + 1; continue; }
    const T = graphs(K, d.W, d.H).T;
    const p = playersFor(K, d.W, d.H, T, a.ans, sims);
    const bands = bandsFor(a, p);
    G.note(d.W, d.H, a.ans);
    out.push({
      W: d.W, H: d.H, ans: a.ans, bands, players: p,
      stats: { s1Fillings: a.s1Fillings, literalMoves: a.literalMoves, r6: a.r6, meanDeg: a.meanDeg, maxTakers: a.maxTakers, rounds: a.path.rounds.length, computed: a.computed, jokes: a.jokes, verbs: a.verbs, closedSets: a.closedSets, leftover: a.leftover, aha: a.aha.length, sPairs: a.sPairs.length, oCells: a.oCells, nCells: a.nCells },
    });
    if (out.length % 25 === 0) log(`  ${out.length} boards, ${anneals} anneals, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return { boards: out, anneals, finals, rejected, usage: G.usage(), seconds: (Date.now() - t0) / 1000 };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const K = loadKey(arg('key', new URL('./data/key.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')));
  const usagePath = arg('usage', null);
  const usage = usagePath && existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, 'utf8')) : null;
  const res = generate(K, { seed: Number(arg('seed', 1)), boards: Number(arg('boards', 100)), want: arg('want', null), nocomputed: process.argv.includes('--nocomputed'), usage, sims: Number(arg('sims', 200)), log: console.log });
  const out = arg('out', 'work/candidates.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ key: K.raw.version, seed: Number(arg('seed', 1)), want: arg('want', null), ...res }, null, 0));
  if (usagePath) writeFileSync(usagePath, JSON.stringify(res.usage));
  const tally = {};
  for (const b of res.boards) for (const x of b.bands.length ? b.bands : ['none']) tally[x] = (tally[x] || 0) + 1;
  console.log(`${out}: ${res.boards.length} boards from ${res.anneals} anneals (${res.finals} feasible) in ${res.seconds.toFixed(1)} s; bands ${JSON.stringify(tally)}; rejected after deal ${JSON.stringify(res.rejected)}`);
}
