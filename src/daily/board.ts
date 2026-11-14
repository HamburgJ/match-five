// Normalises a fetched board into DailyBoard and answers key questions about it.
// Pure: no DOM, no storage. The independent data test lives in scripts/daily/
// (lane M1); this file only reads boards, it never proves them.
import type { ComputedRule, DailyBoard, Tier } from './types';
import { boardNumber, isDateString } from './dates';

export const cellKey = (word: string, heading: string) => `${word}|${heading}`;

/** FNV-1a, 32 bit, as 8 hex digits. Stable across engines. */
export const fnv1a = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const sortedEntries = (o: Record<string, unknown>) =>
  Object.keys(o)
    .sort()
    .map((k) => [k, o[k]]);

const KNOWN_RULES: Record<string, ComputedRule> = {
  'same letter twice in a row': 'same-letter-twice-in-a-row',
  'three letters': 'three-letters',
};
/** Rule ids the content pipeline (scripts/daily/lib/computed.mjs) uses for the same two rules. */
const RULE_ALIASES: Record<string, string> = { 'double-adjacent': 'same-letter-twice-in-a-row', 'letters-3': 'three-letters' };

type RawBoard = Record<string, any>;

/** The content pipeline's publish shape: words and headings as objects, everything else by index. */
const isIndexed = (raw: RawBoard) =>
  Array.isArray(raw.words) && raw.words.length === 10 && !!raw.words[0] && typeof raw.words[0] === 'object' && Array.isArray(raw.headings);

const fromIndexed = (raw: RawBoard): RawBoard => {
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const W: string[] = raw.words.map((w: RawBoard) => text(w && w.text));
  const H: string[] = raw.headings.map((h: RawBoard) => text(h && h.label));
  const wordOf = (i: unknown) => (typeof i === 'number' ? W[i] : text(i));
  const cells: Record<string, string> = {};
  const gloss: Record<string, string> = {};
  const reading: Record<string, string> = {};
  for (const c of Array.isArray(raw.cells) ? raw.cells : []) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const k = cellKey(W[c[0]], H[c[1]]);
    cells[k] = text(c[2]);
    if (typeof c[4] === 'string' && c[4]) {
      if (c[2] === 'S' || c[2] === 'O') gloss[k] = c[4];
      else if (c[2] === 'n') reading[k] = c[4];
    }
  }
  const negative: Record<string, unknown> = {};
  const computed: Record<string, string> = {};
  const spoken: Record<string, string> = {};
  raw.headings.forEach((h: RawBoard, j: number) => {
    const neg = h && h.negative;
    if (typeof neg === 'string') negative[H[j]] = neg;
    else if (neg && typeof neg === 'object' && typeof neg.has === 'string' && typeof neg.not === 'string') negative[H[j]] = [neg.has, neg.not];
    if (h && typeof h.rule === 'string' && h.rule) computed[H[j]] = h.rule;
    if (h && typeof h.spoken === 'string' && h.spoken) spoken[H[j]] = h.spoken;
  });
  // Which half of a compound heading each confident no fails: { heading (index, id or label): { word (index, id or text): 'has' | 'not' } }.
  const failsHalf: Record<string, 0 | 1> = {};
  const nw = raw.negWhy || raw.failsHalf;
  if (nw && typeof nw === 'object') {
    for (const [hk, row] of Object.entries(nw as RawBoard)) {
      const j = /^[0-9]+$/.test(hk) ? Number(hk) : raw.headings.findIndex((h: RawBoard) => h && (h.id === hk || h.label === hk));
      if (j < 0 || !row || typeof row !== 'object') continue;
      for (const [wk, half] of Object.entries(row as RawBoard)) {
        const i = /^[0-9]+$/.test(wk) ? Number(wk) : raw.words.findIndex((w: RawBoard) => w && (w.id === wk || w.text === wk));
        if (i < 0) continue;
        if (half === 'has' || half === 0) failsHalf[cellKey(W[i], H[j])] = 0;
        if (half === 'not' || half === 1) failsHalf[cellKey(W[i], H[j])] = 1;
      }
    }
  }
  const answer: Record<string, string> = {};
  if (Array.isArray(raw.answer)) raw.answer.forEach((j: unknown, i: number) => (answer[W[i]] = typeof j === 'number' ? H[j] : text(j)));
  return {
    sections: [
      { headings: H.slice(0, 5), words: W.slice(0, 5) },
      { headings: H.slice(5, 10), words: W.slice(5, 10) },
    ],
    answer,
    proofOrder: Array.isArray(raw.proofOrder) ? raw.proofOrder.map(wordOf) : [],
    cells,
    gloss,
    reading,
    negative,
    failsHalf,
    computed,
    spoken,
    articles: Object.fromEntries(raw.words.map((w: RawBoard) => [text(w && w.text), w && typeof w.article === 'string' ? w.article : 'a'])),
    nudge: typeof raw.nudge === 'number' ? W[raw.nudge] : raw.nudge,
    harder: raw.harder === true,
    band: raw.band,
    bruteForce: raw.bruteForce,
    boardHash: raw.boardHash || raw.hash,
    textVersion: raw.textVersion,
  };
};

export const ruleHolds = (rule: ComputedRule, word: string) => {
  const w = word.toLowerCase();
  if (rule === 'three-letters') return w.length === 3;
  for (let i = 0; i + 1 < w.length; i++) if (w[i] === w[i + 1]) return true;
  return false;
};

/** The computed misreading of a rule: "some letter appears twice anywhere". */
export const ruleMisread = (rule: ComputedRule, word: string) => {
  if (rule !== 'same-letter-twice-in-a-row') return false;
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i++) if (w.indexOf(w[i], i + 1) !== -1) return true;
  return false;
};

/** The letter a misreading counts twice ("i" in Kiwi), for the reveal's wording. */
export const repeatedLetter = (word: string) => {
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i++) if (w.indexOf(w[i], i + 1) !== -1) return w[i];
  return null;
};

type Raw = Record<string, any>;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strList = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

/** Thrown for a board file that can't be played; the loader treats it like a missing entry. */
export class BoardFormatError extends Error {}

/**
 * Accepts the format documented at the top of types.ts, plus the shapes the design tools emit
 * (sections[].slots, answer as [word, heading] pairs, per-heading tier lists).
 */
export const normaliseBoard = (input: Raw, date: string, launch: string, source: DailyBoard['source']): DailyBoard => {
  if (!input || typeof input !== 'object') throw new BoardFormatError('not an object');
  const raw = isIndexed(input) ? fromIndexed(input) : input;
  if (!isDateString(date)) throw new BoardFormatError('bad date');
  const rawSections = Array.isArray(raw.sections) ? raw.sections : null;
  if (!rawSections || rawSections.length !== 2) throw new BoardFormatError('needs two sections');
  const sections = rawSections.map((s: Raw) => {
    const headings = strList(s?.headings) || strList(s?.slots);
    const words = strList(s?.words);
    if (!headings || !words || headings.length !== 5 || words.length !== 5) throw new BoardFormatError('section shape');
    return { headings: headings.slice(), words: words.slice() };
  }) as DailyBoard['sections'];
  const headings = sections.flatMap((s) => s.headings);
  const words = sections.flatMap((s) => s.words);
  if (new Set(headings).size !== 10 || new Set(words).size !== 10) throw new BoardFormatError('repeated word or heading');

  const answer: Record<string, string> = {};
  if (Array.isArray(raw.answer)) for (const pair of raw.answer) answer[str(pair?.[0])] = str(pair?.[1]);
  else if (raw.answer && typeof raw.answer === 'object') for (const [w, h] of Object.entries(raw.answer)) answer[w] = str(h);
  const answerHeadings = new Set(Object.values(answer));
  if (!words.every((w) => headings.includes(answer[w])) || answerHeadings.size !== 10) throw new BoardFormatError('answer is not an arrangement');

  const proofOrder = strList(raw.proofOrder) || [];
  if (proofOrder.length !== 10 || !words.every((w) => proofOrder.includes(w))) throw new BoardFormatError('proof order');

  // Cells: a flat map, or per-heading tier lists ({ heading: { L: [], S: [] ... } }).
  const cells: Record<string, Tier> = {};
  const flat = raw.cells && typeof raw.cells === 'object' && !Array.isArray(raw.cells) ? raw.cells : null;
  if (flat) {
    for (const [k, t] of Object.entries(flat)) if (['L', 'S', 'O', 'A', 'n', 'N'].includes(String(t))) cells[k] = t as Tier;
  }
  const perHeading = raw.key && typeof raw.key === 'object' ? raw.key : null;
  if (perHeading) {
    for (const h of headings) {
      const row = perHeading[h];
      if (!row) continue;
      for (const t of ['L', 'S', 'O', 'A', 'n'] as Tier[]) for (const w of strList(row[t]) || []) cells[cellKey(w, h)] = t;
    }
  }

  const computed: Record<string, string> = {};
  const rawComputed = raw.computed && typeof raw.computed === 'object' ? raw.computed : {};
  for (const h of headings) {
    const named = KNOWN_RULES[h.toLowerCase()];
    const given = typeof rawComputed[h] === 'string' ? RULE_ALIASES[rawComputed[h]] || rawComputed[h] : null;
    const rule = given || named || null;
    if (rule) computed[h] = rule;
  }
  // Computed cells come from the rule whenever the data leaves them out (rules the client knows).
  for (const [h, rule] of Object.entries(computed)) {
    if (rule !== 'same-letter-twice-in-a-row' && rule !== 'three-letters') continue;
    for (const w of words) {
      const k = cellKey(w, h);
      if (k in cells) continue;
      if (ruleHolds(rule, w)) cells[k] = 'L';
      else if (ruleMisread(rule, w)) cells[k] = 'n';
    }
  }
  for (const k of Object.keys(cells)) if (cells[k] === 'N') delete cells[k];

  const textMap = (v: unknown) => {
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Raw)) if (typeof x === 'string') out[k] = x;
    return out;
  };
  const gloss = textMap(raw.gloss || raw.glosses);
  const reading = textMap(raw.reading || raw.readings || raw.why);
  for (const k of Object.keys(reading)) reading[k] = reading[k].replace(/^misreading:\s*/, '');
  const negative: Record<string, string | [string, string]> = {};
  const rawNeg = raw.negative || raw.negatives || raw.predicates || {};
  for (const [h, v] of Object.entries(rawNeg as Raw)) {
    if (typeof v === 'string') negative[h] = v;
    else if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string')) negative[h] = [v[0], v[1]];
  }
  const failsHalf: Record<string, 0 | 1> = {};
  for (const [k, v] of Object.entries((raw.failsHalf || {}) as Raw)) if (v === 0 || v === 1) failsHalf[k] = v;
  const articles = textMap(raw.articles);
  const spoken = textMap(raw.spoken);

  // The nudge: given, or the S answer pair with the lowest obviousness score.
  let nudge: string | null = typeof raw.nudge === 'string' && words.includes(raw.nudge) ? raw.nudge : null;
  const sAnswerWords = words.filter((w) => cells[cellKey(w, answer[w])] === 'S');
  if (nudge && !sAnswerWords.includes(nudge)) nudge = null;
  if (!nudge && sAnswerWords.length) {
    const ob = (raw.obviousness && typeof raw.obviousness === 'object' ? raw.obviousness : {}) as Raw;
    const score = (w: string) => (typeof ob[cellKey(w, answer[w])] === 'number' ? ob[cellKey(w, answer[w])] : 1);
    // Without scores, the S pair latest in the proof order (deepest in the logic).
    nudge = sAnswerWords
      .slice()
      .sort((a, b) => score(a) - score(b) || proofOrder.indexOf(b) - proofOrder.indexOf(a))[0];
  }

  const bf = raw.bruteForce;
  const bruteForce =
    bf && typeof bf === 'object' && [bf.orders, bf.strict, bf.generous].every((x) => typeof x === 'number')
      ? { orders: bf.orders, strict: bf.strict, generous: bf.generous }
      : null;

  const puzzle = JSON.stringify([sections, sortedEntries(answer), sortedEntries(cells)]);
  const text = JSON.stringify([sortedEntries(gloss), sortedEntries(reading), sortedEntries(negative), sortedEntries(articles), sortedEntries(failsHalf)]);

  return {
    date,
    number: boardNumber(date, launch),
    sections,
    answer,
    proofOrder: proofOrder.slice(),
    cells,
    gloss,
    reading,
    negative,
    failsHalf,
    computed,
    articles,
    spoken,
    nudge,
    harder: raw.harder === true || raw.band === 'fri',
    bruteForce,
    boardHash: typeof raw.boardHash === 'string' && raw.boardHash ? raw.boardHash : fnv1a(puzzle),
    textVersion: typeof raw.textVersion === 'string' && raw.textVersion ? raw.textVersion : fnv1a(text),
    source,
  };
};

export const headingsOf = (b: DailyBoard) => b.sections[0].headings.concat(b.sections[1].headings);
export const wordsOf = (b: DailyBoard) => b.sections[0].words.concat(b.sections[1].words);
export const topHeadings = (b: DailyBoard) => b.sections[0].headings;
export const bottomHeadings = (b: DailyBoard) => b.sections[1].headings;
export const halfOf = (b: DailyBoard, heading: string): 0 | 1 => (b.sections[0].headings.includes(heading) ? 0 : 1);

export const tierOf = (b: DailyBoard, word: string, heading: string): Tier => b.cells[cellKey(word, heading)] || 'N';
/** Counts for uniqueness: L, S and O. */
export const fitsStrict = (b: DailyBoard, word: string, heading: string) => {
  const t = tierOf(b, word, heading);
  return t === 'L' || t === 'S' || t === 'O';
};

/** heading -> its answer word */
export const ownerOf = (b: DailyBoard, heading: string) => wordsOf(b).find((w) => b.answer[w] === heading) as string;

/** Whether the uniqueness sentence may be shown (a recorded count of 1 under both graphs). */
export const uniquenessRecorded = (b: DailyBoard) =>
  !!b.bruteForce && b.bruteForce.orders === 3628800 && b.bruteForce.strict === 1 && b.bruteForce.generous === 1;

/** Screen-reader form of a heading: "You can ___ someone" -> "You can blank someone". */
export const spokenHeading = (heading: string, b?: DailyBoard) => (b && b.spoken[heading]) || heading.replace(/_{2,}/g, 'blank');
