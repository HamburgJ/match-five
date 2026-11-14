// Daily events (DOSSIER-v2 8.5). Registered dimensions only, `game` is
// match_five_daily and `level` is the board number on every event. GA is started
// (or not) by src/utils/analytics.ts's initGA behind its host guard, which
// defines window.gtag; until then these helpers send nothing, so local, preview
// and automated runs stay out of the property. Calling gtag directly keeps
// react-ga4 out of the daily's bundle.
import type { Via } from './dates';

const GAME = 'match_five_daily';

type Params = Record<string, string | number | boolean | undefined>;

const send = (name: string, level: number, params: Params = {}) => {
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== 'function') return;
    gtag('event', name, { game: GAME, level, ...params });
  } catch {
    /* analytics never breaks play */
  }
};

/** `<1m`, `1-2m`, `2-4m`, `4-6m`, `6-10m`, `10m+`: GA4 has no medians, so a histogram. */
export const timeBand = (ms: number) => {
  const m = ms / 60_000;
  if (m < 1) return '<1m';
  if (m < 2) return '1-2m';
  if (m < 4) return '2-4m';
  if (m < 6) return '4-6m';
  if (m < 10) return '6-10m';
  return '10m+';
};

const timed = (ms: number) => ({ time_ms: Math.max(0, Math.round(ms)), time_band: timeBand(ms) });

export const logGameStart = (level: number, via: Via, fresh: boolean, sinceReadyMs: number) =>
  send('game_start', level, { via, fresh, ...timed(sinceReadyMs) });

export const logSectionTwo = (level: number, sinceFirstMoveMs: number) =>
  send('level_complete', level, { reason: 'section_2', ...timed(sinceFirstMoveMs) });

export const logCheck = (level: number, right: number, index: number, via: Via) =>
  send('daily_check', level, { count: right, reason: `check_${index}`, via });

export const logHint = (level: number, index: number, rung: 'nudge' | 'pin', via: Via) =>
  send('hint_used', level, { count: index, reason: rung, via });

export const logSolved = (level: number, checks: number, hints: number, via: Via, elapsedMs: number) =>
  send('puzzle_solved', level, { count: checks, reason: `hints_${hints}`, via, ...timed(elapsedMs) });

export const logUnsolved = (level: number, bestRight: number, reason: 'out_of_checks' | 'show_answer', via: Via, elapsedMs: number) =>
  send('game_complete', level, { count: bestRight, reason, via, ...timed(elapsedMs) });

export const logDispute = (level: number, word: string, heading: string) =>
  send('daily_dispute', level, { reason: `${word}>${heading}` });

export const logShare = (level: number, method: 'copy' | 'web_share', via: Via) => send('share', level, { method, via });

/** The production host check, mirrored here for the daily's own boot decision. */
export const isProductionHost = () => {
  try {
    return window.location.hostname === 'burgerfun.ca' && !navigator.webdriver;
  } catch {
    return false;
  }
};
