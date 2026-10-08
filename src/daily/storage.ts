// One localStorage key, versioned from day one (DOSSIER-v2 8.4). Every read and
// write is wrapped; storage can be missing, full, blocked or corrupt, and the
// game still plays. Saves merge across tabs: checks only grow, an ending and a
// hint once set stay set, and placements take the newer write.
import type { CheckRecord, DailyBoard, DayRecord, HintRecord } from './types';
import { addDays, daysBetween } from './dates';

export const STORAGE_KEY = 'matchfive:daily:v1';
const PROBE_KEY = 'matchfive:daily:probe';
/** Days a record keeps its copy of the board (offline restore needs only today's). */
const BOARD_COPY_DAYS = 3;

export interface Store {
  v: 1;
  records: Record<string, DayRecord>;
}

const empty = (): Store => ({ v: 1, records: {} });

export const storageAvailable = (ls: Storage | null = safeLocalStorage()) => {
  if (!ls) return false;
  try {
    ls.setItem(PROBE_KEY, '1');
    ls.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
};

export function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const sanitizeRecord = (r: any): DayRecord | null => {
  if (!isObj(r)) return null;
  const checks: CheckRecord[] = Array.isArray(r.checks)
    ? r.checks.filter(
        (c: any) =>
          isObj(c) &&
          Array.isArray(c.arrangement) &&
          c.arrangement.length === 10 &&
          Array.isArray(c.counts) &&
          c.counts.length === 2 &&
          c.counts.every((n: any) => Number.isInteger(n) && n >= 0 && n <= 5),
      )
    : [];
  const hints: HintRecord[] = Array.isArray(r.hints)
    ? r.hints.filter((h: any) => isObj(h) && (h.rung === 'nudge' || h.rung === 'pin') && typeof h.word === 'string')
    : [];
  return {
    boardHash: typeof r.boardHash === 'string' ? r.boardHash : '',
    textVersion: typeof r.textVersion === 'string' ? r.textVersion : '',
    board: isObj(r.board) ? (r.board as DailyBoard) : null,
    placements: isObj(r.placements) ? r.placements : {},
    tray: Array.isArray(r.tray) ? r.tray.slice(0, 5).map((w: any) => (typeof w === 'string' ? w : null)) : [],
    s2: r.s2 === true,
    checks: checks.map((c: any) => ({ arrangement: c.arrangement.map(String), counts: [c.counts[0], c.counts[1]], at: Number(c.at) || 0 })),
    hints: hints.map((h) => ({ rung: h.rung, word: h.word })),
    ended: r.ended === 'solved' || r.ended === 'shown' || r.ended === 'out' ? r.ended : null,
    endedOn: typeof r.endedOn === 'string' ? r.endedOn : null,
    firstMoveMs: typeof r.firstMoveMs === 'number' ? r.firstMoveMs : null,
    elapsedMs: typeof r.elapsedMs === 'number' && r.elapsedMs >= 0 ? r.elapsedMs : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    disputed: Array.isArray(r.disputed) ? r.disputed.filter((x: any) => typeof x === 'string') : [],
    started: r.started === true || (isObj(r.placements) && Object.values(r.placements).some(Boolean)),
    acceptedAfterFix: r.acceptedAfterFix === true,
  };
};

/** Read everything. Corrupt or foreign JSON reads as empty; it is replaced on the next write. */
export const readStore = (ls: Storage | null = safeLocalStorage()): Store => {
  if (!ls) return empty();
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!isObj(parsed) || parsed.v !== 1 || !isObj(parsed.records)) return empty();
    const records: Record<string, DayRecord> = {};
    for (const [date, r] of Object.entries(parsed.records)) {
      const rec = sanitizeRecord(r);
      if (rec) records[date] = rec;
    }
    return { v: 1, records };
  } catch {
    return empty();
  }
};

export const readRecord = (date: string, ls: Storage | null = safeLocalStorage()) => readStore(ls).records[date] || null;

const checkKey = (c: CheckRecord) => `${c.at}|${c.arrangement.join('|')}`;
const solvedCheck = (c: CheckRecord) => c.counts[0] + c.counts[1] === 10;

/** Merge two saves of the same date. Neither tab can undo the other. */
export const mergeRecords = (stored: DayRecord | null | undefined, local: DayRecord): DayRecord => {
  if (!stored) return local;
  const seen = new Set<string>();
  let checks: CheckRecord[] = [];
  for (const c of stored.checks.concat(local.checks)) {
    const k = checkKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    checks.push(c);
  }
  checks.sort((a, b) => a.at - b.at);
  const solvedAt = checks.findIndex(solvedCheck);
  if (solvedAt >= 0) checks = checks.slice(0, solvedAt + 1);
  checks = checks.slice(0, 4);

  const hints: HintRecord[] = [];
  for (const h of stored.hints.concat(local.hints)) if (!hints.some((x) => x.rung === h.rung)) hints.push(h);
  hints.sort((a, b) => (a.rung === b.rung ? 0 : a.rung === 'nudge' ? -1 : 1));

  let ended = stored.ended || local.ended;
  if (solvedAt >= 0) ended = 'solved';
  else if (checks.length >= 4) ended = 'out';
  if (stored.ended === 'shown' || local.ended === 'shown') ended = solvedAt >= 0 ? 'solved' : checks.length >= 4 ? 'out' : 'shown';
  // An errata upgrade outranks the counts it was computed from.
  const accepted = !!(stored.acceptedAfterFix || local.acceptedAfterFix);
  if (accepted && (stored.ended === 'solved' || local.ended === 'solved')) ended = 'solved';

  const newer = local.updatedAt >= stored.updatedAt ? local : stored;
  const endedOns = [stored.endedOn, local.endedOn].filter((d): d is string => !!d).sort();
  return {
    boardHash: local.boardHash || stored.boardHash,
    textVersion: local.textVersion || stored.textVersion,
    board: local.board || stored.board,
    placements: { ...newer.placements },
    tray: newer.tray.slice(),
    s2: stored.s2 || local.s2,
    checks,
    hints: hints.slice(0, 2),
    ended,
    endedOn: ended ? endedOns[0] || null : null,
    firstMoveMs: stored.firstMoveMs ?? local.firstMoveMs,
    elapsedMs: Math.max(stored.elapsedMs, local.elapsedMs),
    updatedAt: Math.max(stored.updatedAt, local.updatedAt),
    disputed: Array.from(new Set(stored.disputed.concat(local.disputed))),
    started: stored.started || local.started,
    acceptedAfterFix: accepted && ended === 'solved',
  };
};

export interface SaveResult {
  ok: boolean;
  record: DayRecord;
}

/**
 * Re-read, merge, write. Synchronous, so a check is on disk before it is drawn.
 * On a full disk, old board copies are dropped and the write retried once.
 */
export const saveRecord = (date: string, local: DayRecord, today: string, ls: Storage | null = safeLocalStorage()): SaveResult => {
  if (!ls) return { ok: false, record: local };
  const store = readStore(ls);
  const merged = mergeRecords(store.records[date], local);
  store.records[date] = merged;
  const write = () => ls.setItem(STORAGE_KEY, JSON.stringify(store));
  try {
    write();
    return { ok: true, record: merged };
  } catch {
    try {
      pruneBoardCopies(store, today, 0);
      write();
      return { ok: true, record: merged };
    } catch {
      return { ok: false, record: merged };
    }
  }
};

/** Drop stored board copies older than `keepDays` before today (results stay). */
export const pruneBoardCopies = (store: Store, today: string, keepDays = BOARD_COPY_DAYS) => {
  const cutoff = addDays(today, -keepDays);
  for (const [date, r] of Object.entries(store.records)) if (date < cutoff && r.board) r.board = null;
};

export const tidyStore = (today: string, ls: Storage | null = safeLocalStorage()) => {
  if (!ls) return;
  try {
    const store = readStore(ls);
    const before = JSON.stringify(store);
    pruneBoardCopies(store, today);
    const after = JSON.stringify(store);
    if (after !== before) ls.setItem(STORAGE_KEY, after);
  } catch {
    /* storage is optional */
  }
};

/** A finished board counts toward the run if it ended no later than the day after its date (decision 9.2). */
export const countsForRun = (date: string, r: DayRecord | undefined | null) =>
  !!r && !!r.ended && !!r.endedOn && daysBetween(date, r.endedOn) <= 1;

export interface Streak {
  run: number;
  finished: number;
  solved: number;
}

/**
 * Decision 9.1 (b): consecutive days finished, solved or not. A day counts when
 * its own board ended by the next local midnight; a board finished early through
 * a friend's link (S15) counts for its own date. The run is alive while today is
 * still unplayed.
 */
export const streakOf = (records: Record<string, DayRecord>, today: string): Streak => {
  let finished = 0;
  let solved = 0;
  for (const r of Object.values(records)) {
    if (r.ended) finished += 1;
    if (r.ended === 'solved') solved += 1;
  }
  let d = countsForRun(today, records[today]) ? today : addDays(today, -1);
  let run = 0;
  while (countsForRun(d, records[d])) {
    run += 1;
    d = addDays(d, -1);
  }
  return { run, finished, solved };
};

export type ArchiveMark = { kind: 'solved'; check: number } | { kind: 'unsolved' } | { kind: 'open' } | { kind: 'none' };

export const archiveMark = (r: DayRecord | null | undefined): ArchiveMark => {
  if (!r || !r.ended) return { kind: 'open' };
  if (r.ended === 'solved') return { kind: 'solved', check: r.checks.length };
  return { kind: 'unsolved' };
};

/** The player has finished a board before: S0's teaching is over. */
export const hasFinishedAny = (records: Record<string, DayRecord>) => Object.values(records).some((r) => !!r.ended);

/**
 * Errata (DOSSIER-v2 7.9): a published board later shown to admit another
 * arrangement stays frozen; a stored check that matches an accepted alternate is
 * upgraded to solved at that check. `alternates` are word -> heading maps;
 * `headings` is the board's heading order. The board and its hash never change.
 */
export const applyErrata = (r: DayRecord, headings: string[], alternates: Record<string, string>[], endedOn: string): DayRecord => {
  if (r.ended === 'solved' || !alternates.length) return r;
  const keys = new Set(alternates.map((alt) => headings.map((h) => Object.keys(alt).find((w) => alt[w] === h) || '').join('|')));
  const at = r.checks.findIndex((c) => keys.has(c.arrangement.join('|')));
  if (at < 0) return r;
  return { ...r, checks: r.checks.slice(0, at + 1), ended: 'solved', endedOn: r.endedOn || endedOn, acceptedAfterFix: true };
};

export const emptyRecord = (board: DailyBoard): DayRecord => ({
  boardHash: board.boardHash,
  textVersion: board.textVersion,
  board,
  placements: {},
  tray: [],
  s2: false,
  checks: [],
  hints: [],
  ended: null,
  endedOn: null,
  firstMoveMs: null,
  elapsedMs: 0,
  updatedAt: 0,
  disputed: [],
  started: false,
});

/** The stored record for this board; a changed board keeps its result, not its placements (8.4). */
export const recordForBoard = (stored: DayRecord | null, board: DailyBoard, errata: Record<string, string>[], today: string): DayRecord => {
  if (!stored) return emptyRecord(board);
  let rec: DayRecord = { ...stored, board: stored.board || board };
  if (stored.boardHash && stored.boardHash !== board.boardHash) {
    rec = { ...rec, boardHash: board.boardHash, placements: {}, tray: [], s2: !!stored.ended || stored.checks.length > 0 || stored.s2 };
  }
  rec.textVersion = board.textVersion;
  rec.board = board;
  if (errata.length) rec = applyErrata(rec, board.sections[0].headings.concat(board.sections[1].headings), errata, today);
  return rec;
};


/** What two tabs can disagree about, for deciding whether to adopt the other's save. */
export const recordSignature = (r: DayRecord) =>
  JSON.stringify([
    Object.keys(r.placements)
      .filter((h) => r.placements[h])
      .sort()
      .map((h) => [h, r.placements[h]]),
    r.tray.filter(Boolean).length ? r.tray : [],
    r.s2,
    r.checks.map((c) => c.at + ':' + c.arrangement.join('|')),
    r.hints.map((h) => h.rung + ':' + h.word),
    r.ended,
  ]);
