// The daily's rules as a pure state machine: the tap table (DOSSIER-v2 3.2),
// section 2's arrival (3.3), checks (3.6), hints (3.7) and Undo. No DOM, no
// storage, no clock except the `now` passed in. Every status string the player
// reads comes from here, so the unit tests pin the copy too.
import type { CheckRecord, DailyBoard, Ended, HintRecord, Placements, Spot, Tray } from './types';
import { cellKey, headingsOf, ownerOf, tierOf, topHeadings, wordsOf } from './board';

export const MAX_CHECKS = 4;

export interface Snapshot {
  placements: Placements;
  tray: Tray;
}

export interface PlayState {
  placements: Placements;
  tray: Tray;
  s2: boolean;
  selected: Spot | null;
  checks: CheckRecord[];
  hints: HintRecord[];
  ended: Ended;
  undo: Snapshot[];
  confirm: null | 'hint' | 'show';
  started: boolean;
  /** S0 teaching: the check line has been shown once. */
  taughtCheck: boolean;
}

export type Target =
  | Spot
  | { kind: 'gap' }
  | { kind: 'check' }
  | { kind: 'undo' }
  | { kind: 'hint' }
  | { kind: 'show' }
  | { kind: 'confirm' }
  | { kind: 'cancel' };

export type Effect =
  | { type: 'first-placement' }
  | { type: 's2' }
  | { type: 'check'; check: CheckRecord; index: number }
  | { type: 'end'; ended: Exclude<Ended, null> }
  | { type: 'hint'; hint: HintRecord; index: number };

export interface Outcome {
  state: PlayState;
  /** New status line text; null leaves it unchanged. */
  status: string | null;
  /** What the live region says when it differs from the status line. */
  announce?: string;
  effects: Effect[];
  /** The arrangement or record changed and must be written before drawing. */
  save: boolean;
}

export interface TapOptions {
  /** The player's first board (S0): the status line teaches. */
  firstBoard: boolean;
  now: number;
}

const byAlpha = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

export const initialState = (board: DailyBoard): PlayState => {
  const placements: Placements = {};
  for (const h of headingsOf(board)) placements[h] = null;
  return {
    placements,
    tray: board.sections[0].words.slice().sort(byAlpha),
    s2: false,
    selected: null,
    checks: [],
    hints: [],
    ended: null,
    undo: [],
    confirm: null,
    started: false,
    taughtCheck: false,
  };
};

// ---------------------------------------------------------------- queries

export const pinnedWords = (state: Pick<PlayState, 'hints'>) => state.hints.filter((h) => h.rung === 'pin').map((h) => h.word);
export const isPinnedHeading = (state: PlayState, board: DailyBoard, heading: string) =>
  pinnedWords(state).some((w) => board.answer[w] === heading);

export const liveHeadings = (state: PlayState, board: DailyBoard) => (state.s2 ? headingsOf(board) : topHeadings(board));

export const wordAt = (state: PlayState, spot: Spot) =>
  spot.kind === 'tray' ? state.tray[spot.index] ?? null : state.placements[spot.heading] ?? null;

export const allFilled = (state: PlayState, board: DailyBoard) => state.s2 && headingsOf(board).every((h) => state.placements[h]);

export const arrangementOf = (state: PlayState, board: DailyBoard) => headingsOf(board).map((h) => state.placements[h] || '');

export const countsFor = (arrangement: string[], board: DailyBoard): [number, number] => {
  const hs = headingsOf(board);
  let top = 0;
  let bottom = 0;
  hs.forEach((h, i) => {
    if (arrangement[i] && arrangement[i] === ownerOf(board, h)) {
      if (i < 5) top += 1;
      else bottom += 1;
    }
  });
  return [top, bottom];
};

export const alreadyChecked = (state: PlayState, board: DailyBoard) => {
  const key = arrangementOf(state, board).join('|');
  return state.checks.some((c) => c.arrangement.join('|') === key);
};

export const checksLeft = (state: PlayState) => MAX_CHECKS - state.checks.length;

export interface CheckButton {
  label: string;
  enabled: boolean;
  /** What the status line says when a disabled Check is tapped. */
  reason: string;
}

export const checkButton = (state: PlayState, board: DailyBoard): CheckButton => {
  const left = checksLeft(state);
  const label = `Check · ${left} left`;
  if (!allFilled(state, board)) return { label, enabled: false, reason: 'Fill all ten, then check.' };
  if (state.selected) {
    const w = wordAt(state, state.selected);
    return { label, enabled: false, reason: `Place ${w} or tap it again to let go.` };
  }
  if (alreadyChecked(state, board)) return { label: 'Already checked', enabled: false, reason: 'Already checked. Move a word, then check again.' };
  return { label, enabled: true, reason: '' };
};

/** "Top five · 3 of 5 right at check 1" and friends (3.6). */
export const sectionHeader = (state: PlayState, board: DailyBoard, half: 0 | 1) => {
  const name = half === 0 ? 'Top five' : 'Bottom five';
  if (state.ended === 'shown' || state.ended === 'out') return `${name} · the answer`;
  if (!state.s2) return name;
  const n = state.checks.length;
  if (n === 0) {
    if (half === 1) return name;
    const full = topHeadings(board).every((h) => state.placements[h]);
    return `${name} · ${full ? 'full, not checked' : 'not checked'}`;
  }
  const last = state.checks[n - 1];
  const now = arrangementOf(state, board);
  const range = half === 0 ? [0, 5] : [5, 10];
  const same = now.slice(range[0], range[1]).join('|') === last.arrangement.slice(range[0], range[1]).join('|');
  return same ? `${name} · ${last.counts[half]} of 5 right at check ${n}` : `${name} · changed since check ${n}`;
};

// ---------------------------------------------------------------- hints

export const hintRungs = (board: DailyBoard): HintRecord['rung'][] => (board.nudge ? ['nudge', 'pin'] : ['pin']);

/** The first word in the proof order that is not already in its answer heading. */
export const pinTarget = (state: PlayState, board: DailyBoard) => {
  const pinned = pinnedWords(state);
  return board.proofOrder.find((w) => !pinned.includes(w) && state.placements[board.answer[w]] !== w) || null;
};

export const nextHint = (state: PlayState, board: DailyBoard): HintRecord['rung'] | null => {
  if (!state.s2 || state.ended) return null;
  const rung = hintRungs(board)[state.hints.length];
  if (!rung) return null;
  if (rung === 'pin' && !pinTarget(state, board)) return null;
  return rung;
};

export const hintQuestion = (rung: HintRecord['rung'], index: number) =>
  rung === 'nudge'
    ? `Hint ${index} names a word with a second life. It shows on your card.`
    : `Hint ${index} places the next word the logic forces. It shows on your card.`;

const glossed = (board: DailyBoard, word: string, heading: string) => {
  const g = board.gloss[cellKey(word, heading)];
  return g ? `${word} (${g})` : word;
};

/** The pin's one-line reason, from the key (3.7). */
export const pinReason = (board: DailyBoard, word: string) => {
  const heading = board.answer[word];
  const exclusive = wordsOf(board).every((w) => w === word || tierOf(board, w, heading) === 'N');
  return exclusive
    ? `${heading} takes only one of today's words, by our key: ${glossed(board, word, heading)}.`
    : `Everything else that fits ${heading} is needed elsewhere, so it's ${glossed(board, word, heading)}.`;
};

export const hintText = (board: DailyBoard, hint: HintRecord) =>
  hint.rung === 'nudge' ? `One of today's words has a second life: ${hint.word}.` : pinReason(board, hint.word);

// ---------------------------------------------------------------- moves

const clone = (s: PlayState): PlayState => ({
  ...s,
  placements: { ...s.placements },
  tray: s.tray.slice(),
  checks: s.checks.slice(),
  hints: s.hints.slice(),
  undo: s.undo.slice(),
});

const snapshot = (s: PlayState): Snapshot => ({ placements: { ...s.placements }, tray: s.tray.slice() });

/** Where each word sits. */
const positions = (placements: Placements, tray: Tray) => {
  const at: Record<string, string> = {};
  for (const [h, w] of Object.entries(placements)) if (w) at[w] = `h:${h}`;
  tray.forEach((w, i) => {
    if (w) at[w] = `t:${i}`;
  });
  return at;
};

/** "Undone: Kiwi back to the tray, Date back under Fruit." from the two positions. */
const undoStatus = (from: Snapshot, to: Snapshot, order: string[]) => {
  const a = positions(from.placements, from.tray);
  const b = positions(to.placements, to.tray);
  const parts = order
    .filter((w) => b[w] && a[w] !== b[w])
    .map((w) => (b[w].startsWith('t:') ? `${w} back to the tray` : `${w} back under ${b[w].slice(2)}`));
  return parts.length ? `Undone: ${parts.join(', ')}.` : 'Undone.';
};

const arriveIfFull = (s: PlayState, board: DailyBoard, opts: TapOptions, moveStatus: string, effects: Effect[]) => {
  if (s.s2 || !topHeadings(board).every((h) => s.placements[h])) return { status: moveStatus, announce: undefined as string | undefined };
  s.s2 = true;
  const incoming = board.sections[1].words.slice().sort(byAlpha);
  let next = 0;
  s.tray = s.tray.map((w) => w || incoming[next++] || null);
  // Section 2 is a one-way door: the moves before it can't be undone into a
  // tray that now holds five new words.
  s.undo = [];
  effects.push({ type: 's2' });
  const announce = `${moveStatus} Five more headings: ${board.sections[1].headings.join(', ')}. Five more words: ${incoming.join(', ')}. The top five are full, not checked.`;
  return { status: opts.firstBoard ? 'Fill all ten, then check.' : `${moveStatus} The bottom five are out.`, announce };
};

const move = (
  state: PlayState,
  board: DailyBoard,
  opts: TapOptions,
  apply: (s: PlayState) => string,
): Outcome => {
  const s = clone(state);
  s.undo.push(snapshot(state));
  if (s.undo.length > 50) s.undo.shift();
  const moveStatus = apply(s);
  s.selected = null;
  s.confirm = null;
  const effects: Effect[] = [];
  if (!s.started) {
    s.started = true;
    effects.push({ type: 'first-placement' });
  }
  const arrived = arriveIfFull(s, board, opts, moveStatus, effects);
  let status = arrived.status;
  if (opts.firstBoard && !s.taughtCheck && s.checks.length === 0 && allFilled(s, board)) {
    s.taughtCheck = true;
    status = `${moveStatus} A check counts the right words in each half, not which ones.`;
  }
  return { state: s, status, announce: arrived.announce, effects, save: true };
};

const unchanged = (state: PlayState, status: string | null = null): Outcome => ({ state, status, effects: [], save: false });

const select = (state: PlayState, spot: Spot, status: string): Outcome => ({
  state: { ...state, selected: spot, confirm: null },
  status,
  effects: [],
  save: false,
});

const deselect = (state: PlayState): Outcome => ({ state: { ...state, selected: null, confirm: null }, status: 'Tap a word.', effects: [], save: false });

const PINNED = 'Pinned. It stays.';

const tapBoard = (state: PlayState, board: DailyBoard, target: Spot, opts: TapOptions): Outcome => {
  const live = liveHeadings(state, board);
  if (target.kind === 'heading' && !live.includes(target.heading)) return unchanged(state);
  if (target.kind === 'heading' && isPinnedHeading(state, board, target.heading)) return { ...unchanged(state, PINNED), state: { ...state, confirm: null } };
  const targetWord = wordAt(state, target);
  const sel = state.selected;

  if (!sel) {
    if (!targetWord) return unchanged(state);
    return target.kind === 'tray'
      ? select(state, target, `${targetWord}: tap a heading.`)
      : select(state, target, `${targetWord}: tap another heading, or an empty tray cell.`);
  }

  const word = wordAt(state, sel) as string;

  if (sel.kind === 'tray') {
    if (target.kind === 'tray') {
      if (target.index === sel.index) return deselect(state);
      if (targetWord) return select(state, target, `${targetWord}: tap a heading.`);
      return unchanged(state);
    }
    const heading = target.heading;
    return move(state, board, opts, (s) => {
      s.placements[heading] = word;
      s.tray[sel.index] = targetWord;
      return targetWord ? `${word} under ${heading}. ${targetWord} back to the tray.` : `${word} under ${heading}.`;
    });
  }

  // A placed word is selected.
  const from = sel.heading;
  if (target.kind === 'heading') {
    if (target.heading === from) return deselect(state);
    const to = target.heading;
    return move(state, board, opts, (s) => {
      s.placements[to] = word;
      s.placements[from] = targetWord;
      return targetWord ? `Swapped: ${word} to ${to}, ${targetWord} to ${from}.` : `${word} moved to ${to}.`;
    });
  }
  return move(state, board, opts, (s) => {
    s.tray[target.index] = word;
    s.placements[from] = targetWord;
    return targetWord ? `${targetWord} under ${from}. ${word} back to the tray.` : `${word} back to the tray.`;
  });
};

const solvedStatus = (n: number) => `Solved on check ${n} of ${MAX_CHECKS}.`;

const revealAnswer = (s: PlayState, board: DailyBoard) => {
  for (const w of wordsOf(board)) s.placements[board.answer[w]] = w;
  s.tray = [null, null, null, null, null];
  s.selected = null;
  s.confirm = null;
  s.undo = [];
};

const doCheck = (state: PlayState, board: DailyBoard, opts: TapOptions): Outcome => {
  const button = checkButton(state, board);
  if (!button.enabled) return { ...unchanged(state, button.reason), state: { ...state, confirm: null } };
  const s = clone(state);
  s.confirm = null;
  const arrangement = arrangementOf(state, board);
  const counts = countsFor(arrangement, board);
  const check: CheckRecord = { arrangement, counts, at: opts.now };
  s.checks.push(check);
  const n = s.checks.length;
  const right = counts[0] + counts[1];
  const effects: Effect[] = [{ type: 'check', check, index: n }];
  const announce = `Check ${n} of ${MAX_CHECKS}. Top five headings: ${counts[0]} hold the right word. Bottom five: ${counts[1]}.`;
  if (right === 10) {
    s.ended = 'solved';
    s.selected = null;
    s.undo = [];
    effects.push({ type: 'end', ended: 'solved' });
    return { state: s, status: solvedStatus(n), announce: `${announce} Solved.`, effects, save: true };
  }
  if (n >= MAX_CHECKS) {
    s.ended = 'out';
    revealAnswer(s, board);
    effects.push({ type: 'end', ended: 'out' });
    const status = `Check ${n}: ${right} right. Here is the one that fits.`;
    return { state: s, status, announce: `${announce} Here is the one that fits.`, effects, save: true };
  }
  const left = MAX_CHECKS - n;
  return {
    state: s,
    status: `Check ${n}: ${right} right. ${left} ${left === 1 ? 'check' : 'checks'} left.`,
    announce,
    effects,
    save: true,
  };
};

const applyHint = (state: PlayState, board: DailyBoard): Outcome => {
  const rung = nextHint(state, board);
  if (!rung) return { ...unchanged(state), state: { ...state, confirm: null } };
  const s = clone(state);
  s.confirm = null;
  s.selected = null;
  if (rung === 'nudge') {
    const hint: HintRecord = { rung, word: board.nudge as string };
    s.hints.push(hint);
    const text = hintText(board, hint);
    return { state: s, status: `Hint: ${text.charAt(0).toLowerCase()}${text.slice(1)}`, announce: text, effects: [{ type: 'hint', hint, index: s.hints.length }], save: true };
  }
  const word = pinTarget(state, board) as string;
  const heading = board.answer[word];
  const from: Spot | null =
    state.tray.indexOf(word) >= 0
      ? { kind: 'tray', index: state.tray.indexOf(word) }
      : (() => {
          const h = Object.keys(state.placements).find((k) => state.placements[k] === word);
          return h ? ({ kind: 'heading', heading: h } as Spot) : null;
        })();
  const bumped = state.placements[heading];
  s.placements[heading] = word;
  if (from?.kind === 'tray') s.tray[from.index] = bumped;
  if (from?.kind === 'heading') s.placements[from.heading] = bumped;
  // Undo never reverses a pin, and nothing before it may move the pinned word.
  s.undo = [];
  const hint: HintRecord = { rung: 'pin', word };
  s.hints.push(hint);
  const moved = bumped ? (from?.kind === 'heading' ? ` ${bumped} moved to ${from.heading}.` : ` ${bumped} back to the tray.`) : '';
  const status = `Pinned: ${word} under ${heading}.${moved}`;
  return { state: s, status, announce: `${status} ${pinReason(board, word)}`, effects: [{ type: 'hint', hint, index: s.hints.length }], save: true };
};

/** Apply one tap. Locked once the board has ended. */
export const tap = (state: PlayState, board: DailyBoard, target: Target, opts: TapOptions): Outcome => {
  if (state.ended) return unchanged(state);
  switch (target.kind) {
    case 'tray':
    case 'heading':
      return tapBoard(state, board, target, opts);
    case 'gap':
      return unchanged(state);
    case 'check':
      return doCheck(state, board, opts);
    case 'undo': {
      const last = state.undo[state.undo.length - 1];
      if (!last) return unchanged(state);
      const s = clone(state);
      s.undo.pop();
      s.placements = { ...last.placements };
      s.tray = last.tray.slice();
      s.selected = null;
      s.confirm = null;
      return { state: s, status: undoStatus(snapshot(state), last, wordsOf(board)), effects: [], save: true };
    }
    case 'hint': {
      const rung = nextHint(state, board);
      if (!rung) return unchanged(state);
      return { state: { ...state, confirm: 'hint', selected: null }, status: hintQuestion(rung, state.hints.length + 1), effects: [], save: false };
    }
    case 'show':
      if (!state.s2) return unchanged(state);
      return { state: { ...state, confirm: 'show', selected: null }, status: "Show the answer? This ends today's board.", effects: [], save: false };
    case 'cancel':
      return { state: { ...state, confirm: null }, status: 'Tap a word.', effects: [], save: false };
    case 'confirm': {
      if (state.confirm === 'hint') return applyHint(state, board);
      if (state.confirm === 'show') {
        const s = clone(state);
        s.ended = 'shown';
        revealAnswer(s, board);
        return { state: s, status: 'Here is the one that fits.', effects: [{ type: 'end', ended: 'shown' }], save: true };
      }
      return unchanged(state);
    }
    default:
      return unchanged(state);
  }
};

/** Rebuild play state from a stored record; repairs anything inconsistent. */
export const restoreState = (
  board: DailyBoard,
  rec: { placements: Placements; tray: (string | null)[]; s2: boolean; checks: CheckRecord[]; hints: HintRecord[]; ended: Ended; started: boolean },
): PlayState => {
  const base = initialState(board);
  const words = wordsOf(board);
  const s: PlayState = {
    ...base,
    s2: !!rec.s2,
    checks: (rec.checks || []).slice(0, MAX_CHECKS),
    hints: (rec.hints || []).filter((h) => words.includes(h.word)).slice(0, 2),
    ended: rec.ended || null,
    started: !!rec.started,
  };
  if (s.ended === 'solved' || s.ended === 'shown' || s.ended === 'out') {
    revealAnswer(s, board);
    return s;
  }
  // Placements: only real headings and real words, each word once.
  const live = s.s2 ? headingsOf(board) : topHeadings(board);
  const pool = s.s2 ? words : board.sections[0].words;
  const used = new Set<string>();
  for (const h of live) {
    const w = rec.placements?.[h];
    if (w && pool.includes(w) && !used.has(w)) {
      s.placements[h] = w;
      used.add(w);
    }
  }
  // Pins hold their place whatever the record says.
  for (const w of pinnedWords(s)) {
    const h = board.answer[w];
    const prev = Object.keys(s.placements).find((k) => s.placements[k] === w);
    if (prev && prev !== h) s.placements[prev] = null;
    const bumped = s.placements[h];
    if (bumped && bumped !== w) used.delete(bumped);
    s.placements[h] = w;
    used.add(w);
  }
  // Tray: keep stored cells where valid, then fill gaps with whatever is unplaced.
  const tray: Tray = [null, null, null, null, null];
  (rec.tray || []).slice(0, 5).forEach((w, i) => {
    if (w && pool.includes(w) && !used.has(w)) {
      tray[i] = w;
      used.add(w);
    }
  });
  const rest = pool.filter((w) => !used.has(w)).sort(byAlpha);
  for (let i = 0; i < 5 && rest.length; i++) if (!tray[i]) tray[i] = rest.shift() as string;
  s.tray = tray;
  // A finished check that solved, or the fourth, ends the board even if the record missed it.
  const solvedAt = s.checks.findIndex((c) => c.counts[0] + c.counts[1] === 10);
  if (solvedAt >= 0) {
    s.checks = s.checks.slice(0, solvedAt + 1);
    s.ended = 'solved';
    revealAnswer(s, board);
  } else if (s.checks.length >= MAX_CHECKS) {
    s.ended = 'out';
    revealAnswer(s, board);
  }
  return s;
};
