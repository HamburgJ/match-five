// tools/show-boards.mjs - print candidate boards for editorial review (one compact block per board).
//   node scripts/daily/tools/show-boards.mjs <candidates.json|calendar.json> [from] [count]
import { readFileSync } from 'node:fs';
import { loadKey } from '../lib/key.mjs';

const K = loadKey(new URL('../data/key.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const [file, from = 0, count = 10] = process.argv.slice(2);
const data = JSON.parse(readFileSync(file, 'utf8'));
let boards = data.boards;
if (!boards && data.schedule) boards = [...data.schedule.map((s) => ({ ...data.pool[s.cand], tag: `${s.date} #${s.number} ${s.band}` })), ...data.reserveList.map((r) => ({ ...data.pool[r.cand], tag: `reserve ${r.id}` }))];
for (const [n, b] of boards.slice(+from, +from + +count).entries()) {
  const W = b.W.map((w) => K.word(w).text), H = b.H.map((h) => K.heading(h).label);
  console.log(`\n#${+from + n} ${b.tag || ''} bands ${b.bands.join(',') || 'none'} | literal4 ${b.players.literal.w4} noaha1 ${b.players.noaha.w1} noaha4 ${b.players.noaha.w4} | aha ${b.stats.aha} s1 ${b.stats.s1Fillings} moves ${b.stats.literalMoves.join('/')}`);
  console.log(`  TOP    ${H.slice(0, 5).join(' | ')}`);
  console.log(`         ${W.slice(0, 5).join(', ')}`);
  console.log(`  BOTTOM ${H.slice(5).join(' | ')}`);
  console.log(`         ${W.slice(5).join(', ')}`);
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const cells = [];
    for (let j = 0; j < 10; j++) {
      const c = K.cellOf(b.W[i], b.H[j]);
      if (c.tier === 'N') continue;
      const mark = b.ans[i] === j ? '*' : '';
      cells.push(`${mark}${H[j]} ${c.tier}${c.text && c.tier !== 'L' ? ` (${c.text})` : ''}`);
    }
    rows.push(`    ${W[i].padEnd(11)} ${cells.join('; ')}`);
  }
  console.log(rows.join('\n'));
}
