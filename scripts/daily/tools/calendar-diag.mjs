// tools/calendar-diag.mjs - which caps does a calendar break, and what does the pool look like?
import { readFileSync } from 'node:fs';
import { loadKey } from '../lib/key.mjs';
import { CAPS, features } from '../calendar.mjs';
const K = loadKey(new URL('../data/key.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const cal = JSON.parse(readFileSync(process.argv[2] || 'scripts/daily/work/calendar.json', 'utf8'));
const run = [...cal.schedule.map((s) => s.cand), ...cal.reserveList.map((r) => r.cand)];
const F = run.map((ci) => features(K, cal.pool[ci]));
const v = {};
const bump = (k) => (v[k] = (v[k] || 0) + 1);
const last = new Map();
F.forEach((f, d) => {
  for (const w of f.words) { const k = 'w|' + w; if (last.has(k) && d - last.get(k) < (f.engine.includes(w) ? CAPS.engineGap : CAPS.wordGap)) bump(f.engine.includes(w) ? 'engine word gap' : 'word gap'); last.set(k, d); }
  for (const p of f.sPairs) { const k = 's|' + p; if (last.has(k) && d - last.get(k) < CAPS.secondLifeGap) bump('second life 90d'); last.set(k, d); }
  for (const p of f.jokePairs) { const k = 'j|' + p; if (last.has(k) && d - last.get(k) < CAPS.jokePairGap) bump('joke pair 120d'); last.set(k, d); }
  for (const { h, fam } of f.heads) { const k = 'h|' + h; const gap = fam === 'computed' ? CAPS.computedSameGap : CAPS.spacing[fam]; if (gap && last.has(k) && d - last.get(k) < gap) bump(`${fam} spacing`); last.set(k, d); }
});
for (let wk = 0; wk * 7 < F.length; wk++) { const days = F.slice(wk * 7, wk * 7 + 7); for (const [p, cap] of Object.entries(CAPS.weekly)) { const n = days.filter((f) => (p === 'computed' ? !!f.computed : f[p])).length; if (n > cap) bump(`weekly ${p}`); } }
console.log('violations by cap:', JSON.stringify(v));
// pool composition
const pool = cal.pool.map((c) => features(K, c));
const fam = { anchor: 0, property: 0, joke: 0, verb: 0, computed: 0 };
for (const f of pool) for (const { fam: x } of f.heads) fam[x]++;
console.log('heading families per board (pool mean):', Object.fromEntries(Object.entries(fam).map(([k, x]) => [k, (x / pool.length).toFixed(2)])));
const wc = new Map(), hc = new Map();
for (const f of pool) { for (const w of f.words) wc.set(w, (wc.get(w) || 0) + 1); for (const { h } of f.heads) hc.set(h, (hc.get(h) || 0) + 1); }
console.log(`distinct words in pool ${wc.size}, headings ${hc.size}; top words`, [...wc].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => `${w} ${n}`).join(', '));
console.log('top headings', [...hc].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, n]) => `${h} ${n}`).join(', '));
