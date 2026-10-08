// publish.mjs - write a calendar's boards into public/daily/boards/ (format: README "Board files").
//   index.json        launch, first and last dates, months, batches, reserve count, pilot flag
//   YYYY-MM.json      one month of scheduled boards, keyed by date
//   reserve.json      the reserve pool, append-only, each board with addedOn = its batch's createdOn
//   ledger.json       date -> board hash and reserve id -> board hash; published days never change (7.6, 8.2)
//   errata.json       accepted alternate arrangements per date (7.9); created empty, never overwritten
// Each board gets its 10! brute-force record (3.5) here. A real batch may only ADD ledger entries; a pilot
// ledger (pilot: true) is replaced wholesale, because pilot boards are never served.
//
// Run: node scripts/daily/publish.mjs --key scripts/daily/data/key.json --calendar scripts/daily/work/calendar.json
//        --batch pilot-1 --created-on 2026-10-08 [--pilot] [--out public/daily/boards]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadKey } from './lib/key.mjs';
import { publishedBoard } from './lib/board.mjs';
import { addDays } from './calendar.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const K = loadKey(arg('key', 'scripts/daily/data/key.json'));
const cal = JSON.parse(readFileSync(arg('calendar', 'scripts/daily/work/calendar.json'), 'utf8'));
const out = arg('out', 'public/daily/boards');
const batch = arg('batch', 'pilot-1'), createdOn = arg('created-on'), pilot = process.argv.includes('--pilot');
if (!/^\d{4}-\d{2}-\d{2}$/.test(createdOn || '')) throw new Error('--created-on YYYY-MM-DD is required');
if (cal.violations.length) throw new Error(`calendar has ${cal.violations.length} violation(s); not publishing`);
mkdirSync(out, { recursive: true });

const ledgerPath = join(out, 'ledger.json');
const oldLedger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null;
const replaceAll = !oldLedger || oldLedger.pilot;
if (!replaceAll && pilot) throw new Error('refusing to write pilot boards over a real ledger');
const ledger = replaceAll ? { schema: 1, pilot, days: {}, reserve: {} } : oldLedger;

const t0 = Date.now();
const build = (c, extra) => {
  const b = publishedBoard(K, c.W, c.H, { players: c.players, bands: c.bands, pilot, brute: true });
  return { ...extra, ...b };
};
const months = {};
for (const s of cal.schedule) {
  const c = cal.pool[s.cand];
  const weekday = new Date(`${s.date}T00:00:00Z`).getUTCDay(); // 5 = Friday
  const b = build(c, { date: s.date, number: s.number, batch, band: s.band, harder: weekday === 5 && c.bands.includes('fri') });
  if (!replaceAll && ledger.days[s.date] && ledger.days[s.date] !== b.hash) throw new Error(`${s.date} is published and frozen; write an errata entry instead`);
  ledger.days[s.date] = b.hash;
  (months[s.date.slice(0, 7)] ||= {})[s.date] = b;
}
const reserveBoards = cal.reserveList.map((r) => build(cal.pool[r.cand], { id: r.id, batch, addedOn: createdOn }));
let reserve = reserveBoards;
if (!replaceAll && existsSync(join(out, 'reserve.json'))) {
  const old = JSON.parse(readFileSync(join(out, 'reserve.json'), 'utf8')).boards;
  const next = old.length;
  reserve = [...old, ...reserveBoards.map((b, i) => ({ ...b, id: `r${String(next + i + 1).padStart(3, '0')}` }))];
}
for (const b of reserve) {
  if (!replaceAll && ledger.reserve[b.id] && ledger.reserve[b.id] !== b.hash) throw new Error(`reserve ${b.id} is frozen`);
  ledger.reserve[b.id] = b.hash;
}
if (replaceAll) for (const f of readdirSync(out)) if (/^\d{4}-\d{2}\.json$/.test(f)) rmSync(join(out, f));
for (const [month, days] of Object.entries(months)) {
  const file = join(out, `${month}.json`);
  const prev = !replaceAll && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).days : {};
  writeFileSync(file, JSON.stringify({ schema: 1, pilot, month, days: { ...prev, ...days } }));
}
writeFileSync(join(out, 'reserve.json'), JSON.stringify({ schema: 1, pilot, boards: reserve }));
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
if (!existsSync(join(out, 'errata.json'))) writeFileSync(join(out, 'errata.json'), JSON.stringify({ schema: 1, entries: {} }, null, 1));
const oldIndex = !replaceAll && existsSync(join(out, 'index.json')) ? JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')) : null;
const allDates = Object.keys(ledger.days).sort();
const index = {
  schema: 1, pilot,
  note: pilot ? 'PILOT DATA: boards from a pilot key judged by a model standing in for the judge (dossier v2 7.3). Not reviewed by Josh. Not for launch.' : undefined,
  keyVersion: K.raw.version,
  launch: oldIndex ? oldIndex.launch : cal.launch,
  first: allDates[0], last: allDates[allDates.length - 1],
  months: [...new Set(allDates.map((d) => d.slice(0, 7)))],
  batches: [...(oldIndex ? oldIndex.batches : []), { id: batch, createdOn, first: cal.schedule[0].date, last: cal.schedule[cal.schedule.length - 1].date, days: cal.schedule.length, reserve: reserveBoards.length }],
  reserve: { file: 'reserve.json', count: reserve.length, pick: 'fnv1a32(date) mod count of boards with addedOn <= date - 2 days' },
  ledger: 'ledger.json', errata: 'errata.json',
};
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));
console.log(`published ${cal.schedule.length} days (${index.first} to ${index.last}) and ${reserve.length} reserve boards to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s${pilot ? ' (PILOT)' : ''}`);
console.log(`runway past the last batch's createdOn: ${Math.round((Date.parse(index.last) - Date.parse(createdOn)) / 86400000)} days; ends ${addDays(index.last, 0)}`);
