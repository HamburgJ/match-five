// wordnet/recall.mjs - link drafted senses to WordNet synsets and run the WordNet recall passes
// (dossier v2 7.3: "a missing entry is never evidence of no"; the shipped game's errors were all
// forgotten members). Nothing here changes the key: it writes a review list, and every finding is
// resolved by editing content/vocab (a fact, an n or O cell, or an explicit N with a reason).
//
//   link     each drafted sense -> the WordNet noun synset of the same lemma whose lexicographer file fits
//            the sense's classes, best gloss overlap first (unlinked senses are editor senses: slang, brands)
//   anchors  every WordNet noun sense of every vocabulary word that sits under an anchor's synset
//            (bird.n.01, tool.n.01, ...) while the key says N for that word and anchor
//   verbs    every vocabulary word with a WordNet verb sense in frame 9 ("Somebody ----s somebody")
//            while the key says N for "You can ___ someone"
//   parts    WordNet part meronyms (wing, head, neck, ...) of a linked sense or its hypernyms whose
//            'Has a ...' heading the key holds as N
//
// Run: node scripts/daily/wordnet/recall.mjs [wordnet dict dir]   (default: $WORDNET_DIR or the local
//      NLTK copy of Princeton WordNet 3.0)  -> work/wordnet-links.json, work/recall-wordnet.txt
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openWordNet } from './wn.mjs';
import { buildKey } from '../build-key.mjs';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const dir = process.argv[2] || process.env.WORDNET_DIR || 'D:/Github/match-five-daily-design/wordnet-pwn30/wordnet';
if (!existsSync(join(dir, 'data.noun'))) { console.error(`no WordNet dictionary at ${dir}`); process.exit(2); }
const wn = openWordNet(dir);
const { key, words, classes } = buildKey({});

// which lexicographer files a class's senses may live in
const LEX = {
  animal: ['noun.animal'], plant: ['noun.plant'], food: ['noun.food', 'noun.plant'], 'body-part': ['noun.body', 'noun.animal'],
  object: ['noun.artifact'], person: ['noun.person'], place: ['noun.location', 'noun.artifact', 'noun.object', 'noun.group'],
  weather: ['noun.phenomenon', 'noun.process'], sport: ['noun.act'], dance: ['noun.act'], 'card-game': ['noun.act'],
  shape: ['noun.shape', 'noun.artifact'], 'unit-length': ['noun.quantity'], 'unit-weight': ['noun.quantity'], 'unit-time': ['noun.time'],
  month: ['noun.time'], planet: ['noun.object'], gem: ['noun.substance', 'noun.artifact'], metal: ['noun.substance', 'noun.artifact'],
  material: ['noun.substance', 'noun.object', 'noun.artifact'], 'body-of-water': ['noun.object', 'noun.location'], 'card-suit': ['noun.artifact'],
  sound: ['noun.attribute', 'noun.event', 'noun.communication', 'noun.phenomenon'], abstract: null, coin: ['noun.artifact', 'noun.possession'],
};
const root = (c) => { let x = c; while (classes[x]?.parent) x = classes[x].parent; return x; };
const lexFor = (s) => {
  const out = new Set();
  for (const c of s.classes) { const r = LEX[c.name] ?? LEX[root(c.name)]; if (r === null) return null; for (const l of r || []) out.add(l); }
  return out.size ? out : null;
};
const tokens = (t) => new Set(t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((x) => x.length > 2 && !['the', 'and', 'for', 'with', 'that', 'your', 'from', 'used', 'any', 'one', 'part'].includes(x)));

const links = {}, unlinked = [];
for (const w of words) {
  const lemma = w.text.toLowerCase();
  const cands = wn.senses(lemma);
  const taken = new Set();
  for (const s of w.senses) {
    const lex = lexFor(s);
    const mine = tokens(`${s.gloss} ${s.classes.map((c) => c.name).join(' ')}`);
    let best = null;
    for (const c of cands) {
      if (lex && !lex.has(c.lex)) continue;
      const theirs = tokens(`${c.gloss} ${c.words.join(' ')}`);
      let score = 0;
      for (const t of mine) if (theirs.has(t)) score += 2;
      score += Math.min(3, c.tags) * 0.5 - c.n * 0.05 - (taken.has(c.offset) ? 3 : 0);
      if (!best || score > best.score) best = { ...c, score };
    }
    if (best) { links[s.id] = { offset: best.offset, lex: best.lex, gloss: best.gloss, score: best.score }; taken.add(best.offset); }
    else unlinked.push(`${w.text}: ${s.id.split('.')[1]} (${s.gloss})`);
  }
}

const ANCHOR_SYNSETS = {
  bird: ['bird.n.01'], fish: ['fish.n.01'], mammal: ['mammal.n.01'], insect: ['insect.n.01'], reptile: ['reptile.n.01'], snake: ['snake.n.01'],
  fruit: ['edible_fruit.n.01'], vegetable: ['vegetable.n.01'], tree: ['tree.n.01'], flower: ['flower.n.01'], nut: ['edible_nut.n.01'],
  'herb-or-spice': ['herb.n.02', 'spice.n.02'], drink: ['beverage.n.01'], dessert: ['dessert.n.01'], bread: ['bread.n.01'], sandwich: ['sandwich.n.01'],
  tool: ['tool.n.01', 'hand_tool.n.01'], weapon: ['weapon.n.01'], 'musical-instrument': ['musical_instrument.n.01'], 'body-part': ['body_part.n.01', 'external_body_part.n.01'],
  gemstone: ['gem.n.02', 'precious_stone.n.01'], metal: ['metallic_element.n.01', 'metal.n.01'], coin: ['coin.n.01'], clothing: ['clothing.n.01'],
  footwear: ['footwear.n.01', 'footwear.n.02'], hat: ['hat.n.01'], furniture: ['furniture.n.01'], vehicle: ['vehicle.n.01'], boat: ['boat.n.01', 'ship.n.01'],
  container: ['container.n.01'], 'kitchen-tool': ['kitchen_utensil.n.01', 'cutlery.n.02'], toy: ['plaything.n.01'], 'computer-part': ['peripheral.n.01', 'computer_memory.n.01'],
  weather: ['atmospheric_phenomenon.n.01', 'weather.n.01'], 'body-of-water': ['body_of_water.n.01'], sport: ['sport.n.01'], dance: ['dance.n.01', 'social_dancing.n.01'],
  'card-game': ['card_game.n.01'], shape: ['shape.n.02', 'plane_figure.n.01'], 'unit-of-length': ['linear_unit.n.01'], 'unit-of-weight': ['weight_unit.n.01', 'mass_unit.n.01'],
  'unit-of-time': ['time_unit.n.01'], 'dog-breed': ['dog.n.01'], 'bird-of-prey': ['bird_of_prey.n.01'], 'golf-equipment': ['golf_equipment.n.01'],
  'baseball-equipment': ['baseball_equipment.n.01'], 'chess-piece': ['chessman.n.01'], planet: ['planet.n.01'], month: ['calendar_month.n.01'],
};
const anchorOffsets = Object.fromEntries(Object.entries(ANCHOR_SYNSETS).map(([h, names]) => [h, names.map((n) => wn.named(n)).filter(Boolean)]));
const tier = (w, h) => (key.reviewed[h]?.[w] ? 'reviewed' : key.cells[h]?.[w]?.[0] || 'N');
const findings = [];
for (const w of words) {
  if (w.flags.includes('exclude')) continue;
  const lemma = w.text.toLowerCase();
  for (const c of wn.senses(lemma)) {
    const anc = wn.ancestors(c.offset);
    for (const [h, offs] of Object.entries(anchorOffsets)) {
      if (!key.headings[h] || !offs.length) continue;
      if (offs.some((o) => anc.has(o) || o === c.offset) && tier(w.id, h) === 'N') findings.push(`anchor  ${w.text} x ${key.headings[h].label}: WordNet sense ${c.n} [${c.lex}] "${c.gloss.slice(0, 80)}" (tags ${c.tags})`);
    }
  }
  for (const v of wn.senses(lemma, 'v')) {
    if (v.frames.includes(9) && tier(w.id, 'you-can-someone') === 'N') { findings.push(`verb    ${w.text} x You can ___ someone: verb sense ${v.n} frame 9 "${v.gloss.slice(0, 80)}" (tags ${v.tags})`); break; }
  }
}
// parts: WordNet part meronyms of each linked synset (and its hypernyms, up to 3 levels)
const partHeadings = {};
for (const [h, meta] of Object.entries(key.headings)) {
  const m = /^Has (?:a |an )?([a-z]+)/.exec(meta.label);
  if (m && meta.family !== 'computed') (partHeadings[m[1]] ||= []).push(h);
}
for (const w of words) {
  if (w.flags.includes('exclude')) continue;
  const seen = new Set();
  for (const s of w.senses) {
    const link = links[s.id];
    if (!link) continue;
    const queue = [[link.offset, 0]];
    while (queue.length) {
      const [o, depth] = queue.shift();
      const syn = wn.synset('n', o);
      if (!syn) continue;
      for (const p of syn.ptrs) {
        if (p.sym === '%p') {
          const part = wn.synset('n', p.off);
          for (const lemma of part.words) {
            const base = lemma.toLowerCase().replace(/_/g, ' ');
            for (const cand of [base, base.endsWith('s') ? base.slice(0, -1) : `${base}s`]) {
              for (const h of partHeadings[cand] || []) {
                const k = `${w.id}|${h}`;
                if (seen.has(k) || tier(w.id, h) !== 'N' || key.negWhy[h]?.[w.id] === 'not') continue;
                seen.add(k);
                findings.push(`part    ${w.text} (${s.id.split('.')[1]}) x ${key.headings[h].label}: WordNet says ${syn.words[0]} has part "${base}"`);
              }
            }
          }
        }
        if ((p.sym === '@' || p.sym === '@i') && depth < 1) queue.push([p.off, depth + 1]);
      }
    }
  }
}
writeFileSync(join(HERE, 'work', 'wordnet-links.json'), JSON.stringify(links, null, 1));
writeFileSync(join(HERE, 'work', 'recall-wordnet.txt'), [`WordNet recall pass (${dir}), key ${key.version}`, `linked senses: ${Object.keys(links).length}; editor senses (no WordNet link): ${unlinked.length}`, '', ...findings, '', 'unlinked (editor) senses:', ...unlinked].join('\n') + '\n');
console.log(`linked ${Object.keys(links).length} senses, ${unlinked.length} editor senses; ${findings.length} findings -> work/recall-wordnet.txt`);
