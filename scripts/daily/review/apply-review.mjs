// review/apply-review.mjs - writes Josh's exported review decisions (review.html, "Copy my decisions") into content/.
//   node scripts/daily/review/apply-review.mjs <decisions.json> [--dry-run]
// golden  { "word|heading": "y"|"n"|"a"|"o" }          -> content/golden-set.json `ruling` (the judge is fitted to these)
// jokes   { id: { v: "keep"|"cut"|"rewrite", label } } -> content/headings.json: keep = status "approved"; cut = status
//                                                        "rejected"; rewrite = the new label, status "draft" (R10 and
//                                                        the taker count are checked again on the next pool)
// verbs   { word: "keep"|"cut" }                      -> cut: an override that makes the verb cell O (true, so it still
//                                                        counts for uniqueness, but never the answer); keep: recorded
// boards  { date: "ok"|"flag" }, boardNotes { date }   -> content/review-board-flags.json, for the next calendar review
// The whole export is archived in content/review-decisions/<exportedAt>.json. Rerun build-key.mjs afterwards.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const C = join(HERE, 'content');
const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file) { console.log('usage: node scripts/daily/review/apply-review.mjs <decisions.json> [--dry-run]'); process.exit(1); }
const d = JSON.parse(readFileSync(file, 'utf8'));
const key = JSON.parse(readFileSync(join(HERE, 'data', 'key.json'), 'utf8'));
if (d.keyVersion !== key.version) console.log(`note: decisions were made on key ${d.keyVersion}; the key is now ${key.version}. Cells are matched by word and heading id.`);
const log = [];

// golden set
const golden = JSON.parse(readFileSync(join(C, 'golden-set.json'), 'utf8'));
let ruled = 0;
for (const c of golden.cells) {
  const r = (d.golden || {})[`${c.word}|${c.heading}`];
  if (r && ['y', 'n', 'a', 'o'].includes(r)) { c.ruling = r; ruled++; }
}
log.push(`golden: ${ruled} of ${golden.cells.length} cells ruled`);

// joke headings
const H = JSON.parse(readFileSync(join(C, 'headings.json'), 'utf8'));
const counts = { keep: 0, cut: 0, rewrite: 0 };
for (const j of H.jokes) {
  const x = (d.jokes || {})[j.id];
  if (!x || !x.v) continue;
  if (x.v === 'keep') { j.status = 'approved'; counts.keep++; }
  if (x.v === 'cut') { j.status = 'rejected'; j.note = `cut by Josh in review${j.note ? `; earlier: ${j.note}` : ''}`; counts.cut++; }
  if (x.v === 'rewrite' && x.label && x.label.trim()) {
    j.note = `rewritten by Josh from "${j.label}"${j.note ? `; earlier: ${j.note}` : ''}`;
    j.label = x.label.trim();
    delete j.status;
    counts.rewrite++;
  }
}
log.push(`jokes: ${counts.keep} kept, ${counts.cut} cut, ${counts.rewrite} rewritten (rewrites keep their predicates; check the def matches the new wording)`);

// verb heading: tone cuts become O overrides
const cuts = Object.entries(d.verbs || {}).filter(([, v]) => v === 'cut').map(([w]) => w);
const keeps = Object.entries(d.verbs || {}).filter(([, v]) => v === 'keep').length;
const row = key.cells['you-can-someone'] || {};
const lines = cuts.filter((w) => key.words[w]).map((w) => `${key.words[w].text} | @you-can-someone:O"${(row[w] && row[w][2]) || `to ${key.words[w].text.toLowerCase()} someone`}"`);
log.push(`verbs: ${keeps} kept, ${cuts.length} cut for tone (O: still counted for uniqueness, never the answer)`);

// boards
const flags = Object.fromEntries(Object.entries(d.boards || {}).map(([date, v]) => [date, { verdict: v, note: (d.boardNotes || {})[date] || '' }]));
log.push(`boards: ${Object.values(flags).filter((f) => f.verdict === 'ok').length} ok, ${Object.values(flags).filter((f) => f.verdict === 'flag').length} flagged`);

if (dry) { console.log(log.join('\n')); console.log('(dry run: nothing written)'); process.exit(0); }
writeFileSync(join(C, 'golden-set.json'), JSON.stringify(golden, null, 1) + '\n');
writeFileSync(join(C, 'headings.json'), JSON.stringify(H, null, 1) + '\n');
if (lines.length) appendFileSync(join(C, 'recall-overrides.txt'), `\n# ${new Date().toISOString().slice(0, 10)} Josh's review: verbs cut for tone (true, so O)\n${lines.join('\n')}\n`);
writeFileSync(join(C, 'review-board-flags.json'), JSON.stringify(flags, null, 1) + '\n');
mkdirSync(join(C, 'review-decisions'), { recursive: true });
writeFileSync(join(C, 'review-decisions', `${String(d.exportedAt || Date.now()).replace(/[:.]/g, '-')}.json`), JSON.stringify(d, null, 1) + '\n');
console.log(log.join('\n'));
console.log('written. Next: node scripts/daily/build-key.mjs, then the judge fit (judge/fit.mjs --golden) once the judge has run.');
