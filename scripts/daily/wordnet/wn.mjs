// wordnet/wn.mjs - a small reader for WordNet 3.0 dictionary files (data.noun, index.noun, data.verb,
// index.verb, index.sense, lexnames). Open English WordNet keeps the same structure, so the same reader
// works on an OEWN WNDB export. Used by the content tools only; nothing at runtime reads WordNet.
// Princeton WordNet 3.0: "WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved."
// (licence: permission to use, copy, modify and distribute, with the notice; see wordnet/LICENSE-WORDNET.txt)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function openWordNet(dir) {
  const lexnames = readFileSync(join(dir, 'lexnames'), 'utf8').trim().split(/\r?\n/).map((l) => l.split(/\s+/)[1]);
  const data = { n: readFileSync(join(dir, 'data.noun'), 'latin1'), v: readFileSync(join(dir, 'data.verb'), 'latin1') };
  const index = { n: new Map(), v: new Map() };
  for (const pos of ['n', 'v']) {
    const file = readFileSync(join(dir, pos === 'n' ? 'index.noun' : 'index.verb'), 'latin1');
    for (const line of file.split('\n')) {
      if (!line || line.startsWith(' ')) continue;
      const f = line.trim().split(' ');
      const synsetCnt = +f[2], pCnt = +f[3];
      const offsets = f.slice(4 + pCnt + 2, 4 + pCnt + 2 + synsetCnt);
      index[pos].set(f[0], offsets);
    }
  }
  const tagCount = new Map(); // `${lemma}|${pos}|${offset}` -> tag count
  for (const line of readFileSync(join(dir, 'index.sense'), 'latin1').split('\n')) {
    if (!line) continue;
    const [key, off, , cnt] = line.split(' ');
    const lemma = key.slice(0, key.indexOf('%'));
    const ssType = key[key.indexOf('%') + 1];
    const pos = ssType === '1' ? 'n' : ssType === '2' ? 'v' : null;
    if (pos) tagCount.set(`${lemma}|${pos}|${off}`, +cnt);
  }
  const cache = new Map();
  function synset(pos, offset) {
    const k = pos + offset;
    if (cache.has(k)) return cache.get(k);
    const at = data[pos].indexOf(`\n${offset} `);
    if (at < 0) return null;
    const line = data[pos].slice(at + 1, data[pos].indexOf('\n', at + 1));
    const [head, gloss] = [line.slice(0, line.indexOf(' | ')), line.slice(line.indexOf(' | ') + 3)];
    const f = head.split(' ');
    const lex = lexnames[+f[1]];
    const wCnt = parseInt(f[3], 16);
    const words = [];
    for (let i = 0; i < wCnt; i++) words.push(f[4 + i * 2].replace(/\(.*\)$/, ''));
    let p = 4 + wCnt * 2;
    const pCnt = +f[p++];
    const ptrs = [];
    for (let i = 0; i < pCnt; i++, p += 4) ptrs.push({ sym: f[p], off: f[p + 1], pos: f[p + 2] });
    const frames = [];
    if (pos === 'v' && f[p]) { const fc = +f[p++]; for (let i = 0; i < fc; i++, p += 3) frames.push(+f[p + 1]); }
    const s = { pos, offset, lex, words, ptrs, frames, gloss: gloss.trim() };
    cache.set(k, s);
    return s;
  }
  /** Hypernym closure (offsets) of a noun synset, including instance hypernyms. */
  function ancestors(offset) {
    const out = new Set(), stack = [offset];
    while (stack.length) {
      const o = stack.pop();
      const s = synset('n', o);
      if (!s) continue;
      for (const p of s.ptrs) if ((p.sym === '@' || p.sym === '@i') && !out.has(p.off)) { out.add(p.off); stack.push(p.off); }
    }
    return out;
  }
  function senses(lemma, pos = 'n') {
    const offs = index[pos].get(lemma.toLowerCase().replace(/ /g, '_')) || [];
    return offs.map((off, i) => {
      const s = synset(pos, off);
      return { n: i + 1, offset: off, lex: s.lex, words: s.words, gloss: s.gloss, frames: s.frames, tags: tagCount.get(`${lemma.toLowerCase()}|${pos}|${off}`) || 0, ptrs: s.ptrs };
    });
  }
  /** Resolve "bird.n.01" style names to offsets. */
  function named(name) {
    const [lemma, pos, num] = name.split('.');
    const offs = index[pos].get(lemma) || [];
    return offs[+num - 1] || null;
  }
  return { synset, senses, ancestors, named, lexnames };
}
