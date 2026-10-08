// calendar.mjs - the calendar step (dossier v2 7.6): a board for each of 90 scheduled days plus 30 reserve
// boards, meeting every cap. Caps are part of the generation energy, not post-filters (U3 7.4): the run is
// built day by day, and for each day the generator is restricted to the words, headings and second lives
// the caps allow given the days already placed, then aimed at that day's band. Every accepted board is
// re-checked against every cap. --keep <calendar.json> keeps each earlier board that is still valid under
// the current key (so an editorial pass only re-opens the days it changed).
//
// Caps (dossier v2 7.1, 7.2, 7.6; "editorial" marks a choice where the dossier is silent):
//   band        each day's board meets that weekday's band; days 1-14 use only the Monday and Tue/Sun bands;
//               reserve boards come from the Tue/Sun band (editorial: a reserve board can land on any weekday,
//               so it should be the gentle middle)
//   words       at most 6 uses in any 365 days; at least 14 days between uses of a word (editorial); engine words
//               (two famous lives: Kiwi, Bass, Club, Date) at least 30 days apart ("at most once a month")
//   aha         a (word, sense) may be an aha at most once in 90 days: an S answer pair whose word has a
//               semantic L home elsewhere on the board (the dossier's rule; 7.6)
//   jokes       a (joke heading, answer word) pair at most once in 120 days; at most 2 joke headings a board
//   spacing     anchors 7 days, properties 14 days, joke headings 42 days, the same computed heading 14 days
//   weekly      (ISO weeks, Monday first) closed-set anchors on at most 1 board; the verb heading on at most 2;
//               computed headings on at most 2, never two days running; the leftover bin on at most 1
// Reserve boards are checked as days 91-120, a continuation of the run.
//
// Run: node scripts/daily/calendar.mjs [--launch 2026-11-02] [--days 90] [--reserve 30] [--seed 1]
//        [--keep scripts/daily/work/calendar.json] [--out scripts/daily/work/calendar.json]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadKey } from './lib/key.mjs';
import { analyzeBoard, graphs } from './lib/analyze.mjs';
import { playersFor, bandsFor } from './lib/players.mjs';
import { makePool, makeGenerator } from './generate.mjs';

export const CAPS = {
  wordGap: 14, engineGap: 30, wordMaxPerYear: 6, secondLifeGap: 90, jokePairGap: 120,
  spacing: { anchor: 7, property: 14, joke: 42 }, computedSameGap: 14,
  weekly: { closed: 1, verb: 2, computed: 2, leftover: 1 }, firstFortnight: 14,
  reserveBands: ['tue'],
};
const WEEKDAY_BAND = ['mon', 'tue', 'wed', 'wed', 'fri', 'wed', 'tue']; // d % 7, day 0 is a Monday
const WANT = { mon: ['easy', null], tue: ['mid', null, 'easy'], wed: ['mid', 'hard', null], fri: ['hard', 'hard', 'mid'] };

export function dayBand(d, days) {
  if (d >= days) return CAPS.reserveBands;
  if (d < CAPS.firstFortnight) return [d % 7 === 0 ? 'mon' : 'tue'];
  return [WEEKDAY_BAND[d % 7]];
}

export function features(K, c) {
  const fam = (h) => K.family(h);
  const sPairs = [], jokePairs = [];
  for (let i = 0; i < 10; i++) {
    const h = c.H[c.ans[i]];
    const cell = K.cellOf(c.W[i], h);
    const litElsewhere = c.H.some((h2, j) => j !== c.ans[i] && fam(h2) !== 'computed' && K.tier(c.W[i], h2) === 'L');
    if (cell.tier === 'S' && litElsewhere) sPairs.push(`${c.W[i]}:${cell.sense || '*'}`);
    if (fam(h) === 'joke') jokePairs.push(`${h}>${c.W[i]}`);
  }
  const comp = c.H.find((h) => fam(h) === 'computed') || null;
  return {
    words: c.W, engine: c.W.filter((w) => K.word(w).engine),
    heads: c.H.map((h) => ({ h, fam: fam(h) })), sPairs, jokePairs,
    computed: comp, leftover: !!c.stats.leftover && !!comp,
    verb: c.H.some((h) => fam(h) === 'verb'), closed: c.H.some((h) => K.heading(h).closedSet),
  };
}

/** The run so far, with every cap as a cost against the placed days. */
export class Run {
  constructor(K, total) { this.K = K; this.total = total; this.F = new Array(total).fill(null); this.B = new Array(total).fill(null); }
  place(d, board) { this.B[d] = board; this.F[d] = features(this.K, board); }
  clear(d) { this.B[d] = null; this.F[d] = null; }
  /** cap violations of board f at day d against every other placed day */
  cost(d, f) {
    let v = 0;
    const engine = new Set(f.engine);
    const why = [];
    let wordUses = new Map();
    for (let e = 0; e < this.total; e++) {
      const g = this.F[e];
      if (!g || e === d) continue;
      const gap = Math.abs(d - e);
      for (const w of f.words) if (g.words.includes(w)) {
        wordUses.set(w, (wordUses.get(w) || 0) + 1);
        if (gap < (engine.has(w) ? CAPS.engineGap : CAPS.wordGap)) { v++; why.push(`word ${w}`); }
      }
      for (const p of f.sPairs) if (gap < CAPS.secondLifeGap && g.sPairs.includes(p)) { v++; why.push(`second life ${p}`); }
      for (const p of f.jokePairs) if (gap < CAPS.jokePairGap && g.jokePairs.includes(p)) { v++; why.push(`joke pair ${p}`); }
      for (const { h, fam } of f.heads) {
        if (!g.heads.some((x) => x.h === h)) continue;
        const sp = fam === 'computed' ? CAPS.computedSameGap : CAPS.spacing[fam] || 0;
        if (gap < sp) { v++; why.push(`${fam} ${h}`); }
      }
    }
    for (const [w, n] of wordUses) if (n + 1 > CAPS.wordMaxPerYear) { v++; why.push(`word ${w} ${n + 1} uses`); }
    const wk = Math.floor(d / 7);
    for (const [prop, cap] of Object.entries(CAPS.weekly)) {
      const has = (x) => (prop === 'computed' ? !!x.computed : x[prop]);
      if (!has(f)) continue;
      let n = 1;
      for (let e = wk * 7; e < Math.min(this.total, wk * 7 + 7); e++) if (e !== d && this.F[e] && has(this.F[e])) n++;
      if (n > cap) { v++; why.push(`weekly ${prop}`); }
    }
    if (f.computed) for (const e of [d - 1, d + 1]) if (this.F[e]?.computed) { v++; why.push('computed two days running'); }
    return { v, why };
  }
  /** what the caps forbid on day d, given the placed days (feeds the generator) */
  restrictions(d) {
    const words = new Set(), headings = new Set(), pairs = new Set();
    const uses = new Map();
    const wk = Math.floor(d / 7);
    let closed = 0, verb = 0, computed = 0;
    for (let e = 0; e < this.total; e++) {
      const g = this.F[e];
      if (!g || e === d) continue;
      const gap = Math.abs(d - e);
      for (const w of g.words) {
        uses.set(w, (uses.get(w) || 0) + 1);
        if (gap < (g.engine.includes(w) ? CAPS.engineGap : CAPS.wordGap)) words.add(w);
      }
      for (const { h, fam } of g.heads) {
        const sp = fam === 'computed' ? CAPS.computedSameGap : CAPS.spacing[fam] || 0;
        if (gap < sp) headings.add(h);
      }
      if (gap < CAPS.secondLifeGap) for (const p of g.sPairs) pairs.add(`s|${p}`);
      if (gap < CAPS.jokePairGap) for (const p of g.jokePairs) pairs.add(`j|${p.replace('>', '>')}`);
      if (Math.floor(e / 7) === wk) { closed += g.closed ? 1 : 0; verb += g.verb ? 1 : 0; computed += g.computed ? 1 : 0; }
    }
    for (const [w, n] of uses) if (n >= CAPS.wordMaxPerYear) words.add(w);
    const K = this.K;
    const all = K.headings;
    if (closed >= CAPS.weekly.closed) for (const h of all) if (K.heading(h).closedSet) headings.add(h);
    if (verb >= CAPS.weekly.verb) for (const h of all) if (K.family(h) === 'verb') headings.add(h);
    if (computed >= CAPS.weekly.computed || this.F[d - 1]?.computed || this.F[d + 1]?.computed) for (const h of all) if (K.family(h) === 'computed') headings.add(h);
    return { words: [...words], headings: [...headings], pairs: [...pairs] };
  }
}

/** Is an earlier board still valid under the current key? Re-derives everything from W and H. */
export function revalidate(K, W, H, sims = 200) {
  try {
    const a = analyzeBoard(K, W, H);
    if (!a.ok) return null;
    const p = playersFor(K, W, H, graphs(K, W, H).T, a.ans, sims);
    return {
      W, H, ans: a.ans, bands: bandsFor(a, p), players: p,
      stats: { s1Fillings: a.s1Fillings, literalMoves: a.literalMoves, r6: a.r6, meanDeg: a.meanDeg, maxTakers: a.maxTakers, rounds: a.path.rounds.length, computed: a.computed, jokes: a.jokes, verbs: a.verbs, closedSets: a.closedSets, leftover: a.leftover, aha: a.aha.length, sPairs: a.sPairs.length, oCells: a.oCells, nCells: a.nCells },
    };
  } catch { return null; }
}

export function buildCalendar(K, { days = 90, reserve = 30, seed = 1, attempts = 600, keep = null, keepUntil = Infinity, log = () => {} } = {}) {
  const total = days + reserve;
  const run = new Run(K, total);
  const pool = makePool(K, {});
  const G = makeGenerator(K, pool, { seed });
  const stats = { kept: 0, built: 0, failed: [], attempts: { mon: [], tue: [], wed: [], fri: [] } };
  // keep earlier boards that are still valid, in day order, as long as they still meet every cap
  if (keep) {
    for (let d = 0; d < total; d++) {
      const prior = d < keepUntil ? keep[d] : null;
      if (!prior) continue;
      const c = revalidate(K, prior.W, prior.H);
      if (!c || !c.bands.some((b) => dayBand(d, days).includes(b))) continue;
      const f = features(K, c);
      if (run.cost(d, f).v) continue;
      run.place(d, c);
      G.note(c.W, c.H, c.ans);
      stats.kept++;
    }
  }
  const t0 = Date.now();
  const keptDays = new Set(run.B.map((b, d) => (b ? d : -1)).filter((d) => d >= 0));
  const backtracks = new Map(), releases = new Map();
  // sequential, so each day's constraints come from the days before it; on failure, clear the two days
  // before it (never a kept board) and refill them in order, up to 4 times per day
  for (let d = 0; d < total; d++) {
    if (run.B[d]) continue;
    const want = dayBand(d, days);
    const keptAhead = [...keptDays].some((e) => e > d && e - d <= 42);
    const budget = (want[0] === 'wed' || want[0] === 'fri' ? attempts * 2 : attempts) / (keptAhead ? 2 : 1);
    G.restrict(run.restrictions(d));
    let placed = false, n = 0;
    for (; n < budget && !placed; n++) {
      const mode = WANT[want[0]][n % WANT[want[0]].length];
      const c = G.one({ want: mode });
      if (!c || !c.bands.some((b) => want.includes(b))) continue;
      const f = features(K, c);
      if (run.cost(d, f).v) continue;
      if (run.B.some((b) => b && b.W.join() === c.W.join() && b.H.join() === c.H.join())) continue;
      run.place(d, c);
      G.note(c.W, c.H, c.ans);
      placed = true;
    }
    stats.attempts[want[0]]?.push(n);
    if (placed) { stats.built++; }
    else {
      // a gap between kept boards is constrained from both sides: release the nearest kept board after it
      const ahead = [...keptDays].filter((e) => e > d && e - d <= 42).sort((a, b) => a - b);
      if (ahead.length && (releases.get(d) || 0) < 8) {
        const e = ahead[0];
        run.clear(e); keptDays.delete(e); stats.kept--;
        releases.set(d, (releases.get(d) || 0) + 1);
        log(`  day ${d + 1}: no board after ${n} attempts; releasing kept day ${e + 1}`);
        d--;
        continue;
      }
      const tries = backtracks.get(d) || 0;
      const back = [d - 1, d - 2].filter((e) => e >= 0 && !keptDays.has(e) && run.B[e]);
      if (tries < 4 && back.length) {
        backtracks.set(d, tries + 1);
        for (const e of back) { run.clear(e); stats.built--; }
        log(`  day ${d + 1}: no board after ${n} attempts; backtracking ${back.length} day(s)`);
        d = Math.min(...back) - 1;
        continue;
      }
      stats.failed.push(d);
    }
    if (d % 10 === 9) log(`  day ${d + 1}/${total}: ${stats.built} built, ${stats.kept} kept, ${stats.failed.length} failed, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // second pass for unfilled days: more attempts, then free a neighbouring day (not a kept board) and retry both
  const fill = (d, tries) => {
    const want = dayBand(d, days);
    G.restrict(run.restrictions(d));
    for (let n = 0; n < tries; n++) {
      const c = G.one({ want: WANT[want[0]][n % WANT[want[0]].length] });
      if (!c || !c.bands.some((b) => want.includes(b))) continue;
      const f = features(K, c);
      if (run.cost(d, f).v) continue;
      run.place(d, c); G.note(c.W, c.H, c.ans);
      return true;
    }
    return false;
  };
  for (const d of [...stats.failed]) {
    let ok = fill(d, attempts * 3);
    for (const e of [d - 1, d + 1, d - 2, d + 2]) {
      if (ok || e < 0 || e >= total || !run.B[e]) continue;
      const saved = run.B[e];
      run.clear(e);
      ok = fill(d, attempts) && fill(e, attempts * 2);
      if (!ok) { if (run.B[d]) run.clear(d); if (!run.B[e]) run.place(e, saved); }
    }
    if (ok) { stats.failed = stats.failed.filter((x) => x !== d); stats.built++; }
  }
  // final audit: every placed board against every cap
  const violations = [];
  for (let d = 0; d < total; d++) {
    if (!run.B[d]) { violations.push({ d, why: ['empty'] }); continue; }
    const c = run.cost(d, run.F[d]);
    if (c.v) violations.push({ d, why: c.why });
    if (!run.B[d].bands.some((b) => dayBand(d, days).includes(b))) violations.push({ d, why: ['band'] });
  }
  return { boards: run.B, violations, stats };
}

export const addDays = (iso, n) => { const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000; return new Date(t).toISOString().slice(0, 10); };

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const K = loadKey(arg('key', join(HERE, 'data', 'key.json')));
  const days = Number(arg('days', 90)), reserve = Number(arg('reserve', 30)), launch = arg('launch', '2026-11-02');
  if (new Date(`${launch}T00:00:00Z`).getUTCDay() !== 1) throw new Error(`launch ${launch} is not a Monday`);
  const keepPath = arg('keep', null);
  let keep = null;
  if (keepPath && existsSync(keepPath)) {
    const prior = JSON.parse(readFileSync(keepPath, 'utf8'));
    keep = [...prior.schedule.map((s) => prior.pool[s.cand]), ...prior.reserveList.map((r) => prior.pool[r.cand])];
  }
  const t0 = Date.now();
  const res = buildCalendar(K, { days, reserve, seed: Number(arg('seed', 1)), attempts: Number(arg('attempts', 600)), keep, keepUntil: Number(arg('keep-until', Infinity)), log: console.log });
  const out = arg('out', join(HERE, 'work', 'calendar.json'));
  mkdirSync(dirname(out), { recursive: true });
  const pool = res.boards.map((b) => b && { W: b.W, H: b.H, ans: b.ans, bands: b.bands, players: b.players, stats: b.stats });
  const schedule = pool.slice(0, days).map((_, d) => ({ date: addDays(launch, d), number: d + 1, band: dayBand(d, days)[0], cand: d }));
  const reserveList = pool.slice(days).map((_, i) => ({ id: `r${String(i + 1).padStart(3, '0')}`, cand: days + i }));
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const attempts = Object.fromEntries(Object.entries(res.stats.attempts).map(([b, xs]) => [b, { days: xs.length, medianAttempts: med(xs), maxAttempts: xs.length ? Math.max(...xs) : null }]));
  writeFileSync(out, JSON.stringify({ key: K.raw.version, launch, days, reserve, caps: CAPS, violations: res.violations, stats: { kept: res.stats.kept, built: res.stats.built, failed: res.stats.failed, attempts }, seconds: (Date.now() - t0) / 1000, schedule, reserveList, pool }));
  console.log(`${out}: ${res.stats.built} built, ${res.stats.kept} kept, ${res.stats.failed.length} unfilled, ${res.violations.length} day(s) with violations in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`attempts per band: ${JSON.stringify(attempts)}`);
  if (res.violations.length) console.log(JSON.stringify(res.violations.slice(0, 10)));
}
