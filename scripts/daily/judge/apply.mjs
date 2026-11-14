// judge/apply.mjs - turn raw judge answers into proposed tiers and a triage queue for Josh (dossier v2 7.3).
//   node scripts/daily/judge/apply.mjs <raw.jsonl> [<cross-check.jsonl>]
// Per (sense, predicate) cell: the literal P(yes) is the mean of three phrasings (their spread is kept); the
// obviousness answer sets L versus S, and very low obviousness on a true cell sets O. Per (word, heading) cell:
// a reading P(yes) above the threshold on a cell that is not yes makes it n. Thresholds come from
// judge/thresholds.json (fitted to the golden set by fit.mjs). The queue lists every cell where the judge and the
// pilot key disagree, every cell within 0.15 of a threshold, and every cell where Clef-flash and Jev disagree by
// more than 0.3. Nothing is written into the key: Josh rules on the queue, and his rulings go into
// content/recall-overrides.txt like every other decision.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildKey } from '../build-key.mjs';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
export const DEFAULT_T = { yes: 0.6, no: 0.35, obvious: 0.6, obscure: 0.15, reading: 0.25, margin: 0.15 };
export const thresholds = () => { try { return { ...DEFAULT_T, ...JSON.parse(readFileSync(join(HERE, 'judge', 'thresholds.json'), 'utf8')) }; } catch { return DEFAULT_T; } };

export function aggregate(lines) {
  const cells = new Map(), readings = new Map();
  for (const l of lines) {
    const [cell, k] = l.id.split('#');
    if (cell.split('|')[0].includes('.')) { const c = cells.get(cell) || { lit: [], obv: null }; if (+k === 3) c.obv = l.p; else c.lit.push(l.p); cells.set(cell, c); }
    else readings.set(cell, l.p);
  }
  return { cells, readings };
}
export function tierOf(c, T) {
  const p = c.lit.reduce((a, x) => a + x, 0) / c.lit.length;
  const spread = Math.max(...c.lit) - Math.min(...c.lit);
  if (p >= T.yes) return { tier: c.obv !== null && c.obv < T.obscure ? 'O' : c.obv !== null && c.obv >= T.obvious ? 'L' : 'S', p, spread };
  if (p <= T.no) return { tier: 'N', p, spread };
  return { tier: 'A', p, spread };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const [rawPath, crossPath] = process.argv.slice(2);
  if (!rawPath) { console.error('usage: apply.mjs <raw.jsonl> [<cross-check.jsonl>]'); process.exit(2); }
  const read = (p) => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const T = thresholds();
  const A = aggregate(read(rawPath)), X = crossPath ? aggregate(read(crossPath)) : null;
  const { key, words, senseFact } = buildKey({});
  const senseById = new Map(words.flatMap((w) => w.senses.map((s) => [s.id, s])));
  const queue = [];
  let agree = 0, total = 0;
  for (const [id, c] of A.cells) {
    const [sid, pred] = id.split('|');
    const s = senseById.get(sid);
    if (!s) continue;
    const pilot = senseFact(s, pred).tier;
    const j = tierOf(c, T);
    total++;
    const yes = (t) => ['L', 'S', 'O'].includes(t);
    const near = Math.min(Math.abs(j.p - T.yes), Math.abs(j.p - T.no)) < T.margin;
    const cross = X?.cells.get(id) ? tierOf(X.cells.get(id), T) : null;
    const disagree = yes(pilot) !== yes(j.tier) || (pilot === 'A') !== (j.tier === 'A');
    if (!disagree) agree++;
    if (disagree || near || (cross && Math.abs(cross.p - j.p) > 0.3) || j.spread > 0.3) queue.push({ cell: id, pilot, judge: j.tier, p: +j.p.toFixed(3), spread: +j.spread.toFixed(3), cross: cross ? +cross.p.toFixed(3) : null, why: [disagree && 'disagrees with the pilot', near && 'near a threshold', cross && Math.abs(cross.p - j.p) > 0.3 && 'Clef-flash and Jev disagree', j.spread > 0.3 && 'phrasings disagree'].filter(Boolean).join('; ') });
  }
  for (const [id, p] of A.readings) {
    const [w, h] = id.split('|');
    const t = key.cells[h]?.[w]?.[0] || 'N';
    if (p > T.reading && t === 'N') queue.push({ cell: id, pilot: 'N', judge: 'n', p: +p.toFixed(3), why: 'reading question above the threshold' });
  }
  mkdirSync(join(HERE, 'work', 'judge'), { recursive: true });
  const out = join(HERE, 'work', 'judge', 'triage.json');
  writeFileSync(out, JSON.stringify({ thresholds: T, agreement: total ? agree / total : null, queue }, null, 1));
  console.log(`${total} cells judged; agreement with the pilot key on yes/no ${(100 * agree / Math.max(1, total)).toFixed(1)}%; ${queue.length} cells in the triage queue -> ${out}`);
}
