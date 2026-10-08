// pool.mjs - generate a candidate pool over many seeds and modes, then report the yield per weekday band
// (dossier v2 7.7: "a batch should generate several thousand candidates ... then let the calendar step
// choose under the caps"). Usage counts carry across runs, so later seeds lean on underused words.
//
// Run: node scripts/daily/pool.mjs [--seeds 16] [--per 250] [--out scripts/daily/work/candidates]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadKey } from './lib/key.mjs';
import { generate } from './generate.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const K = loadKey(arg('key', join(HERE, 'data', 'key.json')));
const seeds = Number(arg('seeds', 16)), per = Number(arg('per', 250)), out = arg('out', join(HERE, 'work', 'candidates'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// a mix of modes: plain, harder (more second lives in the answer), easier, and no computed headings
const MODES = [{ want: null }, { want: 'hard' }, { want: 'mid' }, { want: null, nocomputed: true }, { want: 'hard', nocomputed: true }, { want: 'easy' }];
let usage = null;
const tally = {}, t0 = Date.now();
let total = 0;
for (let s = 1; s <= seeds; s++) {
  const mode = MODES[(s - 1) % MODES.length];
  const res = generate(K, { seed: 1000 + s, boards: per, want: mode.want, nocomputed: !!mode.nocomputed, usage, sims: 200 });
  usage = res.usage;
  writeFileSync(join(out, `seed${String(s).padStart(2, '0')}.json`), JSON.stringify({ key: K.raw.version, seed: 1000 + s, ...mode, boards: res.boards }));
  for (const b of res.boards) for (const x of b.bands.length ? b.bands : ['none']) tally[x] = (tally[x] || 0) + 1;
  total += res.boards.length;
  console.log(`seed ${s} ${JSON.stringify(mode)}: ${res.boards.length} boards from ${res.anneals} anneals in ${res.seconds.toFixed(0)} s`);
}
console.log(`pool: ${total} boards in ${((Date.now() - t0) / 1000).toFixed(0)} s; eligible per band (a board can fit several): ${JSON.stringify(tally)}`);
