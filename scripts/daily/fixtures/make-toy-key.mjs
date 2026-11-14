// fixtures/make-toy-key.mjs - converts the dossier v2 toy key (54 words x 31 headings, hand-judged,
// match-five-daily-design/v2-tools/v2-matrix.json) into the key snapshot format, plus the three worked
// boards of dossier 3.10. Used only to check the pipeline reproduces the dossier's proven numbers.
// Run once: node scripts/daily/fixtures/make-toy-key.mjs <path to v2-matrix.json> <path to examples-v2.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { slug } from '../lib/ids.mjs';
import { computedTier } from '../lib/computed.mjs';

const [mPath = 'D:/Github/match-five-daily-design/v2-tools/v2-matrix.json', ePath = 'D:/Github/match-five-daily-design/v2-tools/examples-v2.json'] = process.argv.slice(2);
const M = JSON.parse(readFileSync(mPath, 'utf8'));
const E = JSON.parse(readFileSync(ePath, 'utf8'));
const RULE = { 'Three letters': 'letters-3', 'Same letter twice in a row': 'double-adjacent' };
const NEG = {
  'Has a head, no brain': { has: 'has no head', not: 'has a brain' },
  'Has a mouth, can\'t eat': { has: 'has no mouth', not: 'can eat' },
  'Has teeth, can\'t bite': { has: 'has no teeth', not: 'can bite' },
  'Has a tongue, can\'t taste': { has: 'has no tongue', not: 'can taste' },
  'Has ears, can\'t hear': { has: 'has no ears', not: 'can hear' },
  'Has an eye, can\'t see': { has: 'has no eye', not: 'can see' },
  'Has a spine, no bones': { has: 'has no spine', not: 'has bones' },
  'Has keys, opens nothing': { has: 'has no keys', not: 'opens something' },
};
const negative = (label) => NEG[label] || (/^(Can|Lays|Has|Grows)/.test(label)
  ? label.replace(/^Can /, "can't ").replace(/^Lays /, "doesn't lay ").replace(/^Has /, 'has no ').replace(/^Grows /, "doesn't grow ")
  : `isn't a ${label.toLowerCase()}`);
const family = (label) => RULE[label] ? 'computed' : label === 'You can ___ someone' ? 'verb' : NEG[label] ? 'joke'
  : /^(Can|Lays|Has|Grows)/.test(label) ? 'property' : 'anchor';
const mass = new Set(['Corn']);
const words = {}, headings = {}, cells = {};
for (const w of M.words) words[slug(w)] = { text: w, article: mass.has(w) ? '' : /^[aeiou]/i.test(w) ? 'an' : 'a', engine: ['Kiwi', 'Bass', 'Club', 'Date'].includes(w), senses: {} };
for (const [label, t] of Object.entries(M.categories)) {
  const hid = slug(label);
  headings[hid] = { label, spoken: label.replace('___', 'blank'), family: family(label), closedSet: ['Card suit', 'Chess piece'].includes(label) ? slug(label) : null, rule: RULE[label] || null, negative: negative(label), status: 'toy' };
  const row = {};
  if (RULE[label]) {
    for (const w of M.words) { const c = computedTier(RULE[label], w); if (c.tier !== 'N') row[slug(w)] = [c.tier, null, c.text]; }
  } else {
    for (const tier of ['L', 'S', 'O', 'A', 'n']) for (const w of t[tier]) {
      const text = tier === 'S' || tier === 'O' ? M.gloss[`${w}|${label}`] : tier === 'n' ? (M.why[`${w}|${label}`] || 'v1 soft no') : tier === 'A' ? 'arguable (toy key)' : null;
      row[slug(w)] = [tier, null, text];
    }
  }
  cells[hid] = row;
}
const key = { schema: 1, version: 'toy-v2', pilot: true, provenance: 'dossier v2 toy key (hand-judged), converted by fixtures/make-toy-key.mjs', words, headings, cells, coverage: { words: Object.keys(words), headings: Object.keys(headings) } };
writeFileSync(new URL('./toy-key.json', import.meta.url), JSON.stringify(key, null, 1));
const boards = E.boards.map((b) => ({ id: b.id, W: b.sections.flatMap((s) => s.words).map(slug), H: b.sections.flatMap((s) => s.slots).map(slug), answer: b.answer.map(([w, h]) => [slug(w), slug(h)]), proofOrder: b.proofOrder?.map(slug) }));
writeFileSync(new URL('./toy-boards.json', import.meta.url), JSON.stringify({ boards }, null, 1));
console.log(`toy key: ${Object.keys(words).length} words x ${Object.keys(headings).length} headings; ${boards.length} worked boards`);
