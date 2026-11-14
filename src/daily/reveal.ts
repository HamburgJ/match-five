// The card's generated text (DOSSIER-v2 6.1): today's second lives, the answer
// list and the miss lines. Everything comes from the key; there is no free text.
import type { DailyBoard } from './types';
import { cellKey, fitsStrict, headingsOf, ownerOf, repeatedLetter, tierOf } from './board';

export interface PairLine {
  word: string;
  heading: string;
  gloss: string | null;
}

/** Each S pair in the answer, with its gloss, in heading order. */
export const secondLives = (b: DailyBoard): PairLine[] =>
  headingsOf(b)
    .map((h) => ownerOf(b, h))
    .filter((w) => tierOf(b, w, b.answer[w]) === 'S')
    .map((w) => ({ word: w, heading: b.answer[w], gloss: b.gloss[cellKey(w, b.answer[w])] || null }));

/** The other answer pairs, in heading order. */
export const plainPairs = (b: DailyBoard): PairLine[] =>
  headingsOf(b)
    .map((h) => ownerOf(b, h))
    .filter((w) => tierOf(b, w, b.answer[w]) !== 'S')
    .map((w) => ({ word: w, heading: b.answer[w], gloss: b.gloss[cellKey(w, b.answer[w])] || null }));

const lower = (w: string) => w.toLowerCase();

/** "a taco", "an egg", "corn" */
const withArticle = (b: DailyBoard, word: string) => {
  const given = b.articles[word];
  const article = given !== undefined ? given : /^[aeiou]/i.test(word) ? 'an' : 'a';
  return article ? `${article} ${lower(word)}` : lower(word);
};

const spelled = (word: string) => word.toUpperCase().split('').join('-');

/** The confident-no sentence, or null when the key can't say it safely. */
const confidentNo = (b: DailyBoard, word: string, heading: string) => {
  const neg = b.negative[heading];
  // Spelling facts need no "by our key": "K-I-W-I has 4 letters."
  if (typeof neg === 'string' && neg.includes('{spelled}'))
    return `${neg.replace('{spelled}', spelled(word)).replace('{count}', String(word.length)).replace('{word}', lower(word))}.`;
  const rule = b.computed[heading];
  if (rule === 'same-letter-twice-in-a-row') return `${spelled(word)} has no letter twice in a row.`;
  if (rule === 'three-letters') return `${spelled(word)} has ${word.length} letters.`;
  let predicate: string | null = null;
  if (typeof neg === 'string') predicate = neg;
  else if (Array.isArray(neg)) {
    const half = b.failsHalf[cellKey(word, heading)];
    if (half === 0 || half === 1) predicate = neg[half];
  }
  if (!predicate) return `by our key, ${withArticle(b, word)} doesn't fit ${heading}.`;
  if (predicate.includes('{word}')) return `by our key, ${predicate.replace('{word}', lower(word))}.`;
  return `by our key, ${withArticle(b, word)} ${predicate}.`;
};

/**
 * Why the answer's word needs this heading: "Heart fits nowhere else", or
 * "once Taco is under Has a shell, Egg fits nowhere else (to egg someone)".
 */
export const ownerReason = (b: DailyBoard, heading: string) => {
  const owner = ownerOf(b, heading);
  const g = b.gloss[cellKey(owner, heading)];
  const tail = g ? ` (${g})` : '';
  const others = headingsOf(b).filter((h) => h !== heading && fitsStrict(b, owner, h));
  if (others.length === 0) return `${owner} fits nowhere else${tail}`;
  const blockers = others.map((h) => ({ word: ownerOf(b, h), heading: h }));
  if (blockers.length === 1) return `once ${blockers[0].word} is under ${blockers[0].heading}, ${owner} fits nowhere else${tail}`;
  const names = blockers.map((x) => x.word);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `once ${list} are placed, ${owner} fits nowhere else${tail}`;
};

export interface MissLine {
  word: string;
  heading: string;
  tier: string;
  text: string;
}

const ORDER: Record<string, number> = { N: 0, A: 0, O: 1, L: 2, S: 2, n: 3 };

/** One line per heading the arrangement got wrong; the confident no first. */
export const missLines = (b: DailyBoard, arrangement: string[]): MissLine[] => {
  const hs = headingsOf(b);
  const lines: MissLine[] = [];
  hs.forEach((h, i) => {
    const w = arrangement[i];
    if (!w || w === ownerOf(b, h)) return;
    const t = tierOf(b, w, h);
    const lead = `${w} under ${h}:`;
    let text: string;
    if (t === 'L' || t === 'S') text = `${lead} true, but ${ownerReason(b, h)}.`;
    else if (t === 'O') {
      const g = b.gloss[cellKey(w, h)];
      text = `${lead} true${g ? ` (${g})` : ''}, but ${ownerReason(b, h)}.`;
    } else if (t === 'n') {
      let reading = b.reading[cellKey(w, h)] || '';
      if (b.computed[h] === 'same-letter-twice-in-a-row') {
        const ch = repeatedLetter(w);
        if (ch) reading = `two ${ch}'s, not in a row`;
      }
      text = `${lead} some would say yes${reading ? ` (${reading})` : ''}, so no answer depends on it.`;
    } else text = `${lead} ${confidentNo(b, w, h)}`;
    lines.push({ word: w, heading: h, tier: t, text });
  });
  return lines.sort((x, y) => (ORDER[x.tier] ?? 0) - (ORDER[y.tier] ?? 0));
};
