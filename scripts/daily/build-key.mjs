// build-key.mjs - build the word-level key snapshot (data/key.json) from the sense-level content:
//   content/vocab/*.txt   words, senses and per-sense facts (format below)
//   content/classes.json  class taxonomy with inherited default facts
//   content/headings.json heading pools with their membership rules
// Dossier v2 3.4 and 7.3: rows are word senses; a word fits a heading when any sense does; compound
// headings ("Has a head, no brain") are combined per sense, then across senses; negations are combined in
// code from two literal predicates, never judged as negations; computed headings and their misreadings are
// computed. Every cell gets one tier: L, S, O, A, n or N.
//
// Vocabulary format (one word per block; '#' starts a comment):
//   Word | article | flags | note
//     senseId | salience | gloss | classes | facts | wordnet offsets
//     * | word-level facts
// salience: L (the reading most people reach first), S (a fair second sense), O (obscure: caps every cell at O).
// classes: comma list; "class:T" sets the tier of the sense's membership (default L).
// facts: space-separated  pred  pred:T  pred:T"text"  (T in L S O A n N; text is the gloss or the reading).
// word-level facts: verb:T"to egg someone" (the verb heading), @heading-id:T"text" (a cell override from a
// recall pass or the editor, applied after senses are combined).
//
// Run: node scripts/daily/build-key.mjs [--pilot]   writes data/key.json and work/key-report.txt
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { computedTier } from './lib/computed.mjs';
import { slug } from './lib/ids.mjs';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const TIER_RANK = { L: 5, S: 4, A: 3, O: 2, n: 1, N: 0 }; // precedence across senses
const YES_RANK = { L: 3, S: 2, O: 1 };

export function parseVocab(text, file = 'vocab') {
  const words = [];
  let cur = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!line.trim()) return;
    const where = `${file}:${i + 1}`;
    if (!/^\s/.test(line)) {
      const [text, article = '', flags = '', note = ''] = line.split('|').map((s) => s.trim());
      if (!['a', 'an', '-'].includes(article)) throw new Error(`${where}: article must be a, an or - (got "${article}")`);
      cur = { text, id: slug(text), article: article === '-' ? '' : article, flags: flags ? flags.split(/[\s,]+/).filter(Boolean) : [], note, senses: [], wordFacts: {}, where };
      words.push(cur);
      return;
    }
    if (!cur) throw new Error(`${where}: sense line before any word`);
    const parts = line.trim().split('|').map((s) => s.trim());
    if (parts[0] === '*') { Object.assign(cur.wordFacts, parseFacts(parts[1] || '', where)); return; }
    const [sid, salience, gloss, classes = '', facts = '', wn = ''] = parts;
    if (!['L', 'S', 'O'].includes(salience)) throw new Error(`${where}: salience must be L, S or O`);
    if (!gloss) throw new Error(`${where}: sense ${sid} needs a gloss`);
    cur.senses.push({
      id: `${cur.id}.${sid}`, salience, gloss,
      classes: parseClasses(classes, where),
      facts: parseFacts(facts, where), wn: wn ? wn.split(/[\s,]+/).filter(Boolean) : [], where,
    });
  });
  return words;
}

/** "bird:S, fish:S"yes, eels are fish"" -> [{ name, tier, text }] (commas inside quotes are kept). */
export function parseClasses(s, where) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of s) {
    if (ch === '"') inQ = !inQ;
    if (ch === ',' && !inQ) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (inQ) throw new Error(`${where}: unclosed quote in classes`);
  if (cur.trim()) out.push(cur.trim());
  return out.map((c) => {
    const m = /^([a-z0-9-]+)(?::([LSOAnN]))?(?:"([^"]*)")?$/.exec(c);
    if (!m) throw new Error(`${where}: bad class "${c}"`);
    return { name: m[1], tier: m[2] || 'L', text: m[3] ?? null };
  });
}

export function parseFacts(s, where) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    while (s[i] === ' ' || s[i] === '\t') i++;
    if (i >= s.length) break;
    let tok = '';
    while (i < s.length && s[i] !== ' ' && s[i] !== '"') tok += s[i++];
    let text = null;
    if (s[i] === '"') { const end = s.indexOf('"', i + 1); if (end < 0) throw new Error(`${where}: unclosed quote`); text = s.slice(i + 1, end); i = end + 1; }
    if (i < s.length && s[i] !== ' ') throw new Error(`${where}: cannot parse facts near "${s.slice(i - tok.length, i + 20)}"`);
    let pred = tok, tier = 'L';
    const m = /^(.*):([LSOAnN])$/.exec(tok);
    if (m) { pred = m[1]; tier = m[2]; }
    if (pred.startsWith('-')) { pred = pred.slice(1); tier = 'N'; }
    if (!/^@?[a-z0-9][a-z0-9:.-]*$/.test(pred)) throw new Error(`${where}: bad predicate "${pred}"`);
    if (out[pred]) throw new Error(`${where}: ${pred} given twice`);
    out[pred] = { tier, text };
  }
  return out;
}

export function buildKey({ vocabDir = join(HERE, 'content', 'vocab'), classesPath = join(HERE, 'content', 'classes.json'), headingsPath = join(HERE, 'content', 'headings.json'), pilot = true, provenance, factOverride = null, onlyCells = null } = {}) {
  const classes = JSON.parse(readFileSync(classesPath, 'utf8')).classes;
  const pools = JSON.parse(readFileSync(headingsPath, 'utf8'));
  const files = readdirSync(vocabDir).filter((f) => f.endsWith('.txt')).sort();
  const words = files.flatMap((f) => parseVocab(readFileSync(join(vocabDir, f), 'utf8'), f));
  const problems = [];
  // recall-pass decisions: word-level cell overrides and sense facts the draft missed
  const overridesPath = join(vocabDir, '..', 'recall-overrides.txt');
  if (existsSync(overridesPath)) {
    const byText = new Map(words.map((w) => [w.text, w]));
    readFileSync(overridesPath, 'utf8').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/^#.*$/, '');
      if (!line.trim()) return;
      const where = `recall-overrides.txt:${i + 1}`;
      const [target, facts = ''] = line.split('|').map((s) => s.trim());
      const [text, sense] = target.split('.');
      const w = byText.get(text);
      if (!w) { problems.push(`${where}: unknown word ${text}`); return; }
      const add = parseFacts(facts, where);
      const into = sense ? w.senses.find((s) => s.id === `${w.id}.${sense}`)?.facts : w.wordFacts;
      if (!into) { problems.push(`${where}: unknown sense ${target}`); return; }
      for (const [k, v] of Object.entries(add)) {
        if (into[k] && into[k].tier !== 'N') { problems.push(`${where}: ${target} already has ${k}`); continue; }
        into[k] = { ...v, recall: true };
      }
    });
  }
  const seen = new Map();
  for (const w of words) {
    if (seen.has(w.id)) problems.push(`duplicate word ${w.text} (${seen.get(w.id)} and ${w.where})`);
    seen.set(w.id, w.where);
    for (const s of w.senses) {
      if (s.gloss.split(/\s+/).length > 6) problems.push(`${s.where}: gloss over 6 words: ${s.gloss}`);
      for (const c of s.classes) if (!classes[c.name]) problems.push(`${s.where}: unknown class ${c.name}`);
    }
  }
  const chain = (name) => { const out = []; for (let c = name; c; c = classes[c]?.parent) out.push(c); return out; };
  // per-sense fact lookup: explicit, then class tags (is:X), then inherited class defaults (closest first)
  function senseFact(s, pred, raw = false) {
    if (factOverride) { const t = factOverride(s, pred); if (t) return { tier: t, text: null }; }
    if (s.facts[pred]) return s.facts[pred];
    if (pred.startsWith('is:')) {
      // walk each class tag's chain; an explicit class fact (a person is only arguably a 'Mammal') beats
      // structural membership, and both are capped by the tag's own tier
      const target = pred.slice(3);
      let best = null;
      for (const c of s.classes) {
        for (const a of chain(c.name)) {
          const f = classes[a]?.facts?.[pred];
          let cand = null;
          if (f) { const [t, text] = Array.isArray(f) ? f : [f, null]; cand = { tier: raw ? t : capByTag(t, c.tier), text: c.text || text, inherited: true }; }
          else if (a === target) cand = { tier: raw ? 'L' : c.tier, text: c.text };
          if (cand) { if (!best || TIER_RANK[cand.tier] > TIER_RANK[best.tier]) best = cand; break; }
        }
      }
      if (best) return best;
    }
    // inherited defaults, capped by the tier of the class tag that brought them (a sense that is only
    // arguably footwear inherits footwear's facts as arguable at most)
    let best = null;
    for (const c of s.classes) for (const a of chain(c.name)) {
      const f = classes[a]?.facts?.[pred];
      if (!f) continue;
      const [ft, ftext] = Array.isArray(f) ? f : [f, null];
      const t = raw ? ft : capByTag(ft, c.tier);
      if (!best || TIER_RANK[t] > TIER_RANK[best.tier]) best = { tier: t, text: ftext, inherited: true };
      break; // closest class in this tag's chain wins
    }
    return best || { tier: 'N', text: null };
  }
  function capByTag(f, tag) {
    if (tag === 'L' || !YES_RANK[f]) return f;
    if (tag === 'S') return f === 'L' ? 'S' : f;
    if (tag === 'O') return 'O';
    if (f === 'O') return 'O'; // an obscure fact stays obscure
    return tag; // A or n: a yes inherited through an arguable class is arguable (or a soft no)
  }
  const cap = (t, salience) => {
    if (!YES_RANK[t]) return t;
    if (salience === 'O') return 'O';
    if (salience === 'S' && t === 'L') return 'S';
    return t;
  };
  const isAnchorPred = (p) => p.startsWith('is:');
  function evalPred(s, pred, { capped = true } = {}) {
    let f = senseFact(s, pred, !capped);
    // an inherited arguable fact reached through a second sense is a soft no, through an obscure sense a no
    if (capped && f.inherited && f.tier === 'A' && s.salience !== 'L') f = { ...f, tier: s.salience === 'S' ? 'n' : 'N' };
    if (!capped) return f;
    // anchors name the sense's own domain, so the heading points the player at the sense: no salience cap,
    // except that an obscure sense stays O
    if (isAnchorPred(pred)) return { tier: s.salience === 'O' && YES_RANK[f.tier] ? 'O' : f.tier, text: f.text };
    return { tier: cap(f.tier, s.salience), text: f.text };
  }
  // negating the second half: a soft no ('some think bats are birds') leaves a fair yes, capped at S
  const NEG = { L: 'N', S: 'N', O: 'A', A: 'A', n: 'Ysoft', N: 'Y' };
  // a person has a head, a face and a heel, but "Ruler: has a heel" is not a fair answer: a body part
  // reached through a person sense is true but never the answer (O) on a single-predicate heading
  const BODY = new Set(['has:head', 'has:brain', 'has:mouth', 'has:eyes', 'has:eye', 'has:face', 'has:skin', 'has:hands', 'has:hand', 'has:arms', 'has:fingers', 'has:toe', 'has:heel', 'has:foot', 'has:sole', 'has:teeth', 'has:tongue', 'has:neck', 'has:legs', 'has:lip', 'has:nose', 'has:ears', 'has:hair', 'has:back', 'has:spine', 'has:bones', 'has:blood', 'has:heart', 'has:pulse', 'has:whiskers', 'has:beard', 'has:belly', 'has:thumb', 'has:tooth', 'has:pupil']);
  const isPerson = (s) => s.classes.some((c) => chain(c.name).includes('person'));
  function evalHeading(s, def) {
    if (def.is) return evalPred(s, `is:${def.is}`);
    if (def.p) {
      const r = evalPred(s, def.p);
      if (BODY.has(def.p) && isPerson(s) && YES_RANK[r.tier] >= 2) return { tier: 'O', text: s.gloss };
      return r;
    }
    if (def.has) {
      const a = evalPred(s, def.has);
      const b = evalPred(s, def.not, { capped: false });
      const nb = NEG[b.tier];
      if (nb === 'N') return { tier: 'N', text: null, why: YES_RANK[a.tier] || a.tier === 'A' || a.tier === 'n' ? 'not' : 'has' };
      if (nb === 'Y') return a.tier === 'N' ? { tier: 'N', text: null, why: 'has' } : a;
      if (nb === 'Ysoft') return a.tier === 'N' ? { tier: 'N', text: null, why: 'has' } : a.tier === 'L' ? { tier: 'S', text: b.text || a.text } : a;
      return a.tier === 'N' ? { tier: 'N', text: null, why: 'has' } : a.tier === 'n' ? { tier: 'n', text: a.text } : { tier: 'A', text: `arguable: ${def.not.replace(':', ' ')}` };
    }
    throw new Error(`unknown heading def ${JSON.stringify(def)}`);
  }

  // list anchors: explicit member lists (content/anchor-lists.txt); every unlisted word is N
  const lists = {};
  const listsPath = join(vocabDir, '..', 'anchor-lists.txt');
  if (existsSync(listsPath)) {
    const byText = new Map(words.map((w) => [w.text, w]));
    readFileSync(listsPath, 'utf8').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/^#.*$/, '');
      if (!line.trim()) return;
      const where = `anchor-lists.txt:${i + 1}`;
      const [id, members = ''] = line.split('|').map((s) => s.trim());
      lists[id] = {};
      for (const m of members.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim()).filter(Boolean)) {
        const mm = /^([A-Z][A-Za-z-]*)(?::([LSOAnN]))?(?:"([^"]*)")?$/.exec(m);
        if (!mm) { problems.push(`${where}: bad member "${m}"`); continue; }
        const w = byText.get(mm[1]);
        if (!w) { problems.push(`${where}: ${mm[1]} is not in the vocabulary`); continue; }
        lists[id][w.id] = { tier: mm[2] || 'L', text: mm[3] ?? null };
      }
    });
  }
  const headingList = [];
  for (const [family, list] of [['anchor', pools.anchors], ['property', pools.properties], ['joke', pools.jokes], ['verb', pools.verb], ['computed', pools.computed]]) {
    for (const h of list) {
      if (h.status === 'rejected') continue;
      headingList.push({ ...h, family });
    }
  }
  const key = {
    schema: 1, version: null, pilot,
    provenance: provenance || 'Pilot key: senses drafted with Princeton WordNet 3.0 as a recall aid; every tier judged by Claude (model in the loop) standing in for the dossier 7.3 judge, conservatively (anything arguable is A or n). Not reviewed by Josh.',
    words: {}, headings: {}, cells: {}, negWhy: {}, reviewed: {}, coverage: { words: [], headings: [] },
  };
  for (const w of words) {
    key.words[w.id] = { text: w.text, article: w.article, engine: w.flags.includes('engine'), flags: w.flags.filter((f) => f !== 'engine'), excluded: w.flags.includes('exclude') || undefined, senses: Object.fromEntries(w.senses.map((s) => [s.id, { gloss: s.gloss, salience: s.salience, wn: s.wn.length ? s.wn : undefined }])) };
    key.coverage.words.push(w.id);
  }
  for (const h of headingList) {
    key.headings[h.id] = { label: h.label, spoken: h.spoken || h.label, family: h.family, closedSet: h.closedSet || null, rule: h.def.rule || null, negative: h.negative, status: h.status || 'draft' };
    key.coverage.headings.push(h.id);
    const row = {}, why = {};
    for (const w of words) {
      if (onlyCells && !onlyCells.has(`${w.id}|${h.id}`)) continue;
      let best = { tier: 'N', sense: null, text: null }, whyNot = null;
      if (h.def.rule) {
        const c = computedTier(h.def.rule, w.text);
        best = { tier: c.tier, sense: null, text: c.tier === 'N' ? null : c.text };
      } else if (h.def.list) {
        if (!lists[h.def.list]) problems.push(`no member list for ${h.id}`);
        const f = lists[h.def.list]?.[w.id];
        if (f) best = { tier: f.tier, sense: null, text: f.text ?? (YES_RANK[f.tier] && f.tier !== 'L' ? null : null) };
      } else if (h.def.verb) {
        const f = w.wordFacts.verb;
        if (f) best = { tier: f.tier, sense: null, text: f.text };
      } else {
        for (const s of w.senses) {
          const r = evalHeading(s, h.def);
          if (r.tier === 'N') { if (!whyNot || r.why === 'not') whyNot = r.why; continue; }
          if (TIER_RANK[r.tier] > TIER_RANK[best.tier]) best = { tier: r.tier, sense: s.id, text: r.text ?? (YES_RANK[r.tier] ? s.gloss : null), salience: s.salience };
        }
      }
      // a fruit or nut that grows on trees is a soft no for "Tree": "a plum tree"
      if (h.def.is === 'tree' && best.tier === 'N' && w.senses.some((s) => YES_RANK[senseFact(s, 'grows-on-trees').tier] >= 2)) best = { tier: 'n', sense: null, text: 'the tree it grows on' };
      const o = w.wordFacts[`@${h.id}`];
      if (o) best = { tier: o.tier, sense: best.sense, text: o.text ?? best.text, override: true };
      if (o && o.tier === 'N') ((key.reviewed[h.id] ||= {})[w.id] = o.text || 'reviewed');
      if (best.tier !== 'N') {
        const obv = best.tier === 'L' ? 0.9 : best.tier === 'S' ? (best.salience === 'S' ? 0.3 : 0.55) : best.tier === 'O' ? 0.1 : undefined;
        row[w.id] = obv === undefined ? [best.tier, best.sense, best.text] : [best.tier, best.sense, best.text, obv];
        if ((best.tier === 'S' || best.tier === 'O') && !best.text) problems.push(`${w.text} x ${h.label}: ${best.tier} cell without a gloss`);
      } else if (whyNot === 'not') why[w.id] = 'not';
    }
    key.cells[h.id] = row;
    if (Object.keys(why).length) key.negWhy[h.id] = why;
  }
  // unused word-level overrides point at headings that do not exist
  const allIds = new Set([...pools.anchors, ...pools.properties, ...pools.jokes, ...pools.verb, ...pools.computed].map((h) => h.id));
  for (const w of words) for (const k of Object.keys(w.wordFacts)) if (k.startsWith('@') && !allIds.has(k.slice(1))) problems.push(`${w.where}: override for unknown heading ${k}`);
  key.version = createHash('sha256').update(JSON.stringify({ w: key.words, h: key.headings, c: key.cells })).digest('hex').slice(0, 12);
  return { key, words, headingList, problems, classes, senseFact, evalHeading };
}

export async function blocklistPass(key) {
  const src = join(HERE, '..', '..', '..', '..', 'functions', 'api', 'renames.ts');
  if (!existsSync(src)) return { checked: false, reason: 'functions/api/renames.ts not found (run inside the burgerfun checkout)' };
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const vm = await import('node:vm');
  const code = readFileSync(src, 'utf8');
  const out = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ctx = { exports: {}, Response, Request, URL, crypto: globalThis.crypto };
  vm.runInNewContext(out, ctx);
  const strings = [];
  for (const w of Object.values(key.words)) { if (w.excluded) continue; strings.push(w.text); for (const s of Object.values(w.senses)) strings.push(s.gloss); }
  for (const h of Object.values(key.headings)) { strings.push(h.label); if (typeof h.negative === 'string') strings.push(h.negative); else strings.push(h.negative.has, h.negative.not); }
  for (const row of Object.values(key.cells)) for (const [wid, c] of Object.entries(row)) if (c[2] && !key.words[wid].excluded) strings.push(c[2]);
  const hits = strings.filter((s) => ctx.exports.isBlocked(s));
  return { checked: true, source: 'functions/api/renames.ts isBlocked', sourceSha256: createHash('sha256').update(code).digest('hex').slice(0, 16), strings: strings.length, hits };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const { key, problems } = buildKey({ pilot: !process.argv.includes('--release') });
  const bl = await blocklistPass(key);
  key.blocklist = { checked: bl.checked, source: bl.source, sourceSha256: bl.sourceSha256, hits: bl.hits?.length ?? null };
  if (bl.hits?.length) problems.push(`blocklisted strings: ${bl.hits.join(' | ')}`);
  mkdirSync(join(HERE, 'data'), { recursive: true });
  mkdirSync(join(HERE, 'work'), { recursive: true });
  writeFileSync(join(HERE, 'data', 'key.json'), JSON.stringify(key));
  const tiers = { L: 0, S: 0, O: 0, A: 0, n: 0 };
  for (const row of Object.values(key.cells)) for (const c of Object.values(row)) tiers[c[0]]++;
  const senses = Object.values(key.words).reduce((a, w) => a + Object.keys(w.senses).length, 0);
  const summary = `key ${key.version}: ${key.coverage.words.length} words (${senses} senses) x ${key.coverage.headings.length} headings; L ${tiers.L}, S ${tiers.S}, O ${tiers.O}, A ${tiers.A}, n ${tiers.n}; blocklist ${bl.checked ? `checked ${bl.strings} strings, ${bl.hits.length} hits` : bl.reason}`;
  writeFileSync(join(HERE, 'work', 'key-report.txt'), [summary, ...problems].join('\n') + '\n');
  console.log(summary);
  if (problems.length) { console.log(`${problems.length} problem(s):`); for (const p of problems.slice(0, 60)) console.log('  ' + p); process.exitCode = 1; }
}
