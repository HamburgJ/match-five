// Calendar maths on YYYY-MM-DD strings. Every day count is done in UTC on the
// date string itself, so daylight-saving changes and time-zone moves never make
// a day 23 or 25 hours long, and a board number depends only on its date.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01, "2026-1-1"). */
export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

const toUtc = (date: string) => {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`not a date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};
const fromUtc = (ms: number) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** The visitor's local calendar date. */
export const localDate = (now: Date = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * DAY_MS);

/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

/** The latest date that is already today somewhere on Earth (UTC+14). */
export const latestPlayableDate = (now: Date = new Date()) => fromUtc(now.getTime() + 14 * 3_600_000);

/** Board #1 is the launch date. */
export const boardNumber = (date: string, launch: string) => daysBetween(launch, date) + 1;

export const weekday = (date: string) => new Date(toUtc(date)).getUTCDay();

/** "Fri 27 Nov" */
export const shortLabel = (date: string) => {
  const t = new Date(toUtc(date));
  return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
};

/** "November 2026" */
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
};

export const monthOf = (date: string) => date.slice(0, 7);

/** Days in a YYYY-MM month, as date strings. */
export const daysOfMonth = (month: string) => {
  const first = `${month}-01`;
  const out: string[] = [];
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) out.push(d);
  return out;
};

export const previousMonth = (month: string) => monthOf(addDays(`${month}-01`, -1));

export type Via = 'today' | 'yesterday' | 'archive' | 'tomorrow';

/** How a dated board relates to the visitor's local today. */
export const viaFor = (date: string, today: string): Via => {
  if (date === today) return 'today';
  if (date > today) return 'tomorrow';
  if (date === addDays(today, -1)) return 'yesterday';
  return 'archive';
};

export type Route =
  | { kind: 'today' }
  | { kind: 'date'; date: string }
  | { kind: 'malformed' };

/**
 * /match-five/daily/ and /match-five/daily/YYYY-MM-DD/ (with or without the
 * trailing slash). Anything else under /daily/ is malformed (S11).
 */
export const parseRoute = (pathname: string): Route => {
  const m = /\/daily\/?(.*)$/.exec(pathname);
  if (!m) return { kind: 'today' };
  const rest = m[1].replace(/\/+$/, '');
  if (rest === '') return { kind: 'today' };
  return isDateString(rest) ? { kind: 'date', date: rest } : { kind: 'malformed' };
};

export const dailyPath = (date?: string) => (date ? `/match-five/daily/${date}/` : '/match-five/daily/');
