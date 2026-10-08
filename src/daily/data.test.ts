// Gate 2 (DOSSIER-v2 10): dates, storage and its cross-tab merge, the run,
// errata, the share text and the card's generated lines.
//   npx jest --config src/daily/jest.config.js
// Jest globals, typed loosely: CRA's type check has no @types/jest.
declare const describe: any, test: any, expect: any, jest: any;
import fixtures from './fixtures.json';
import { normaliseBoard } from './board';
import { addDays, boardNumber, daysBetween, isDateString, latestPlayableDate, localDate, parseRoute, shortLabel, viaFor } from './dates';
import { applyErrata, emptyRecord, mergeRecords, readStore, recordForBoard, saveRecord, storageAvailable, streakOf, STORAGE_KEY } from './storage';
import { buildShareText, SHARE_ALLOWED } from './share';
import { missLines, ownerReason, plainPairs, secondLives } from './reveal';
import { loadBoard, reserveIndex } from './loader';
import type { DayRecord } from './types';

const LAUNCH = '2026-10-05';
const boardOf = (k: 'A' | 'B' | 'C', date = '2026-10-05') => normaliseBoard((fixtures as any).boards[k], date, LAUNCH, 'fixture');
const A = boardOf('A');
const B = boardOf('B', '2026-10-07');
const C = boardOf('C', '2026-10-09');

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  quota = Infinity;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  key(i: number) {
    return Array.from(this.data.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.quota) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.data.set(k, String(v));
  }
}

const rec = (over: Partial<DayRecord> = {}): DayRecord => ({ ...emptyRecord(A), ...over });

describe('dates', () => {
  test('validation', () => {
    expect(isDateString('2026-11-27')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '26-11-27', '2026-11-27x', '', null, 20261127]) expect(isDateString(bad)).toBe(false);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2027-02-29')).toBe(false);
  });
  test('board number comes from the date string alone', () => {
    expect(boardNumber('2026-11-02', '2026-11-02')).toBe(1);
    expect(boardNumber('2026-11-27', '2026-11-02')).toBe(26);
    expect(boardNumber('2026-11-09', '2026-11-02')).toBe(8);
    // Across a daylight-saving change (1 Nov 2026 in North America; 25 Oct in Europe).
    expect(daysBetween('2026-10-24', '2026-11-03')).toBe(10);
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
  });
  test('acceptance up to the current date at UTC+14', () => {
    // 2026-11-27 11:00 UTC is already 2026-11-28 01:00 at UTC+14.
    expect(latestPlayableDate(new Date(Date.UTC(2026, 10, 27, 11, 0)))).toBe('2026-11-28');
    expect(latestPlayableDate(new Date(Date.UTC(2026, 10, 27, 9, 59)))).toBe('2026-11-27');
  });
  test('labels and routes', () => {
    expect(shortLabel('2026-11-27')).toBe('Fri 27 Nov');
    expect(parseRoute('/match-five/daily/')).toEqual({ kind: 'today' });
    expect(parseRoute('/match-five/daily')).toEqual({ kind: 'today' });
    expect(parseRoute('/match-five/daily/2026-11-27/')).toEqual({ kind: 'date', date: '2026-11-27' });
    expect(parseRoute('/match-five/daily/2026-11-27')).toEqual({ kind: 'date', date: '2026-11-27' });
    expect(parseRoute('/match-five/daily/2026-02-30/')).toEqual({ kind: 'malformed' });
    expect(parseRoute('/match-five/daily/boards/')).toEqual({ kind: 'malformed' });
    expect(viaFor('2026-11-27', '2026-11-27')).toBe('today');
    expect(viaFor('2026-11-26', '2026-11-27')).toBe('yesterday');
    expect(viaFor('2026-11-20', '2026-11-27')).toBe('archive');
    expect(viaFor('2026-11-28', '2026-11-27')).toBe('tomorrow');
    expect(localDate(new Date(2026, 10, 27, 23, 59))).toBe('2026-11-27');
  });
});

describe('share text (6.3)', () => {
  const base = { number: 26, date: '2026-11-27' };
  const variants: [Parameters<typeof buildShareText>[0], string][] = [
    [{ ...base, rights: [7, 10], solved: true, hints: 0 }, 'Match Five Daily #26\nSolved on check 2 of 4. Right per check: 7, 10\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [10], solved: true, hints: 0 }, 'Match Five Daily #26\nSolved on check 1 of 4.\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [6, 8, 10], solved: true, hints: 1 }, 'Match Five Daily #26\nSolved on check 3 of 4, 1 hint. Right per check: 6, 8, 10\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [6, 8, 8, 9], solved: false, hints: 0 }, 'Match Five Daily #26\nNot solved. Right per check: 6, 8, 8, 9\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [7], solved: false, hints: 0 }, 'Match Five Daily #26\nNot solved. Right per check: 7\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [], solved: false, hints: 0 }, 'Match Five Daily #26\nNot solved, no checks.\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [], solved: false, hints: 2 }, 'Match Five Daily #26\nNot solved, 2 hints, no checks.\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
    [{ ...base, rights: [10], solved: true, hints: 1 }, 'Match Five Daily #26\nSolved on check 1 of 4, 1 hint.\nhttps://burgerfun.ca/match-five/daily/2026-11-27/'],
  ];
  test.each(variants)('%o', (input, expected) => {
    const text = buildShareText(input);
    expect(text).toBe(expected);
    expect(text.split('\n')).toHaveLength(3);
    expect(SHARE_ALLOWED.test(text)).toBe(true);
    expect(/\p{Extended_Pictographic}|️/u.test(text)).toBe(false);
    expect(text.includes('—')).toBe(false);
  });
  test('the builder takes no board text', () => {
    // Its only inputs are a number, a date string, numbers and a flag.
    expect(() => buildShareText({ number: 1, date: 'Kiwi', rights: [], solved: false, hints: 0 })).toThrow();
    expect(buildShareText.length).toBe(1);
  });
});

describe('the card text (6.1)', () => {
  test("today's second lives and the rest of the answer", () => {
    expect(secondLives(C).map((p) => `${p.word}|${p.gloss}`)).toEqual(['Crab|crabs do', 'Taco|a hard taco shell', 'Egg|to egg someone', 'Club|a golf club']);
    expect(plainPairs(C)).toHaveLength(6);
  });
  test('board C, the plausible first check: confident no first, then the red herrings (3.10)', () => {
    // A literal reader: shell to Egg, verb to Club, Taco left for the head.
    const arr = ['Crab', 'Egg', 'Penguin', 'Date', 'Club', 'Knight', 'Kiwi', 'Zipper', 'Swan', 'Taco'];
    expect(missLines(C, arr).map((m) => m.text)).toEqual([
      'Egg under Has a shell: true, but Taco fits nowhere else (a hard taco shell).',
      "Club under You can ___ someone: true, but once Taco is under Has a shell, Egg fits nowhere else (to egg someone).",
      'Taco under Has a head, no brain: by our key, a taco has no head.',
    ].sort((a, b) => (a.includes('by our key') ? -1 : b.includes('by our key') ? 1 : 0)));
  });
  test('board B: a confident no, a mass of red herrings, an article', () => {
    const arr = ['Egg', 'Dog', 'Bass', 'Needle', 'Mouse', 'River', 'Book', 'Kiwi', 'Snail', 'Owl'];
    const lines = missLines(B, arr).map((m) => m.text);
    expect(lines[0]).toBe("Dog under Lays eggs: by our key, a dog doesn't lay eggs.");
    expect(lines).toContain('Needle under You can ___ someone: true, but once Mouse is under Mammal, Dog fits nowhere else (to dog someone, follow).');
    expect(lines).toContain('Egg under Same letter twice in a row: true, but once Dog is under You can ___ someone, Needle fits nowhere else.');
    expect(lines).toContain('Snail under Has a shell: true, but once Needle and Dog are placed, Egg fits nowhere else.');
  });
  test('templates: computed no, soft no from a computed misreading, the verb heading, an obscure truth, a mass noun', () => {
    // River under the double letter: n (two r's); Kiwi likewise (two i's).
    const arr = ['River', 'Owl', 'Bass', 'Dog', 'Mouse', 'Kiwi', 'Book', 'Needle', 'Egg', 'Snail'];
    const lines = missLines(B, arr).map((m) => m.text);
    expect(lines).toContain("River under Same letter twice in a row: some would say yes (two r's, not in a row), so no answer depends on it.");
    expect(lines).toContain("Kiwi under Has a mouth, can't eat: by our key, a kiwi can eat.");
    const mouse = missLines(B, ['Dog', 'Owl', 'Bass', 'Mouse', 'Egg', 'River', 'Book', 'Kiwi', 'Snail', 'Needle']).map((m) => m.text);
    expect(mouse).toContain("Mouse under You can ___ someone: by our key, you can't mouse someone.");
    expect(mouse).toContain('Needle under Bird: by our key, a needle isn\'t a bird.');
    expect(mouse).toContain('Egg under Mammal: by our key, an egg isn\'t a mammal.');
    const spelled = missLines(B, ['Owl', 'Dog', 'Bass', 'Book', 'Mouse', 'River', 'Needle', 'Kiwi', 'Egg', 'Snail']).map((m) => m.text);
    expect(spelled).toContain('Owl under Same letter twice in a row: O-W-L has no letter twice in a row.');
    // Board A: Hammer's obscure truth, and Corn as a mass noun.
    const a = missLines(A, ['Crane', 'Palm', 'Corn', 'Bass', 'Penguin', 'Shoe', 'Heart', 'Hammer', 'Bat', 'Elephant']).map((m) => m.text);
    expect(a).toContain('Hammer under Body part: true (the hammer bone, in the ear), but Heart fits nowhere else.');
    expect(a).toContain('Corn under Has a head, no brain: by our key, corn has no head.');
    expect(a).toContain("Heart under Has ears, can't hear: by our key, a heart doesn't fit Has ears, can't hear.");
    expect(ownerReason(A, 'Body part')).toBe('Heart fits nowhere else');
  });
  test('every miss line is free of emoji and em dashes', () => {
    const arr = ['Taco', 'Zipper', 'Knight', 'Kiwi', 'Crab', 'Club', 'Date', 'Egg', 'Penguin', 'Swan'];
    for (const m of missLines(C, arr)) expect(/\p{Extended_Pictographic}|️|—/u.test(m.text)).toBe(false);
  });
});

describe('storage (8.4)', () => {
  test('corrupt JSON reads as empty and is replaced on the next write', () => {
    const ls = new MemoryStorage();
    ls.setItem(STORAGE_KEY, '{not json');
    expect(readStore(ls).records).toEqual({});
    const res = saveRecord('2026-10-05', rec({ updatedAt: 5 }), '2026-10-05', ls);
    expect(res.ok).toBe(true);
    expect(readStore(ls).records['2026-10-05'].updatedAt).toBe(5);
  });
  test('quota exceeded: old board copies are dropped, then the write is retried', () => {
    const ls = new MemoryStorage();
    for (let i = 0; i < 6; i++) saveRecord(addDays('2026-10-05', i), rec({ updatedAt: i + 1 }), '2026-10-11', ls);
    const size = (ls.getItem(STORAGE_KEY) as string).length;
    ls.quota = Math.floor(size * 0.6);
    const res = saveRecord('2026-10-11', rec({ updatedAt: 99 }), '2026-10-11', ls);
    expect(res.ok).toBe(true);
    const store = readStore(ls);
    expect(store.records['2026-10-05'].board).toBeNull();
    expect(store.records['2026-10-11'].board).not.toBeNull();
    ls.quota = 10;
    expect(saveRecord('2026-10-11', rec({ updatedAt: 100 }), '2026-10-11', ls).ok).toBe(false);
  });
  test('storage unavailable', () => {
    expect(storageAvailable(null)).toBe(false);
    const broken = new MemoryStorage();
    broken.quota = 0;
    expect(storageAvailable(broken)).toBe(false);
    expect(saveRecord('2026-10-05', rec(), '2026-10-05', null).ok).toBe(false);
  });
  test('a changed boardHash keeps the result and drops the placements; a changed textVersion keeps both', () => {
    const played = rec({ boardHash: 'old', placements: { 'Can fly': 'Bat' }, tray: ['Crane', null, null, null, null], started: true, checks: [], updatedAt: 3 });
    const fixed = recordForBoard(played, A, [], '2026-10-05');
    expect(fixed.placements).toEqual({});
    expect(fixed.boardHash).toBe(A.boardHash);
    const done = rec({ boardHash: 'old', ended: 'solved', endedOn: '2026-10-05', checks: [{ arrangement: Array(10).fill('x'), counts: [5, 5], at: 1 }], updatedAt: 4 });
    expect(recordForBoard(done, A, [], '2026-10-05').ended).toBe('solved');
    const text = rec({ boardHash: A.boardHash, textVersion: 'old-text', placements: { 'Can fly': 'Bat' }, updatedAt: 3 });
    expect(recordForBoard(text, A, [], '2026-10-05').placements).toEqual({ 'Can fly': 'Bat' });
  });
  test('two tabs saving out of order: no check gained or lost, endings and hints stay', () => {
    const c1 = { arrangement: Array(10).fill('a'), counts: [3, 4] as [number, number], at: 100 };
    const c2 = { arrangement: Array(10).fill('b'), counts: [4, 4] as [number, number], at: 200 };
    const tabA = rec({ checks: [c1, c2], hints: [{ rung: 'nudge', word: 'Bass' }], placements: { Bird: 'Penguin' }, updatedAt: 200 });
    const tabB = rec({ checks: [c1], hints: [], placements: { Bird: 'Crane' }, updatedAt: 300 });
    const ab = mergeRecords(tabA, tabB);
    const ba = mergeRecords(tabB, tabA);
    for (const m of [ab, ba]) {
      expect(m.checks).toEqual([c1, c2]);
      expect(m.hints).toEqual([{ rung: 'nudge', word: 'Bass' }]);
      expect(m.placements).toEqual({ Bird: 'Crane' }); // the newer write
    }
    // Through real storage, in both orders.
    for (const order of [
      [tabA, tabB],
      [tabB, tabA],
    ]) {
      const ls = new MemoryStorage();
      for (const r of order) saveRecord('2026-10-05', r, '2026-10-05', ls);
      expect(readStore(ls).records['2026-10-05'].checks).toHaveLength(2);
    }
    const shown = mergeRecords(rec({ ended: 'shown', endedOn: '2026-10-05', updatedAt: 1 }), rec({ updatedAt: 9 }));
    expect(shown.ended).toBe('shown');
    const four = mergeRecords(rec({ checks: [c1, c2], updatedAt: 1 }), rec({ checks: [{ ...c1, at: 300 }, { ...c2, at: 400 }], updatedAt: 2 }));
    expect(four.checks).toHaveLength(4);
    expect(four.ended).toBe('out');
  });
});

describe('the run (decisions 9.1 b and 9.2 b)', () => {
  const done = (endedOn: string, solved = true): DayRecord => rec({ ended: solved ? 'solved' : 'out', endedOn, checks: [] });
  test('days finished, solved or not; a loss keeps the run', () => {
    const r = { '2026-11-01': done('2026-11-01'), '2026-11-02': done('2026-11-02', false), '2026-11-03': done('2026-11-03') };
    expect(streakOf(r, '2026-11-03')).toEqual({ run: 3, finished: 3, solved: 2 });
  });
  test("yesterday's board finished today still counts; two days late does not", () => {
    const r = { '2026-11-01': done('2026-11-01'), '2026-11-02': done('2026-11-03'), '2026-11-03': done('2026-11-03') };
    expect(streakOf(r, '2026-11-03').run).toBe(3);
    const late = { '2026-11-01': done('2026-11-01'), '2026-11-02': done('2026-11-04'), '2026-11-04': done('2026-11-04') };
    expect(streakOf(late, '2026-11-04').run).toBe(1);
  });
  test("the run stays alive while today is unplayed, and a missed day ends it", () => {
    const r = { '2026-11-01': done('2026-11-01'), '2026-11-02': done('2026-11-02') };
    expect(streakOf(r, '2026-11-03').run).toBe(2);
    expect(streakOf(r, '2026-11-04').run).toBe(0);
  });
  test("a friend's board finished early (S15) counts for its own date when it arrives", () => {
    const r = { '2026-11-27': done('2026-11-27'), '2026-11-28': done('2026-11-27') };
    expect(streakOf(r, '2026-11-27').run).toBe(1);
    expect(streakOf(r, '2026-11-28').run).toBe(2);
  });
  test('across a daylight-saving change and a time-zone move the count is by date', () => {
    const r = { '2026-10-31': done('2026-10-31'), '2026-11-01': done('2026-11-01'), '2026-11-02': done('2026-11-02') };
    expect(streakOf(r, '2026-11-02').run).toBe(3);
  });
});

describe('errata (7.9)', () => {
  test('a stored check matching an accepted alternate is upgraded; the board hash is untouched', () => {
    const hs = A.sections[0].headings.concat(A.sections[1].headings);
    const alt: Record<string, string> = { ...A.answer, Heart: "Has ears, can't hear", Corn: 'Body part' };
    const arrangement = hs.map((h) => Object.keys(alt).find((w) => alt[w] === h) as string);
    const r = rec({ checks: [{ arrangement, counts: [5, 3], at: 1 }], ended: null, updatedAt: 1 });
    const up = applyErrata(r, hs, [alt], '2026-10-06');
    expect(up.ended).toBe('solved');
    expect(up.acceptedAfterFix).toBe(true);
    expect(up.boardHash).toBe(r.boardHash);
    expect(mergeRecords(up, { ...r, updatedAt: 5 }).ended).toBe('solved');
  });
});

describe('loader (8.2)', () => {
  const json = (body: unknown, status = 200, type = 'application/json') =>
    Promise.resolve({
      status,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? type : null) },
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    } as any);
  const raw = (fixtures as any).boards;
  const ctx = { date: '2026-11-03', latest: '2026-11-04', stored: null, allowFixtures: false };

  test('a scheduled board', async () => {
    const fetcher = jest.fn((url: string) =>
      url.endsWith('index.json') ? json({ launch: '2026-11-02' }) : url.endsWith('2026-11.json') ? json({ boards: { '2026-11-03': raw.B } }) : json({}, 404),
    );
    const res = await loadBoard({ ...ctx, fetcher: fetcher as any });
    expect(res.kind).toBe('board');
    if (res.kind === 'board') {
      expect(res.board.number).toBe(2);
      expect(res.board.source).toBe('schedule');
    }
  });
  test('a missing month file, HTML served as JSON, or a missing entry uses the reserve, silently', async () => {
    for (const month of [json({}, 404), json('<html>', 200, 'text/html'), json({ boards: {} })]) {
      const fetcher = jest.fn((url: string) =>
        url.endsWith('index.json') ? json({ launch: '2026-11-02' }) : url.endsWith('2026-11.json') ? month : url.endsWith('reserve.json') ? json({ boards: [raw.A, raw.C] }) : json({}, 404),
      );
      const res = await loadBoard({ ...ctx, fetcher: fetcher as any });
      expect(res.kind === 'board' && res.board.source).toBe('reserve');
    }
    expect(reserveIndex('2026-11-03', 2)).toBe(reserveIndex('2026-11-03', 2));
  });
  test('a network failure uses the stored copy, else fails (S12)', async () => {
    const fetcher = jest.fn(() => Promise.reject(new TypeError('offline')));
    expect((await loadBoard({ ...ctx, fetcher: fetcher as any })).kind).toBe('failed');
    const res = await loadBoard({ ...ctx, stored: A, fetcher: fetcher as any });
    expect(res.kind === 'board' && res.board.source).toBe('stored');
  });
  test('no board before launch or after UTC+14 today (S11)', async () => {
    const fetcher = jest.fn(() => json({ launch: '2026-11-02' }));
    expect((await loadBoard({ ...ctx, date: '2026-11-01', fetcher: fetcher as any })).kind).toBe('no-board');
    expect((await loadBoard({ ...ctx, date: '2026-11-05', fetcher: fetcher as any })).kind).toBe('no-board');
  });
});

describe("the content pipeline's publish format (lane M1)", () => {
  // Six pilot boards from scripts/daily/lib/board.mjs publishedBoard, saved as m1-sample.json.
  const sample = require('./m1-sample.json').boards as any[];
  test.each(sample.map((b) => [b.date, b]))('%s normalises, solves, and explains its misses', (_d: string, raw: any) => {
    const b = normaliseBoard(raw, raw.date, '2026-11-02', 'schedule');
    expect(b.number).toBe(raw.number);
    expect(b.sections[0].words).toEqual(raw.words.slice(0, 5).map((w: any) => w.text));
    expect(b.sections[1].headings).toEqual(raw.headings.slice(5).map((h: any) => h.label));
    expect(b.boardHash).toBe(raw.hash);
    expect(Object.keys(b.answer)).toHaveLength(10);
    expect(new Set(Object.values(b.answer)).size).toBe(10);
    expect(b.proofOrder).toHaveLength(10);
    // Every answer pair is L or S in the key the board carries (R4).
    for (const w of Object.keys(b.answer)) expect(['L', 'S']).toContain(b.cells[`${w}|${b.answer[w]}`]);
    // Every S and O cell has a gloss (R11), so the card can print it.
    for (const [k, t] of Object.entries(b.cells)) if (t === 'S' || t === 'O') expect(b.gloss[k]).toBeTruthy();
    // A wrong arrangement: rotate the answer one step; every miss line is generated text with no gaps.
    const hs = b.sections[0].headings.concat(b.sections[1].headings);
    const owners = hs.map((h) => Object.keys(b.answer).find((w) => b.answer[w] === h) as string);
    const rotated = owners.slice(1).concat(owners[0]);
    const lines = missLines(b, rotated);
    expect(lines).toHaveLength(10);
    for (const l of lines) {
      expect(l.text).toMatch(/^[A-Z].+ under .+: .+\.$/);
      expect(l.text).not.toMatch(/undefined|\{|\}|null/);
    }
    if (b.nudge) expect(secondLives(b).map((p) => p.word)).toContain(b.nudge);
  });
});
