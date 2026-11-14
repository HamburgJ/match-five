// lib/match.mjs - generator-side matching math for Match Five Daily (dossier v2, 3.5).
// Ported from U3's prototype (match-five-daily-design/dossier-tools/m5core.mjs).
//
// A board graph is a bitmask array: adj[w] has bit h set when word w fits heading h.
// n <= 30. The independent test (verify-boards.test.js) shares NO code with this file.

export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
const lowBit = (x) => x & -x;
const bitIndex = (b) => 31 - Math.clz32(b);
export const fullMask = (n) => (n >= 31 ? -1 : (1 << n) - 1);

/** Exact number of perfect matchings: DP over words (fewest options first), memo on the used-heading mask. */
export function countPM(adj, n = adj.length) {
  const order = [...Array(n).keys()].sort((a, b) => popcount(adj[a]) - popcount(adj[b]));
  const memo = new Map();
  const f = (i, used) => {
    if (i === n) return 1;
    const key = used * 32 + i;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let a = adj[order[i]] & ~used; a; a &= a - 1) total += f(i + 1, used | lowBit(a));
    memo.set(key, total);
    return total;
  };
  return f(0, 0);
}

/** All perfect matchings (up to cap) as arrays sol[word] = heading. MRV branching. */
export function enumeratePM(adj, n = adj.length, cap = Infinity) {
  const sol = new Array(n).fill(-1);
  const out = [];
  const rec = (used, remaining) => {
    if (out.length >= cap) return;
    if (remaining === 0) { out.push(sol.slice()); return; }
    let best = -1, bestCnt = 99, bestAvail = 0;
    for (let r = remaining; r; r &= r - 1) {
      const w = bitIndex(lowBit(r));
      const av = adj[w] & ~used;
      const c = popcount(av);
      if (c < bestCnt) { best = w; bestCnt = c; bestAvail = av; if (c === 0) return; }
    }
    for (let a = bestAvail; a; a &= a - 1) {
      const b = lowBit(a);
      sol[best] = bitIndex(b);
      rec(used | b, remaining & ~(1 << best));
      sol[best] = -1;
      if (out.length >= cap) return;
    }
  };
  rec(0, fullMask(n));
  return out;
}

/** Kuhn's augmenting-path maximum matching. Returns match[word] = heading, or null if not perfect. */
export function perfectMatching(adj, n = adj.length) {
  const ownerOf = new Array(n).fill(-1);
  const tryWord = (w, seen) => {
    for (let a = adj[w]; a; a &= a - 1) {
      const s = bitIndex(lowBit(a));
      if (seen[s]) continue;
      seen[s] = true;
      if (ownerOf[s] === -1 || tryWord(ownerOf[s], seen)) { ownerOf[s] = w; return true; }
    }
    return false;
  };
  for (let w = 0; w < n; w++) if (!tryWord(w, new Array(n).fill(false))) return null;
  const match = new Array(n);
  ownerOf.forEach((w, s) => { match[w] = s; });
  return match;
}

/**
 * The uniqueness certificate (U3 Lemma 1). Contract each matched pair (w, M(w)) to a node and draw
 * P -> Q when P's word also fits Q's heading. M is the only perfect matching iff this digraph is
 * acyclic. A topological order (every other word that fits a pair's heading comes earlier) is the
 * certificate; null means an alternating cycle exists (not unique).
 * Kahn's algorithm, smallest index first, so the order is deterministic.
 */
export function uniquenessCertificate(adj, match, n = adj.length) {
  const ownerOf = new Array(n);
  match.forEach((s, w) => { ownerOf[s] = w; });
  const out = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  // edge q -> p when word q also fits p's heading: q must come before p
  for (let p = 0; p < n; p++) {
    const h = match[p];
    for (let q = 0; q < n; q++) if (q !== p && adj[q] & (1 << h)) { out[q].push(p); indeg[p]++; }
  }
  const ready = [];
  for (let w = 0; w < n; w++) if (indeg[w] === 0) ready.push(w);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => a - b);
    const p = ready.shift();
    order.push(p);
    for (const q of out[p]) if (--indeg[q] === 0) ready.push(q);
  }
  return order.length === n ? order : null;
}

/**
 * The forced-move path: a player who sees every true membership and only uses
 * "this word has one open home" (by: 'word') and "this heading has one taker left" (by: 'heading').
 * Each round applies every single available at once. Returns { solved, rounds: [[{w, h, by}]] }.
 */
export function forcedPath(adj, n = adj.length) {
  let wordsLeft = fullMask(n), headsLeft = fullMask(n);
  const rounds = [];
  while (wordsLeft) {
    const place = new Map();
    for (let r = wordsLeft; r; r &= r - 1) {
      const w = bitIndex(lowBit(r));
      const c = adj[w] & headsLeft;
      if (popcount(c) === 1) place.set(w, { w, h: bitIndex(c), by: 'word' });
    }
    for (let r = headsLeft; r; r &= r - 1) {
      const h = bitIndex(lowBit(r));
      let who = -1, cnt = 0;
      for (let q = wordsLeft; q; q &= q - 1) {
        const w = bitIndex(lowBit(q));
        if (adj[w] & (1 << h)) { who = w; cnt++; }
      }
      if (cnt === 1 && !place.has(who)) place.set(who, { w: who, h, by: 'heading' });
    }
    if (!place.size) return { solved: false, rounds };
    const round = [...place.values()].sort((a, b) => a.w - b.w);
    for (const { w, h } of round) { wordsLeft &= ~(1 << w); headsLeft &= ~(1 << h); }
    rounds.push(round);
  }
  return { solved: true, rounds };
}

/** Heap's algorithm over every one of n! orders, no pruning. Returns { visited, count, first }. */
export function bruteForceCount(ok) {
  const n = ok.length;
  const p = [...Array(n).keys()];
  const c = new Array(n).fill(0);
  const fits = () => { for (let w = 0; w < n; w++) if (!ok[w][p[w]]) return false; return true; };
  let count = fits() ? 1 : 0, first = count ? p.slice() : null, visited = 1;
  for (let i = 0; i < n;) {
    if (c[i] < i) {
      const j = i % 2 ? c[i] : 0;
      const t = p[j]; p[j] = p[i]; p[i] = t;
      visited++;
      if (fits()) { count++; if (!first) first = p.slice(); }
      c[i]++; i = 0;
    } else { c[i] = 0; i++; }
  }
  return { visited, count, first };
}
