// lib/players.mjs - difficulty from two simulated players (dossier v2 7.6; C1's literal-player method,
// reimplemented in v2-tools/players-v2.mjs and ported here).
// A "consistent guesser" submits, at each check, an arrangement that agrees with every per-half count it
// has seen and uses as many believed memberships as any such arrangement. It never sees colours (there
// are none) and gets 4 checks.
//   literal : believes only L cells (computed headings are believed: their rule is on the label)
//   no-aha  : believes L and S, except the answer's aha pairs (an S answer pair for a word that has a
//             semantic L home elsewhere on the board)
// Deterministic: the RNG is seeded from the board, so a rerun reproduces every number.

function rng(seedStr) {
  let h = 2166136261 >>> 0;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = h || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function simulate(ans, B, sims, rand) {
  const n = 10;
  const U = ans.filter((h, i) => !B[i][h]).length;
  const cands = [], cur = new Array(n), used = new Array(n).fill(false);
  let capped = false;
  const rec = (i, bad) => {
    if (cands.length > 400000) { capped = true; return; }
    if (i === n) { cands.push({ p: cur.slice(), belief: n - bad }); return; }
    for (let s = 0; s < n; s++) if (!used[s]) {
      const nb = bad + (B[i][s] ? 0 : 1);
      if (nb > U) continue;
      used[s] = true; cur[i] = s; rec(i + 1, nb); used[s] = false;
    }
  };
  rec(0, 0);
  const fb = (g, s) => { let a = 0, b = 0; for (let i = 0; i < n; i++) if (g[i] === s[i]) { if (s[i] < 5) a++; else b++; } return a * 10 + b; };
  let w1 = 0, w4 = 0;
  const checksUsed = [0, 0, 0, 0, 0];
  for (let k = 0; k < sims; k++) {
    let pool = cands;
    let solvedAt = 0;
    for (let check = 1; check <= 4; check++) {
      let top = -1; for (const x of pool) if (x.belief > top) top = x.belief;
      const best = pool.filter((x) => x.belief === top);
      const g = best[Math.floor(rand() * best.length)].p;
      const f = fb(g, ans);
      if (f === 55) { solvedAt = check; break; }
      pool = pool.filter((x) => fb(g, x.p) === f);
    }
    checksUsed[solvedAt]++;
    if (solvedAt) { w4++; if (solvedAt === 1) w1++; }
  }
  return { U, candidates: cands.length, capped, w1: w1 / sims, w4: w4 / sims };
}

/** T: tier matrix [w][h]; H: heading ids; ans[w] = heading index; K for isComputed. */
export function playersFor(K, W, H, T, ans, sims = 200) {
  const hasLit = (i) => H.some((h, j) => !K.isComputed(h) && T[i][j] === 'L');
  const literalB = T.map((row) => row.map((t) => t === 'L'));
  const noahaB = T.map((row, i) => row.map((t, j) => {
    if (t === 'L') return true;
    if (t !== 'S') return false;
    return !(ans[i] === j && hasLit(i));
  }));
  const seed = W.join(',') + '|' + H.join(',');
  const literal = simulate(ans, literalB, sims, rng(`lit|${seed}`));
  const noaha = simulate(ans, noahaB, sims, rng(`noaha|${seed}`));
  const r = (x) => Math.round(x * 1000) / 1000;
  return {
    sims,
    literal: { unbelieved: literal.U, w1: r(literal.w1), w4: r(literal.w4) },
    noaha: { unbelieved: noaha.U, w1: r(noaha.w1), w4: r(noaha.w4) },
    capped: literal.capped || noaha.capped,
  };
}

/**
 * Weekday bands (dossier v2 7.6). Returns every band the board is eligible for.
 * Mon: no-aha solves on check 1 in >= 90% and literal within 4 in >= 90%; 0-1 aha; section 1 may be forced.
 * Tue/Sun: literal within 4 >= 90%; section 1 open; 1-2 aha.
 * Wed/Thu/Sat: literal within 4 in 60-90%; open; 1-2 aha.
 * Fri: literal within 4 <= 60% and no-aha within 4 <= 90%; open; 2-3 aha.
 */
export function bandsFor(a, p) {
  const out = [];
  const open = a.s1Fillings >= 2, aha = a.aha.length;
  const L4 = p.literal.w4, N1 = p.noaha.w1, N4 = p.noaha.w4;
  if (a.r6 < 2 || a.maxTakers > 4) return out;
  if (N1 >= 0.9 && L4 >= 0.9 && aha <= 1) out.push('mon');
  if (open && L4 >= 0.9 && aha >= 1 && aha <= 2) out.push('tue');
  if (open && L4 >= 0.6 && L4 < 0.9 && aha >= 1 && aha <= 2) out.push('wed');
  if (open && L4 <= 0.6 && N4 <= 0.9 && aha >= 2 && aha <= 3) out.push('fri');
  return out;
}
