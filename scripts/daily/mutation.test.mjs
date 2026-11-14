// mutation.test.mjs - proves the independent test (verify-boards.test.js) catches every corruption listed in
// dossier v2 7.8. Each mutation copies the shipped boards and key to a temp folder, corrupts one thing, and
// keeps everything else consistent (hashes and ledger re-stamped), so only the check under test can see it.
//   1 a false count            2 a hidden second solution     3 an arguable cell        4 a forged proof order
//   5 swapped answers          6 a dead section 1             7 a false par (recorded literal moves)
//   8 a soft-no cell that, flipped, creates a rival arrangement
//   9 a computed heading's misreading that creates a rival (9a: dropped from the key; 9b: rival on a board)
//  10 an O cell that creates a rival (10a), or an O pair in the answer (10b)
//  11 an edited published board (ledger mismatch, 11a), and a schedule entry earlier than createdOn + 2 (11b)
// and four beyond the 7.8 list: 12 a confident no that names the wrong half of a compound heading; 13 a word named
// by a heading on its board (E1); 14 two headings sharing a base predicate (E2); 15 an errata entry that repeats
// the answer
// Run: node scripts/daily/mutation.test.mjs [--boards <dir>] [--key <file>]   (exit 1 if any mutation slips through)
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { puzzleHash, textVersion } from './lib/hash.mjs';

const require = createRequire(import.meta.url);
const { verify } = require('./verify-boards.test.js');
const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BOARDS = arg('boards', join(HERE, '..', '..', 'public', 'daily', 'boards'));
const KEY = arg('key', join(HERE, 'data', 'key.json'));

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'm5-mutation-'));
  cpSync(BOARDS, join(dir, 'boards'), { recursive: true });
  cpSync(KEY, join(dir, 'key.json'));
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const write = (f, x) => writeFileSync(join(dir, f), JSON.stringify(x));
  const index = read('boards/index.json');
  const firstMonth = `boards/${index.months[0]}.json`;
  return { dir, read, write, index, firstMonth };
}
const restamp = (b) => { b.hash = puzzleHash(b); b.textVersion = textVersion(b); };
const cellAt = (b, i, j) => b.cells.find((c) => c[0] === i && c[1] === j);
const setCell = (b, key, i, j, tier, text = null) => {
  const w = b.words[i].id, h = b.headings[j].id;
  b.cells = b.cells.filter((c) => !(c[0] === i && c[1] === j));
  if (tier !== 'N') b.cells.push([i, j, tier, null, text]);
  key.cells[h] ||= {};
  if (tier === 'N') delete key.cells[h][w]; else key.cells[h][w] = [tier, null, text];
};
// two answer pairs whose crossed cells are both N in the key: flipping them creates an alternating 2-cycle
function crossedPair(b) {
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    const hi = b.answer[i], hj = b.answer[j];
    if (!cellAt(b, i, hj) && !cellAt(b, j, hi)) return [i, j];
  }
  return null;
}
// reorder words within a board, re-indexing every reference
function permuteWords(b, perm) { // perm[newIndex] = oldIndex
  const inv = []; perm.forEach((o, n) => { inv[o] = n; });
  b.words = perm.map((o) => b.words[o]);
  b.answer = perm.map((o) => b.answer[o]);
  b.cells = b.cells.map((c) => [inv[c[0]], ...c.slice(1)]);
  b.proofOrder = b.proofOrder.map((o) => inv[o]);
  b.path = b.path.map((r) => r.map(([w, h, by]) => [inv[w], h, by]));
  if (b.nudge !== null) b.nudge = inv[b.nudge];
  if (b.negWhy) for (const row of Object.values(b.negWhy)) { const old = { ...row }; for (const k of Object.keys(row)) delete row[k]; for (const [w, half] of Object.entries(old)) row[inv[w]] = half; }
}
const commit = (ws, d) => { restamp(d); ws.ledger.days[d.date] = d.hash; };
const honestSection1 = (b) => {
  const T = Array.from({ length: 5 }, () => Array(5).fill(false));
  for (const c of b.cells) if (c[0] < 5 && c[1] < 5 && (c[2] === 'L' || c[2] === 'S')) T[c[0]][c[1]] = true;
  const go = (i, used) => (i === 5 ? true : [0, 1, 2, 3, 4].some((s) => !(used & (1 << s)) && T[i][s] && go(i + 1, used | (1 << s))));
  return go(0, 0);
};

const mutations = [
  ['1 a false count', /brute-force record/, (ws, m, d) => { d.bruteForce.strict = 2; }],
  ['2 a hidden second solution', /R2/, (ws, m, d, key) => { const p = crossedPair(d); if (!p) return 'skip'; const [i, j] = p; setCell(d, key, i, d.answer[j], 'L'); setCell(d, key, j, d.answer[i], 'L'); restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['3 an arguable cell', /R1/, (ws, m, d, key) => { const p = crossedPair(d); if (!p) return 'skip'; setCell(d, key, p[0], d.answer[p[1]], 'A', 'arguable (mutation)'); restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['4 a forged proof order', /certificate broken/, (ws, m, d) => { d.proofOrder.reverse(); }],
  ['5 swapped answers', /not the one arrangement|R4/, (ws, m, d) => { [d.answer[0], d.answer[1]] = [d.answer[1], d.answer[0]]; restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['6 a dead section 1', /R5/, (ws, m, d) => {
    for (let i = 0; i < 5; i++) for (let j = 5; j < 10; j++) {
      const perm = [...Array(10).keys()]; perm[i] = j; perm[j] = i;
      const trial = JSON.parse(JSON.stringify(d));
      permuteWords(trial, perm);
      if (!honestSection1(trial)) { Object.assign(d, trial); restamp(d); ws.ledger.days[d.date] = d.hash; return; }
    }
    return 'skip';
  }],
  ['7 a false par', /recorded literal moves/, (ws, m, d) => { d.stats.literalMoves = d.stats.literalMoves.map((x) => x + 1); }],
  ['8 a soft no that creates a rival', /R3/, (ws, m, d, key) => { const p = crossedPair(d); if (!p) return 'skip'; const [i, j] = p; setCell(d, key, i, d.answer[j], 'n', 'some would say yes'); setCell(d, key, j, d.answer[i], 'n', 'some would say yes'); restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['9a a computed misreading dropped from the key', /computed heading/, (ws, m, d, key) => {
    for (const [hid, h] of Object.entries(key.headings)) if (h.family === 'computed') for (const [wid, c] of Object.entries(key.cells[hid] || {})) if (c[0] === 'n') { delete key.cells[hid][wid]; return; }
    return 'skip';
  }],
  ['9b a computed misreading that creates a rival', /R3|computed heading/, (ws, m, d, key, all) => {
    const b = all.find((x) => x.headings.some((h) => h.family === 'computed'));
    if (!b) return 'skip';
    const cj = b.headings.findIndex((h) => h.family === 'computed');
    const ci = b.answer.indexOf(cj);
    for (let i = 0; i < 10; i++) if (i !== ci && !cellAt(b, i, cj) && !cellAt(b, ci, b.answer[i])) {
      setCell(b, key, i, cj, 'n', 'misreading (mutation)'); setCell(b, key, ci, b.answer[i], 'n', 'some would say yes');
      restamp(b); ws.ledger.days[b.date] = b.hash; return;
    }
    return 'skip';
  }],
  ['10a an O cell that creates a rival', /R2/, (ws, m, d, key) => { const p = crossedPair(d); if (!p) return 'skip'; const [i, j] = p; setCell(d, key, i, d.answer[j], 'O', 'obscure (mutation)'); setCell(d, key, j, d.answer[i], 'O', 'obscure (mutation)'); restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['10b an O pair in the answer', /R4/, (ws, m, d, key) => { setCell(d, key, 0, d.answer[0], 'O', 'obscure (mutation)'); restamp(d); ws.ledger.days[d.date] = d.hash; }],
  ['11a an edited published board', /ledger/, (ws, m, d) => { const perm = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9]; permuteWords(d, perm); restamp(d); }],
  ['11b a schedule entry earlier than createdOn + 2', /createdOn/, (ws) => { ws.index.batches[0].createdOn = ws.index.first; }],
  ['12 a confident no naming the wrong half', /negWhy/, (ws, m, d, key, days) => {
    const b = days.find((x) => x.negWhy && Object.values(x.negWhy).some((row) => Object.keys(row).length));
    if (!b) return 'skip';
    const row = Object.values(b.negWhy).find((r) => Object.keys(r).length); const w = Object.keys(row)[0];
    row[w] = row[w] === 'not' ? 'has' : 'not'; commit(ws, b);
  }],
  ['13 a word named by its heading (E1)', /E1/, (ws, m, d, key) => {
    const j = d.headings.findIndex((h) => h.family !== 'computed'); const label = `${d.headings[j].label} ${d.words[0].text.toLowerCase()}`;
    d.headings[j].label = label; key.headings[d.headings[j].id].label = label; commit(ws, d);
  }],
  ['14 two headings sharing a base predicate (E2)', /E2/, (ws, m, d) => {
    const js = d.headings.map((h, j) => j).filter((j) => d.headings[j].family !== 'computed');
    d.headings[js[1]].negative = JSON.parse(JSON.stringify(d.headings[js[0]].negative)); commit(ws, d);
  }],
  ['15 an errata entry repeating the answer', /repeats the answer/, (ws, m, d) => {
    const alt = Object.fromEntries(d.words.map((w, i) => [w.text, d.headings[d.answer[i]].label]));
    ws.write('boards/errata.json', { schema: 1, entries: { [d.date]: { alternates: [alt], note: 'mutation' } } });
  }],
];

let failed = 0;
const control = verify({ boardsDir: BOARDS, keyPath: KEY, mode: 'normal' });
if (control.failures.length) { console.log(`control: the untouched data fails (${control.failures.length}): ${control.failures.slice(0, 5).join(' | ')}`); process.exit(1); }
console.log('control: untouched data passes');
for (const [name, expect, mutate] of mutations) {
  const ws = workspace();
  const m = ws.read(ws.firstMonth);
  const days = Object.values(m.days);
  const d = days[0];
  const key = ws.read('key.json');
  ws.ledger = ws.read('boards/ledger.json');
  const all = readdirSync(join(ws.dir, 'boards')).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).flatMap((f) => (f === ws.firstMonth.slice(7) ? days : Object.values(ws.read(`boards/${f}`).days)));
  const r = mutate(ws, m, d, key, days);
  if (r === 'skip') { console.log(`SKIP ${name}: no suitable board in the first month`); failed++; rmSync(ws.dir, { recursive: true, force: true }); continue; }
  ws.write(ws.firstMonth, m); ws.write('key.json', key); ws.write('boards/ledger.json', ws.ledger); ws.write('boards/index.json', ws.index);
  const res = verify({ boardsDir: join(ws.dir, 'boards'), keyPath: join(ws.dir, 'key.json'), mode: 'normal' });
  const hit = res.failures.find((f) => expect.test(f));
  if (hit) console.log(`caught   ${name}: ${hit.slice(0, 110)}`);
  else { failed++; console.log(`MISSED   ${name}: ${res.failures.length ? res.failures.slice(0, 3).join(' | ') : 'no failure at all'}`); }
  rmSync(ws.dir, { recursive: true, force: true });
}
console.log(failed ? `mutation test: ${failed} of ${mutations.length} mutations not caught` : `mutation test: all ${mutations.length} mutations caught`);
process.exit(failed ? 1 : 0);
