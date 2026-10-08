// tools/inspect-key.mjs - print key rows for review.
//   node scripts/daily/tools/inspect-key.mjs heading <id...>     every non-N cell of each heading, by tier
//   node scripts/daily/tools/inspect-key.mjs word <id...>        every non-N cell of each word
//   node scripts/daily/tools/inspect-key.mjs takers              fair (L/S) takers per heading, fewest first
import { readFileSync } from 'node:fs';

const key = JSON.parse(readFileSync(new URL('../data/key.json', import.meta.url), 'utf8'));
const [mode, ...ids] = process.argv.slice(2);
const fmt = (c) => `${c[0]}${c[2] ? ` (${c[2]})` : ''}`;
if (mode === 'heading') {
  for (const h of ids) {
    const row = key.cells[h];
    if (!row) { console.log(`${h}: no such heading`); continue; }
    console.log(`== ${key.headings[h].label} [${key.headings[h].family}]`);
    for (const t of ['L', 'S', 'O', 'A', 'n']) {
      const xs = Object.entries(row).filter(([, c]) => c[0] === t);
      if (xs.length) console.log(`  ${t}: ${xs.map(([w, c]) => key.words[w].text + (c[2] && t !== 'L' ? ` (${c[2]})` : '')).join(', ')}`);
    }
  }
} else if (mode === 'word') {
  for (const w of ids) {
    if (!key.words[w]) { console.log(`${w}: no such word`); continue; }
    console.log(`== ${key.words[w].text}: ${Object.entries(key.words[w].senses).map(([s, x]) => `${s.split('.')[1]} (${x.salience}) ${x.gloss}`).join('; ')}`);
    for (const [h, row] of Object.entries(key.cells)) if (row[w]) console.log(`  ${key.headings[h].label}: ${fmt(row[w])}`);
  }
} else if (mode === 'takers') {
  const rows = Object.entries(key.cells).map(([h, row]) => [h, Object.entries(row).filter(([, c]) => c[0] === 'L' || c[0] === 'S').length, Object.keys(row).length]);
  rows.sort((a, b) => a[1] - b[1]);
  for (const [h, fair, any] of rows) console.log(`${String(fair).padStart(4)} fair  ${String(any).padStart(4)} non-N  ${key.headings[h].family.padEnd(9)} ${key.headings[h].label}`);
} else console.log('usage: inspect-key.mjs heading|word|takers ...');
