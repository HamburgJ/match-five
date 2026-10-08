// Gate 2 (DOSSIER-v2 10): the tap table row by row, Undo, checks, section 2,
// hints and the pin's sentence. Runs under react-scripts' Jest:
//   npx react-scripts test --watchAll=false src/daily
// Jest globals, typed loosely: CRA's type check has no @types/jest.
declare const describe: any, test: any, expect: any, jest: any;
import fixtures from './fixtures.json';
import { normaliseBoard } from './board';
import { alreadyChecked, checkButton, initialState, pinReason, pinTarget, restoreState, sectionHeader, tap, type PlayState, type Target } from './engine';
import type { DailyBoard } from './types';

const LAUNCH = '2026-10-05';
const boardOf = (k: 'A' | 'B' | 'C', date = '2026-10-05') => normaliseBoard((fixtures as any).boards[k], date, LAUNCH, 'fixture');
const A = boardOf('A');
const B = boardOf('B', '2026-10-07');
const C = boardOf('C', '2026-10-09');
const opts = { firstBoard: false, now: 1000 };

const T = (index: number): Target => ({ kind: 'tray', index });
const H = (heading: string): Target => ({ kind: 'heading', heading });

const run = (board: DailyBoard, state: PlayState, ...targets: Target[]) => {
  let s = state;
  let status: string | null = null;
  for (const t of targets) {
    const out = tap(s, board, t, opts);
    s = out.state;
    if (out.status !== null) status = out.status;
  }
  return { s, status };
};

/** Place words by name: [word, heading] pairs, from wherever they are. */
const place = (board: DailyBoard, state: PlayState, pairs: [string, string][]) => {
  let s = state;
  for (const [w, h] of pairs) {
    const ti = s.tray.indexOf(w);
    if (ti >= 0) s = tap(tap(s, board, T(ti), opts).state, board, H(h), opts).state;
    else {
      const from = Object.keys(s.placements).find((k) => s.placements[k] === w) as string;
      s = tap(tap(s, board, H(from), opts).state, board, H(h), opts).state;
    }
  }
  return s;
};

/** Fill the top five with the tray's words in tray order: section 2 arrives. */
const fillTop = (board: DailyBoard, s: PlayState = initialState(board)) =>
  place(board, s, board.sections[0].headings.map((h, i) => [s.tray[i] as string, h] as [string, string]));
const allPairs = (board: DailyBoard) => Object.entries(board.answer) as [string, string][];
/** The whole answer on the board, no checks yet. */
const full = (board: DailyBoard, wrong: Record<string, string> = {}) => {
  let s = place(board, fillTop(board), allPairs(board));
  for (const [w, h] of Object.entries(wrong)) s = place(board, s, [[w, h]]);
  return s;
};

describe('initial state', () => {
  test('tray holds section 1 in alphabetical order, five cells', () => {
    expect(initialState(A).tray).toEqual(['Bat', 'Crane', 'Elephant', 'Hammer', 'Penguin']);
    expect(initialState(A).s2).toBe(false);
  });
});

describe('tap table (3.2)', () => {
  const s0 = initialState(A); // Bat, Crane, Elephant, Hammer, Penguin

  test('nothing selected + tray word selects it', () => {
    const { s, status } = run(A, s0, T(0));
    expect(s.selected).toEqual({ kind: 'tray', index: 0 });
    expect(status).toBe('Bat: tap a heading.');
  });
  test('nothing selected + filled heading selects its word', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, H('Can fly'));
    expect(s.selected).toEqual({ kind: 'heading', heading: 'Can fly' });
    expect(status).toBe('Bat: tap another heading, or an empty tray cell.');
  });
  test('nothing selected + empty card, empty tray cell, gap: nothing, status unchanged', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    for (const t of [H('Bird'), T(0), { kind: 'gap' } as Target]) {
      const out = tap(placed, A, t, opts);
      expect(out.state).toBe(placed);
      expect(out.status).toBeNull();
    }
  });
  test('placeholder headings before section 2 are not targets', () => {
    const sel = run(A, s0, T(0)).s;
    const out = tap(sel, A, H('Mammal'), opts);
    expect(out.state).toBe(sel);
    expect(out.status).toBeNull();
  });
  test('tray word selected + same word deselects', () => {
    const { s, status } = run(A, s0, T(0), T(0));
    expect(s.selected).toBeNull();
    expect(status).toBe('Tap a word.');
  });
  test('tray word selected + another tray word selects that one', () => {
    const { s, status } = run(A, s0, T(0), T(1));
    expect(s.selected).toEqual({ kind: 'tray', index: 1 });
    expect(status).toBe('Crane: tap a heading.');
  });
  test('tray word selected + empty card places it', () => {
    const { s, status } = run(A, s0, T(0), H('Can fly'));
    expect(s.placements['Can fly']).toBe('Bat');
    expect(s.tray[0]).toBeNull();
    expect(status).toBe('Bat under Can fly.');
  });
  test('tray word selected + filled card: the card word takes the vacated tray cell', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, T(1), H('Can fly'));
    expect(s.placements['Can fly']).toBe('Crane');
    expect(s.tray[1]).toBe('Bat');
    expect(status).toBe('Crane under Can fly. Bat back to the tray.');
  });
  test('placed word selected + same card deselects', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, H('Can fly'), H('Can fly'));
    expect(s.selected).toBeNull();
    expect(status).toBe('Tap a word.');
  });
  test('placed word selected + empty card moves it', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, H('Can fly'), H('Bird'));
    expect(s.placements['Bird']).toBe('Bat');
    expect(s.placements['Can fly']).toBeNull();
    expect(status).toBe('Bat moved to Bird.');
  });
  test('placed word selected + filled card swaps', () => {
    const placed = place(A, s0, [['Bat', 'Can fly'], ['Penguin', 'Bird']]);
    const { s, status } = run(A, placed, H('Can fly'), H('Bird'));
    expect(s.placements['Bird']).toBe('Bat');
    expect(s.placements['Can fly']).toBe('Penguin');
    expect(status).toBe('Swapped: Bat to Bird, Penguin to Can fly.');
  });
  test('placed word selected + empty tray cell returns it there', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, H('Can fly'), T(0));
    expect(s.tray[0]).toBe('Bat');
    expect(s.placements['Can fly']).toBeNull();
    expect(status).toBe('Bat back to the tray.');
  });
  test('placed word selected + tray word swaps them', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const { s, status } = run(A, placed, H('Can fly'), T(1));
    expect(s.placements['Can fly']).toBe('Crane');
    expect(s.tray[1]).toBe('Bat');
    expect(status).toBe('Crane under Can fly. Bat back to the tray.');
  });
  test('any word selected + gap: nothing, selection stays', () => {
    const sel = run(A, s0, T(2)).s;
    const out = tap(sel, A, { kind: 'gap' }, opts);
    expect(out.state.selected).toEqual({ kind: 'tray', index: 2 });
    expect(out.status).toBeNull();
  });
  test('tray word selected + empty tray cell: nothing, selection stays', () => {
    const placed = place(A, s0, [['Bat', 'Can fly']]);
    const sel = run(A, placed, T(1)).s;
    const out = tap(sel, A, T(0), opts);
    expect(out.state.selected).toEqual({ kind: 'tray', index: 1 });
    expect(out.status).toBeNull();
  });
  test('any word selected + Check: disabled with the reason', () => {
    const sel = run(A, full(A), H('Bird')).s;
    expect(checkButton(sel, A).enabled).toBe(false);
    const out = tap(sel, A, { kind: 'check' }, opts);
    expect(out.status).toBe('Place Penguin or tap it again to let go.');
    expect(out.state.checks).toHaveLength(0);
  });
  test('Check before all ten are out says why', () => {
    const out = tap(s0, A, { kind: 'check' }, opts);
    expect(out.status).toBe('Fill all ten, then check.');
  });
});

describe('section 2 (3.3)', () => {
  test('arrives when the top five are full, whatever is in them, into the empty tray cells, alphabetical', () => {
    // A deliberately wrong filling still brings section 2.
    const s = place(A, initialState(A), [
      ['Bat', 'Bird'],
      ['Crane', 'Has a trunk'],
      ['Elephant', 'Can fly'],
      ['Hammer', 'Lays eggs'],
      ['Penguin', 'Has a head, no brain'],
    ]);
    expect(s.s2).toBe(true);
    expect(s.tray).toEqual(['Bass', 'Corn', 'Heart', 'Palm', 'Shoe']);
    expect(sectionHeader(s, A, 0)).toBe('Top five · full, not checked');
    expect(s.undo).toHaveLength(0);
  });
  test('the arriving move reports the bottom five, and S0 teaches instead', () => {
    const s = place(A, initialState(A), [
      ['Bat', 'Can fly'],
      ['Crane', 'Bird'],
      ['Elephant', 'Has a trunk'],
      ['Hammer', 'Has a head, no brain'],
    ]);
    const last = ['Penguin', 'Lays eggs'];
    const sel = tap(s, A, T(s.tray.indexOf('Penguin')), opts).state;
    const out = tap(sel, A, H(last[1]), opts);
    expect(out.status).toBe('Penguin under Lays eggs. The bottom five are out.');
    expect(out.announce).toMatch(/^.+ Five more headings: Has a tongue, can't taste, Has ears, can't hear, Body part, Baseball equipment, Mammal\. Five more words: Bass, Corn, Heart, Palm, Shoe\. The top five are full, not checked\.$/);
    const s0 = tap(sel, A, H(last[1]), { ...opts, firstBoard: true });
    expect(s0.status).toBe('Fill all ten, then check.');
  });
  test('emptying a top heading later does not hide section 2', () => {
    let s = fillTop(A);
    s = run(A, s, H('Can fly'), T(0)).s; // tray cell 0 is Bass: swap it in, Bat out
    s = run(A, s, H('Can fly'), H('Mammal')).s; // then empty Can fly
    expect(s.placements['Can fly']).toBeNull();
    expect(s.s2).toBe(true);
  });
});

describe('Undo', () => {
  test('restores the exact previous arrangement and tray, with a status that names it', () => {
    const s1 = place(A, initialState(A), [['Bat', 'Can fly']]);
    const s2 = run(A, s1, T(1), H('Can fly')).s; // Crane under Can fly, Bat back
    const out = tap(s2, A, { kind: 'undo' }, opts);
    expect(out.state.placements).toEqual(s1.placements);
    expect(out.state.tray).toEqual(s1.tray);
    expect(out.status).toBe('Undone: Crane back to the tray, Bat back under Can fly.');
  });
  test('the first placement undone reads like the dossier', () => {
    const s1 = place(A, initialState(A), [['Bat', 'Can fly']]);
    expect(tap(s1, A, { kind: 'undo' }, opts).status).toBe('Undone: Bat back to the tray.');
  });
  test('never reverses a check, a hint or a pin', () => {
    const s = full(A, { Heart: "Has ears, can't hear" }); // swaps with Corn
    const checked = tap(s, A, { kind: 'check' }, opts).state;
    expect(checked.checks).toHaveLength(1);
    const undone = tap(checked, A, { kind: 'undo' }, opts).state;
    expect(undone.checks).toHaveLength(1);
    // The nudge leaves the stack alone; a pin clears it, so nothing can move a pinned word.
    const nudged = tap(tap(checked, A, { kind: 'hint' }, opts).state, A, { kind: 'confirm' }, opts).state;
    expect(nudged.hints).toHaveLength(1);
    const pinned = tap(tap(nudged, A, { kind: 'hint' }, opts).state, A, { kind: 'confirm' }, opts).state;
    expect(pinned.hints.map((h) => h.rung)).toEqual(['nudge', 'pin']);
    expect(pinned.undo).toHaveLength(0);
    expect(tap(pinned, A, { kind: 'undo' }, opts).state).toBe(pinned);
  });
});

describe('checks (3.6)', () => {
  test('per-half counts; the plausible first check on board B is 2 + 4 = 6', () => {
    // DOSSIER-v2 3.10: Needle on the verb, Egg on the double g, Dog on Lays eggs, Snail in the shell.
    let s = full(B);
    s = place(B, s, [
      ['Needle', 'You can ___ someone'],
      ['Egg', 'Same letter twice in a row'],
      ['Snail', 'Has a shell'],
    ]);
    // Whatever was displaced now sits where the moved words were; put Dog on Lays eggs.
    s = place(B, s, [['Dog', 'Lays eggs']]);
    const out = tap(s, B, { kind: 'check' }, opts);
    expect(out.state.checks[0].counts).toEqual([2, 4]);
    expect(out.status).toBe('Check 1: 6 right. 3 checks left.');
    expect(out.announce).toBe('Check 1 of 4. Top five headings: 2 hold the right word. Bottom five: 4.');
    expect(sectionHeader(out.state, B, 0)).toBe('Top five · 2 of 5 right at check 1');
    expect(sectionHeader(out.state, B, 1)).toBe('Bottom five · 4 of 5 right at check 1');
  });
  test('an identical arrangement is blocked; a change marks that half stale', () => {
    const s = full(C, { Taco: 'Has a head, no brain' });
    const c1 = tap(s, C, { kind: 'check' }, opts).state;
    expect(alreadyChecked(c1, C)).toBe(true);
    expect(checkButton(c1, C).label).toBe('Already checked');
    const again = tap(c1, C, { kind: 'check' }, opts);
    expect(again.state.checks).toHaveLength(1);
    const moved = place(C, c1, [['Taco', 'Has a shell']]);
    expect(sectionHeader(moved, C, 0)).toBe('Top five · changed since check 1');
  });
  test('solved means all ten right at a check', () => {
    const out = tap(full(A), A, { kind: 'check' }, opts);
    expect(out.state.ended).toBe('solved');
    expect(out.status).toBe('Solved on check 1 of 4.');
    expect(out.effects.map((e) => e.type)).toEqual(['check', 'end']);
  });
  test('out of checks after the fourth miss, and the board moves to the answer', () => {
    let s = full(C, { Taco: 'Has a head, no brain' });
    const swaps: [string, string][] = [
      ['Knight', 'Fruit'],
      ['Swan', 'Bird'],
      ['Date', 'Fruit'],
    ];
    for (let i = 0; i < 4; i++) {
      s = tap(s, C, { kind: 'check' }, opts).state;
      if (s.ended) break;
      s = place(C, s, [swaps[i]]);
    }
    expect(s.checks).toHaveLength(4);
    expect(s.ended).toBe('out');
    for (const w of Object.keys(C.answer)) expect(s.placements[C.answer[w]]).toBe(w);
  });
  test('Show answer is two-step and ends the board unsolved', () => {
    const s = fillTop(A);
    const ask = tap(s, A, { kind: 'show' }, opts);
    expect(ask.status).toBe("Show the answer? This ends today's board.");
    expect(ask.state.ended).toBeNull();
    const keep = tap(ask.state, A, { kind: 'cancel' }, opts);
    expect(keep.state.confirm).toBeNull();
    const shown = tap(tap(s, A, { kind: 'show' }, opts).state, A, { kind: 'confirm' }, opts);
    expect(shown.state.ended).toBe('shown');
  });
  test('the board locks once ended', () => {
    const done = tap(full(A), A, { kind: 'check' }, opts).state;
    expect(tap(done, A, T(0), opts).state).toBe(done);
    expect(tap(done, A, H('Bird'), opts).state).toBe(done);
  });
});

describe('hints (3.7)', () => {
  const s2 = (board: DailyBoard) => fillTop(board);

  test('rung 1 names the nudge word and moves nothing', () => {
    const s = s2(C);
    const asked = tap(s, C, { kind: 'hint' }, opts);
    expect(asked.status).toBe('Hint 1 names a word with a second life. It shows on your card.');
    const used = tap(asked.state, C, { kind: 'confirm' }, opts);
    expect(used.state.hints).toEqual([{ rung: 'nudge', word: 'Egg' }]);
    expect(used.state.placements).toEqual(s.placements);
    expect(used.announce).toBe("One of today's words has a second life: Egg.");
  });
  test('rung 2 pins the first word in the proof order not already home', () => {
    expect(pinTarget(initialState(B), B)).toBe('Bass');
    const s = s2(B);
    const nudged = tap(tap(s, B, { kind: 'hint' }, opts).state, B, { kind: 'confirm' }, opts).state;
    const pinned = tap(tap(nudged, B, { kind: 'hint' }, opts).state, B, { kind: 'confirm' }, opts).state;
    expect(pinned.hints[1]).toEqual({ rung: 'pin', word: 'Bass' });
    expect(pinned.placements['Musical instrument']).toBe('Bass');
    // A pinned card can't be selected or replaced.
    const t = tap(pinned, B, H('Musical instrument'), opts);
    expect(t.status).toBe('Pinned. It stays.');
    expect(t.state.selected).toBeNull();
  });
  test('the exclusive sentence only when every other board word is N for that heading', () => {
    expect(pinReason(A, 'Bat')).toBe("Baseball equipment takes only one of today's words, by our key: Bat.");
    expect(pinReason(B, 'Bass')).toBe("Musical instrument takes only one of today's words, by our key: Bass (a bass guitar).");
    expect(pinReason(C, 'Club')).toBe("Has a head, no brain takes only one of today's words, by our key: Club (a golf club).");
    // Bird on board A has Crane (S) and Bat (n): never "takes only one".
    expect(pinReason(A, 'Penguin')).toBe("Everything else that fits Bird is needed elsewhere, so it's Penguin.");
    // Lays eggs on board C: Swan, Penguin, Kiwi fit too.
    expect(pinReason(C, 'Crab')).toBe("Everything else that fits Lays eggs is needed elsewhere, so it's Crab (crabs do).");
  });
  test('no hints before section 2, at most two', () => {
    expect(tap(initialState(A), A, { kind: 'hint' }, opts).status).toBeNull();
    let s = s2(A);
    for (let i = 0; i < 2; i++) s = tap(tap(s, A, { kind: 'hint' }, opts).state, A, { kind: 'confirm' }, opts).state;
    expect(s.hints).toHaveLength(2);
    expect(tap(s, A, { kind: 'hint' }, opts).status).toBeNull();
  });
});

describe('restore (S7)', () => {
  test('a stored state comes back exactly, pins included; a bad record is repaired', () => {
    let s = fillTop(B);
    s = tap(tap(s, B, { kind: 'hint' }, opts).state, B, { kind: 'confirm' }, opts).state;
    s = tap(tap(s, B, { kind: 'hint' }, opts).state, B, { kind: 'confirm' }, opts).state;
    const back = restoreState(B, { placements: s.placements, tray: s.tray, s2: s.s2, checks: s.checks, hints: s.hints, ended: s.ended, started: true });
    expect(back.placements).toEqual(s.placements);
    expect(back.tray).toEqual(s.tray);
    const broken = restoreState(B, { placements: { Mammal: 'Dog', Fruit: 'Nope' }, tray: ['Dog', 'Bass'], s2: false, checks: [], hints: [], ended: null, started: true });
    const all = Object.values(broken.placements).filter(Boolean).concat(broken.tray.filter(Boolean) as string[]);
    expect(all.sort()).toEqual(B.sections[0].words.slice().sort());
  });
});
