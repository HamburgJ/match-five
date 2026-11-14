// build-golden.mjs - choose the 300-cell golden set Josh rules on (dossier v2 7.3, 9.5). The judge's thresholds are
// fitted to his rulings, and the 60 `obvious` cells are the kill line (more than 15% disagreement stops a batch).
// Semantic cells only: computed headings are computed, and the verb heading comes from WordNet frame 9 plus the
// editor (its word list is a separate task for Josh). Hand-picked hard cases come first; strata are then filled
// from the key with a fixed seed, so a rerun picks the same cells.
// Run: node scripts/daily/build-golden.mjs   -> content/golden-set.json (keeps any rulings already filled in)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const key = JSON.parse(readFileSync(join(HERE, 'data', 'key.json'), 'utf8'));
const H = JSON.parse(readFileSync(join(HERE, 'content', 'headings.json'), 'utf8'));
const defs = Object.fromEntries([...H.anchors, ...H.properties, ...H.jokes].map((h) => [h.id, h.def]));
const tierOf = (w, h) => key.cells[h]?.[w]?.[0] || 'N';
const textOf = (w, h) => key.cells[h]?.[w]?.[2] || null;
const predsOf = (h) => { const d = defs[h]; return d.is ? [`is:${d.is}`] : d.p ? [d.p] : d.has ? [d.has, d.not] : []; };
let s = 20261008;
const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// hand-picked: the hard cases the critiques and the pilot review found
const PICKED = [
  ['bass', 'lays-eggs', 'second-sense'], ['calf', 'body-part', 'second-sense'], ['bay', 'herb-or-spice', 'second-sense'], ['club', 'has-a-head-no-brain', 'joke'],
  ['crane', 'can-fly', 'second-sense'], ['kiwi', 'bird', 'second-sense'], ['palm', 'has-a-trunk', 'second-sense'], ['iris', 'body-part', 'second-sense'],
  ['pump', 'footwear', 'second-sense'], ['boa', 'has-feathers', 'second-sense'], ['monitor', 'reptile', 'second-sense'], ['sole', 'fish', 'second-sense'],
  ['hammer', 'body-part', 'obscure'], ['kite', 'bird', 'obscure'], ['turtle', 'bird', 'obscure'], ['bass', 'has-a-head-no-brain', 'obscure'],
  ['snail', 'has-horns', 'obscure'], ['dolphin', 'has-a-beak', 'obscure'], ['queen', 'lays-eggs', 'obscure'], ['harp', 'has-pedals', 'obscure'],
  ['tomato', 'fruit', 'arguable'], ['horse', 'has-fur', 'arguable'], ['sock', 'footwear', 'arguable'], ['boot', 'clothing', 'arguable'],
  ['coral', 'gemstone', 'arguable'], ['banana', 'grows-on-trees', 'arguable'], ['turkey', 'can-fly', 'arguable'], ['viper', 'lays-eggs', 'arguable'],
  ['ship', 'vehicle', 'arguable'], ['trampoline', 'toy', 'arguable'], ['butterfly', 'sport', 'arguable'], ['pot', 'kitchen-tool', 'arguable'],
  ['bat', 'bird', 'soft-no'], ['dog', 'dog-breed', 'soft-no'], ['guppy', 'lays-eggs', 'soft-no'], ['rabbit', 'rodent', 'soft-no'],
  ['mole', 'rodent', 'soft-no'], ['plum', 'tree', 'soft-no'], ['scorpion', 'lays-eggs', 'soft-no'], ['eel', 'snake', 'soft-no'],
  ['frog', 'reptile', 'soft-no'], ['whale', 'fish', 'soft-no'], ['kiwi', 'can-fly', 'soft-no'], ['peach', 'has-fur', 'soft-no'],
  ['bat', 'has-wings-isn-t-a-bird', 'joke'], ['doll', 'has-a-mouth-can-t-eat', 'joke'], ['piano', 'has-keys-no-locks', 'joke'], ['scorpion', 'can-sting-isn-t-an-insect', 'joke'],
  ['jar', 'has-a-mouth-can-t-eat', 'joke'], ['comb', 'has-teeth-can-t-bite', 'joke'], ['crab', 'has-teeth-can-t-bite', 'joke'], ['elephant', 'has-teeth-can-t-bite', 'joke'],
  ['river', 'has-a-bed-can-t-sleep', 'joke'], ['bottle', 'has-a-neck-can-t-swallow', 'joke'], ['clock', 'has-hands-can-t-clap', 'joke'], ['ape', 'has-hands-can-t-clap', 'joke'],
  ['needle', 'has-an-eye-can-t-see', 'joke'], ['storm', 'has-an-eye-can-t-see', 'joke'], ['potato', 'has-eyes-can-t-see', 'joke'], ['corn', 'has-ears-can-t-hear', 'joke'],
  ['penguin', 'has-feathers-can-t-fly', 'joke'], ['kiwi', 'has-feathers-can-t-fly', 'joke'], ['dolphin', 'has-fins-isn-t-a-fish', 'joke'], ['coin', 'has-a-face-isn-t-alive', 'joke'],
  ['ruler', 'has-a-heel', 'person'], ['fan', 'has-a-neck', 'person'], ['king', 'has-a-crown', 'person'], ['knight', 'mammal', 'person'], ['shark', 'mammal', 'person'],
  ['boot', 'part-of-a-car', 'regional'], ['bonnet', 'part-of-a-car', 'regional'], ['jaguar', 'vehicle', 'brand'], ['penguin', 'has-a-spine-no-bones', 'brand'], ['apple', 'computer-part', 'brand'],
  ['catapult', 'toy', 'regional'], ['jumper', 'clothing', 'regional'], ['jelly', 'dessert', 'regional'], ['squash', 'drink', 'regional'],
  ['colt', 'male-animal', 'list'], ['peacock', 'male-animal', 'list'], ['egg', 'baby-animal', 'list'], ['hog', 'male-animal', 'list'], ['snail', 'shellfish', 'list'],
  ['plum', 'colour', 'colour'], ['salmon', 'colour', 'colour'], ['lemon', 'colour', 'colour'], ['steel', 'colour', 'colour'], ['coral', 'colour', 'colour'],
  ['car', 'container', 'recall'], ['slug', 'weapon', 'recall'], ['horse', 'chess-piece', 'recall'], ['clove', 'flower', 'recall'], ['nutmeg', 'grows-on-trees', 'recall'],
  ['rattlesnake', 'lays-eggs', 'recall'], ['swordfish', 'has-scales', 'recall'], ['crab', 'has-eight-legs', 'recall'], ['car', 'has-pedals', 'recall'], ['ball', 'dance', 'recall'],
];
const STRATA = [ // [category, tier filter, family filter, count]
  ['obvious', ['L'], ['anchor', 'property'], 30],
  ['obvious', ['N'], ['anchor', 'property', 'joke'], 30],
  ['second-sense', ['S'], ['anchor', 'property'], 30],
  ['obscure', ['O'], ['anchor', 'property', 'joke'], 22],
  ['arguable', ['A'], ['anchor', 'property', 'joke'], 30],
  ['soft-no', ['n'], ['anchor', 'property', 'joke'], 25],
  ['joke', ['L', 'S'], ['joke'], 35],
];
const prior = existsSync(join(HERE, 'content', 'golden-set.json')) ? JSON.parse(readFileSync(join(HERE, 'content', 'golden-set.json'), 'utf8')).cells : [];
const rulings = new Map(prior.map((c) => [`${c.word}|${c.heading}`, c]));
const out = [], seen = new Set();
const add = (w, h, category) => {
  const k = `${w}|${h}`;
  if (seen.has(k) || !key.words[w] || !key.headings[h] || key.words[w].excluded) return false;
  seen.add(k);
  const old = rulings.get(k);
  out.push({ word: w, heading: h, wordText: key.words[w].text, label: key.headings[h].label, category, predicates: predsOf(h), pilot: tierOf(w, h), pilotText: textOf(w, h), ruling: old?.ruling ?? null, note: old?.note ?? '' });
  return true;
};
for (const [w, h, cat] of PICKED) add(w, h, cat);
const words = Object.keys(key.words).filter((w) => !key.words[w].excluded);
const fam = (h) => key.headings[h].family;
for (const [cat, tiers, fams, n] of STRATA) {
  const pool = [];
  for (const h of Object.keys(key.headings)) if (fams.includes(fam(h)) && key.headings[h].status !== 'rejected') for (const w of words) if (tiers.includes(tierOf(w, h))) pool.push([w, h]);
  // obvious N cells: keep them plausible (a word whose family overlaps the heading's), not 'a diamond lays eggs'
  const filtered = tiers[0] === 'N' ? pool.filter(([w, h]) => Object.values(key.cells).some((row) => row[w]) && (key.cells[h] && Object.keys(key.cells[h]).length > 3)) : pool;
  let added = 0;
  for (const [w, h] of shuffle(filtered)) { if (added >= n) break; if (add(w, h, cat)) added++; }
}
while (out.length > 300) out.pop();
const counts = out.reduce((a, c) => ((a[c.category] = (a[c.category] || 0) + 1), a), {});
writeFileSync(join(HERE, 'content', 'golden-set.json'), JSON.stringify({
  about: 'The golden set (dossier v2 7.3): 300 cells for Josh to rule on with y (yes, a fair answer), n (no), a (arguable: could go either way) or o (true but obscure). Fill `ruling` on each cell; add a `note` when the cell needs a reason. The judge\'s thresholds are fitted to these rulings (judge/fit.mjs); the cells with category `obvious` are the kill line. `pilot` is the M1 lane\'s pilot judgment, for comparison only.',
  keyVersion: key.version, counts, cells: out,
}, null, 1));
console.log(`golden set: ${out.length} cells ${JSON.stringify(counts)}`);
