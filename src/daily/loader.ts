// Fetches the day's board (DOSSIER-v2 8.2). A missing or broken schedule entry is
// not a failure: the reserve board for the date is used, silently. Only a network
// failure with no stored copy of the board is a failure (S12). The client never
// trusts res.ok alone: a non-200 status, a non-JSON body or a parse error all
// mean "no entry".
import type { DailyBoard } from './types';
import { BoardFormatError, fnv1a, normaliseBoard } from './board';
import { addDays, isDateString, monthOf, weekday } from './dates';

export const BOARDS_BASE = `${process.env.PUBLIC_URL || '/match-five'}/daily/boards/`;

export type LoadResult =
  | { kind: 'board'; board: DailyBoard; launch: string; errata: Record<string, string>[] }
  | { kind: 'no-board'; launch: string | null }
  | { kind: 'failed' };

class NetworkError extends Error {}

type Json = Record<string, any>;

/** Returns parsed JSON, null for "no entry" (any non-200, non-JSON or parse error), or throws NetworkError. */
const getJson = async (path: string, fetcher: typeof fetch): Promise<Json | null> => {
  let res: Response;
  try {
    res = await fetcher(path, { credentials: 'same-origin' });
  } catch {
    throw new NetworkError(path);
  }
  if (res.status !== 200) return null;
  if (!/\bjson\b/i.test(res.headers.get('content-type') || '')) return null;
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
};

/** The reserve board for a date is chosen by hashing the date (stable for a frozen reserve list). */
export const reserveIndex = (date: string, length: number) => parseInt(fnv1a(date), 16) % length;

const reserveFor = (reserve: Json, date: string): Json | null => {
  // Boards carrying addedOn join the pool two days after their batch, so a date that may
  // already have been served from the reserve keeps its board (8.2).
  const live = (list: Json[]) => list.filter((b) => b && (!isDateString(b.addedOn) || b.addedOn <= addDays(date, -2)));
  // { generations: [{ from, boards }] }: the latest generation in force on that date.
  if (Array.isArray(reserve.generations)) {
    const gens = reserve.generations
      .filter((g: Json) => g && isDateString(g.from) && Array.isArray(g.boards) && g.boards.length && g.from <= date)
      .sort((a: Json, b: Json) => (a.from < b.from ? 1 : -1));
    const g = gens[0];
    return g ? g.boards[reserveIndex(date, g.boards.length)] : null;
  }
  const all = Array.isArray(reserve) ? reserve : Array.isArray(reserve.boards) ? reserve.boards : null;
  const list = all ? live(all) : null;
  return list && list.length ? list[reserveIndex(date, list.length)] : null;
};

const entryFor = (month: Json, date: string): Json | null => {
  const boards = month.boards ?? month.days ?? month;
  if (Array.isArray(boards)) return boards.find((b: Json) => b && b.date === date) || null;
  if (boards && typeof boards === 'object') return boards[date] || null;
  return null;
};

const errataFor = (errata: Json | null, date: string): Record<string, string>[] => {
  const entry = errata ? (errata.entries ?? errata.dates ?? errata)[date] : null;
  const list = entry && Array.isArray(entry.alternates) ? entry.alternates : [];
  return list.filter((a: unknown) => a && typeof a === 'object' && !Array.isArray(a));
};

export interface LoadContext {
  /** The board date (today or a dated link). */
  date: string;
  /** Latest playable date (UTC+14). */
  latest: string;
  /** A stored copy of this date's board, for offline restore. */
  stored: DailyBoard | null;
  /** Development hosts only: fall back to the worked-board fixtures when no index is served. */
  allowFixtures: boolean;
  fixture?: string | null;
  fetcher?: typeof fetch;
}

const fromStored = (ctx: LoadContext): LoadResult =>
  ctx.stored ? { kind: 'board', board: { ...ctx.stored, source: 'stored' }, launch: '', errata: [] } : { kind: 'failed' };

const loadFixture = async (ctx: LoadContext): Promise<LoadResult> => {
  const data = (await import('./fixtures.json')).default as Json;
  const launch: string = data.launch;
  if (ctx.date < launch || ctx.date > ctx.latest) return { kind: 'no-board', launch };
  // Mon, Tue, Sun: the Monday board; Wed, Thu, Sat: the Wednesday board; Fri: the Friday board.
  const byDay = ['A', 'A', 'A', 'B', 'B', 'C', 'B'][weekday(ctx.date)];
  const pick = ctx.fixture && data.boards[ctx.fixture] ? ctx.fixture : byDay;
  return { kind: 'board', board: normaliseBoard(data.boards[pick], ctx.date, launch, 'fixture'), launch, errata: [] };
};

export const loadBoard = async (ctx: LoadContext): Promise<LoadResult> => {
  const fetcher: typeof fetch = ctx.fetcher || ((input, init) => fetch(input, init));
  // Development hosts can ask for the worked boards explicitly (?board=A|B|C|auto).
  if (ctx.allowFixtures && ctx.fixture) return loadFixture(ctx);
  try {
    const index = await getJson(`${BOARDS_BASE}index.json`, fetcher);
    if (!index || !isDateString(index.launch)) {
      if (ctx.allowFixtures) return await loadFixture(ctx);
      return fromStored(ctx);
    }
    const launch: string = index.launch;
    if (ctx.date < launch || ctx.date > ctx.latest) return { kind: 'no-board', launch };
    const errataJson = await getJson(`${BOARDS_BASE}${typeof index.errata === 'string' ? index.errata : 'errata.json'}`, fetcher).catch(() => null);
    const errata = errataFor(errataJson, ctx.date);
    const month = monthOf(ctx.date);
    const listed = Array.isArray(index.months) ? index.months.includes(month) : true;
    if (listed) {
      const monthFile = await getJson(`${BOARDS_BASE}${month}.json`, fetcher);
      const entry = monthFile ? entryFor(monthFile, ctx.date) : null;
      if (entry) {
        try {
          return { kind: 'board', board: normaliseBoard(entry, ctx.date, launch, 'schedule'), launch, errata };
        } catch (e) {
          if (!(e instanceof BoardFormatError)) throw e;
        }
      }
    }
    const reserveName = typeof index.reserve === 'string' ? index.reserve : typeof index.reserve?.file === 'string' ? index.reserve.file : 'reserve.json';
    const reserveFile = await getJson(`${BOARDS_BASE}${reserveName}`, fetcher);
    const pick = reserveFile ? reserveFor(reserveFile, ctx.date) : null;
    if (pick) {
      try {
        return { kind: 'board', board: normaliseBoard(pick, ctx.date, launch, 'reserve'), launch, errata };
      } catch (e) {
        if (!(e instanceof BoardFormatError)) throw e;
      }
    }
    return ctx.stored ? fromStored(ctx) : { kind: 'failed' };
  } catch (e) {
    if (e instanceof NetworkError || e instanceof BoardFormatError) return fromStored(ctx);
    return fromStored(ctx);
  }
};
