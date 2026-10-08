// judge/fit.mjs - fit the judge's thresholds to Josh's golden-set rulings and apply the kill line (dossier 7.3, 9.7).
//   node scripts/daily/judge/fit.mjs <golden-run.jsonl>
// Reads content/golden-set.json (Josh fills `ruling` with y, n, a or o on each cell). For every point on a small
// grid of thresholds it rebuilds the golden cells from the judge's answers with the same per-sense combination
// code the key uses, and counts agreement with Josh. The best point is written to judge/thresholds.json.
// Kill line: if, at the best point, the judge disagrees with Josh on more than 15% of the cells marked
// `obvious`, the judge is not fit for the batch: the script says so and exits 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildKey } from '../build-key.mjs';
import { aggregate, tierOf, DEFAULT_T } from './apply.mjs';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const raw = process.argv[2];
if (!raw) { console.error('usage: fit.mjs <golden-run.jsonl>'); process.exit(2); }
const goldenArg = process.argv.indexOf('--golden');
const golden = JSON.parse(readFileSync(goldenArg > 0 ? process.argv[goldenArg + 1] : join(HERE, 'content', 'golden-set.json'), 'utf8')).cells.filter((c) => c.ruling);
if (!golden.length) { console.error('no rulings yet: Josh fills `ruling` in content/golden-set.json first'); process.exit(2); }
const A = aggregate(readFileSync(raw, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const only = new Set(golden.map((g) => `${g.word}|${g.heading}`));
const RULING = { y: ['L', 'S'], n: ['N', 'n'], a: ['A'], o: ['O'] };
function score(T) {
  const factOverride = (s, pred) => { const c = A.cells.get(`${s.id}|${pred}`); return c ? tierOf(c, T).tier : null; };
  const { key } = buildKey({ factOverride, onlyCells: only });
  let agree = 0, obvious = 0, obviousAgree = 0;
  for (const g of golden) {
    let t = key.cells[g.heading]?.[g.word]?.[0] || 'N';
    const rp = A.readings.get(`${g.word}|${g.heading}`);
    if (t === 'N' && rp !== undefined && rp > T.reading) t = 'n';
    const ok = RULING[g.ruling].includes(t);
    if (ok) agree++;
    if (g.category === 'obvious') { obvious++; if (ok) obviousAgree++; }
  }
  return { agree: agree / golden.length, obviousMiss: obvious ? 1 - obviousAgree / obvious : 0 };
}
let best = null;
for (const yes of [0.5, 0.55, 0.6, 0.65, 0.7]) for (const no of [0.25, 0.3, 0.35, 0.4]) for (const obvious of [0.5, 0.6, 0.7]) for (const obscure of [0.1, 0.15, 0.2]) for (const reading of [0.2, 0.25, 0.3]) {
  if (no >= yes) continue;
  const T = { ...DEFAULT_T, yes, no, obvious, obscure, reading };
  const s = score(T);
  if (!best || s.agree > best.s.agree) best = { T, s };
}
writeFileSync(join(HERE, 'judge', 'thresholds.json'), JSON.stringify({ ...best.T, fittedOn: new Date().toISOString().slice(0, 10), goldenCells: golden.length, agreement: best.s.agree }, null, 1));
console.log(`best thresholds ${JSON.stringify(best.T)}: agreement ${(100 * best.s.agree).toFixed(1)}%, misses on obvious cells ${(100 * best.s.obviousMiss).toFixed(1)}%`);
if (best.s.obviousMiss > 0.15) { console.log('KILL LINE: the judge disagrees with Josh on more than 15% of the obvious golden cells. Do not judge a batch with it.'); process.exit(1); }
