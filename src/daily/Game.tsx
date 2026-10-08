// The board, the dock and the card for one date. Every move goes through the
// pure engine; anything that changes the arrangement or the record is written
// to storage synchronously before it is drawn (DOSSIER-v2 2, interruption budget).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FaThumbtack, FaCheck, FaExchangeAlt } from 'react-icons/fa';
import type { DailyBoard, DayRecord, Spot } from './types';
import { bottomHeadings, headingsOf, ownerOf, spokenHeading, topHeadings } from './board';
import {
  checkButton,
  hintText,
  initialState,
  isPinnedHeading,
  liveHeadings,
  nextHint,
  pinnedWords,
  restoreState,
  sectionHeader,
  tap,
  wordAt,
  type Outcome,
  type PlayState,
  type Target,
} from './engine';
import { addDays, dailyPath, localDate, type Via } from './dates';
import { countsForRun, hasFinishedAny, mergeRecords, readRecord, readStore, recordForBoard, recordSignature, saveRecord, STORAGE_KEY, tidyStore } from './storage';
import * as A from './analytics';
import { CSS_VARS } from './geometry';
import { ShareButton } from './ShareButton';

/** Headings whose last checked word was wrong, with what the player had there (S5 markers). */
const missedHeadings = (board: DailyBoard, arrangement: string[] | null) => {
  const out: Record<string, string> = {};
  if (!arrangement) return out;
  headingsOf(board).forEach((h, i) => {
    if (arrangement[i] && arrangement[i] !== ownerOf(board, h)) out[h] = arrangement[i];
  });
  return out;
};

// The card and its generated text load on demand: the board's critical path stays small.
const Card = React.lazy(() => import(/* webpackChunkName: "daily-card" */ './Card'));
const prefetchCard = () => import(/* webpackChunkName: "daily-card" */ './Card').catch(() => undefined);

interface Props {
  board: DailyBoard;
  launch: string;
  errata: Record<string, string>[];
  openedOn: string;
  via: Via;
  isTodayRoute: boolean;
  hasStorage: boolean;
  header: React.ReactNode;
  onArchive: () => void;
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const spotKey = (s: Spot) => (s.kind === 'tray' ? `t:${s.index}` : `h:${s.heading}`);
const sameSpot = (a: Spot | null, b: Spot | null) => !!a && !!b && spotKey(a) === spotKey(b);

type Drag = {
  spot: Spot;
  pointerId: number;
  x0: number;
  y0: number;
  el: HTMLElement;
  active: boolean;
};

const Game: React.FC<Props> = ({ board, launch, errata, openedOn, via, isTodayRoute, hasStorage, header, onArchive }) => {
  const initialRecord = useMemo(() => recordForBoard(readRecord(board.date), board, errata, localDate()), [board, errata]);
  const recordRef = useRef<DayRecord>(initialRecord);
  const [play, setPlay] = useState<PlayState>(() => (initialRecord.updatedAt || initialRecord.ended ? restoreState(board, initialRecord) : initialState(board)));
  const playRef = useRef(play);
  playRef.current = play;
  const firstBoard = useMemo(() => !hasFinishedAny(readStore().records), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => !Object.values(readStore().records).some((r) => r.started), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<string>(() => {
    if (play.ended) return '';
    if (!play.started) return 'Tap a word.';
    if (play.s2 && play.checks.length === 0) return 'Fill all ten, then check.';
    return 'Tap a word.';
  });
  const [announce, setAnnounce] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [arrivingAt, setArrivingAt] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [rolledOver, setRolledOver] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const flip = useRef<{ rects: Map<string, DOMRect>; ms: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const readyAt = useRef(0);
  const activeSince = useRef<number | null>(null);
  const [focusH, setFocusH] = useState(0);
  const [focusT, setFocusT] = useState(0);
  const level = board.number;

  // ------------------------------------------------------------ time and storage

  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  /** Bank visible play time so far; `next` is the state about to be drawn. */
  const bankTime = useCallback((next?: PlayState) => {
    const now = Date.now();
    const s = next || playRef.current;
    if (activeSince.current !== null) {
      // Gaps longer than 90 s without a move are not play.
      recordRef.current = { ...recordRef.current, elapsedMs: recordRef.current.elapsedMs + Math.min(now - activeSince.current, 90_000) };
    }
    activeSince.current = s.started && !s.ended && visible() ? now : null;
  }, []);

  const persist = useCallback(
    (s: PlayState) => {
      bankTime(s);
      const prev = recordRef.current;
      const rec: DayRecord = {
        ...prev,
        boardHash: board.boardHash,
        textVersion: board.textVersion,
        board,
        placements: { ...s.placements },
        tray: s.tray.slice(),
        s2: s.s2,
        checks: s.checks.slice(),
        hints: s.hints.slice(),
        ended: s.ended,
        endedOn: s.ended ? prev.endedOn || localDate() : null,
        updatedAt: Date.now(),
        started: s.started,
      };
      const res = saveRecord(board.date, rec, localDate());
      recordRef.current = res.record;
      if (!res.ok && hasStorage) setSaveFailed(true);
      return res.record;
    },
    [bankTime, board, hasStorage],
  );

  // Errata or a changed board may have rewritten the record on load: save it once.
  useEffect(() => {
    if (initialRecord.updatedAt || initialRecord.ended) {
      const merged = saveRecord(board.date, { ...initialRecord, updatedAt: Math.max(initialRecord.updatedAt, 1) }, localDate());
      recordRef.current = merged.record;
    }
    tidyStore(localDate());
    readyAt.current = performance.now();
    try {
      performance.mark('m5d-board-ready');
    } catch {
      /* user timing is optional */
    }
    bankTime();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Another tab wrote: merge it in (checks only grow, endings and hints stay; its
  // placements win, being the newer move). Compared by content, not clock.
  const adoptStored = useCallback(() => {
    const stored = readRecord(board.date);
    if (!stored || recordSignature(stored) === recordSignature(recordRef.current)) return;
    const merged = mergeRecords(recordRef.current, stored);
    recordRef.current = merged;
    const restored = restoreState(board, merged);
    playRef.current = { ...restored, undo: [], taughtCheck: playRef.current.taughtCheck };
    setPlay(playRef.current);
    setStatus(restored.ended ? '' : 'Updated from another tab.');
  }, [board]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) adoptStored();
    };
    const onVisible = () => {
      bankTime();
      if (visible()) {
        adoptStored();
        if (isTodayRoute && localDate() !== openedOn) setRolledOver(true);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      if (isTodayRoute && visible() && localDate() !== openedOn) setRolledOver(true);
    }, 30_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [adoptStored, bankTime, isTodayRoute, openedOn]);

  // ------------------------------------------------------------ FLIP

  const snapshotTiles = (ms: number) => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => rects.set(el.dataset.tile as string, el.getBoundingClientRect()));
    flip.current = { rects, ms };
  };

  useLayoutEffect(() => {
    const f = flip.current;
    const root = rootRef.current;
    flip.current = null;
    if (!f || !root) return;
    root.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      const old = f.rects.get(el.dataset.tile as string);
      if (!old || typeof el.animate !== 'function') return;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: f.ms, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    });
  }, [play]);

  // ------------------------------------------------------------ dispatch

  const runEffects = useCallback(
    (out: Outcome, rec: DayRecord) => {
      const now = performance.now();
      for (const e of out.effects) {
        if (e.type === 'first-placement') {
          const sinceReady = Math.max(0, now - readyAt.current);
          recordRef.current = { ...recordRef.current, firstMoveMs: recordRef.current.firstMoveMs ?? Math.round(sinceReady) };
          A.logGameStart(level, via, fresh, sinceReady);
          try {
            window.dispatchEvent(new CustomEvent('burgerfun:pause', { detail: {} }));
            window.dispatchEvent(new CustomEvent('burgerfun:resume'));
          } catch {
            /* nothing listens outside the site */
          }
        } else if (e.type === 's2') {
          prefetchCard();
          A.logSectionTwo(level, rec.elapsedMs);
          setArrivingAt(Date.now());
        } else if (e.type === 'check') {
          A.logCheck(level, e.check.counts[0] + e.check.counts[1], e.index, via);
        } else if (e.type === 'hint') {
          A.logHint(level, e.index, e.hint.rung, via);
        } else if (e.type === 'end') {
          if (e.ended === 'solved') A.logSolved(level, rec.checks.length, rec.hints.length, via, rec.elapsedMs);
          else {
            const best = rec.checks.reduce((m, c) => Math.max(m, c.counts[0] + c.counts[1]), 0);
            A.logUnsolved(level, best, e.ended === 'out' ? 'out_of_checks' : 'show_answer', via, rec.elapsedMs);
          }
        }
      }
    },
    [fresh, level, via],
  );

  const dispatch = useCallback(
    (target: Target, opts: { flipMs?: number } = {}) => {
      const cur = playRef.current;
      const out = tap(cur, board, target, { firstBoard, now: Date.now() });
      if (out.state === cur && out.status === null) return out;
      const ends = out.effects.some((e) => e.type === 'end');
      // Written before it is drawn: a killed tab can neither lose nor gain a check.
      const rec = out.save ? persist(out.state) : recordRef.current;
      snapshotTiles(opts.flipMs ?? (ends && out.state.ended !== 'solved' ? 250 : 150));
      playRef.current = out.state;
      setPlay(out.state);
      if (out.status !== null) setStatus(out.status);
      setAnnounce(out.announce || out.status || '');
      if (out.state.started) setShowRules(false);
      runEffects(out, rec);
      return out;
    },
    [board, firstBoard, persist, runEffects],
  );

  // ------------------------------------------------------------ input

  const focusTray = () => {
    window.requestAnimationFrame(() => {
      const root = rootRef.current;
      const s = playRef.current;
      if (!root) return;
      let i = s.tray.findIndex((w) => !!w);
      if (i < 0) i = 0;
      setFocusT(i);
      root.querySelector<HTMLElement>(`[data-spot="t:${i}"]`)?.focus();
    });
  };

  const onSpotClick = (spot: Spot) => (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const keyboard = e.detail === 0;
    // Browsers move a tap that lands near a button onto it (touch adjustment),
    // pointer and click events alike. The raw press point decides: a press that
    // began in a gap between cards is a gap tap and does nothing (3.2).
    const down = lastDown.current;
    if (!keyboard && down) {
      const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (down.x < b.left || down.x > b.right || down.y < b.top || down.y > b.bottom) return;
    }
    const before = playRef.current;
    const out = dispatch(spot);
    if (keyboard && spot.kind === 'heading' && before.selected && out && out.effects !== undefined && out.state.selected === null && out.save) focusTray();
  };

  const lastDown = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDown = (e: PointerEvent) => {
      lastDown.current = { x: e.clientX, y: e.clientY };
    };
    root.addEventListener('pointerdown', onDown, true);
    return () => root.removeEventListener('pointerdown', onDown, true);
  }, []);

  const onTilePointerDown = (spot: Spot) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || playRef.current.ended) return;
    if (spot.kind === 'heading' && isPinnedHeading(playRef.current, board, spot.heading)) return;
    drag.current = { spot, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, el: e.currentTarget, active: false };
  };

  useEffect(() => {
    const spotFromPoint = (x: number, y: number, skip: HTMLElement) => {
      const els = document.elementsFromPoint(x, y);
      for (const el of els) {
        if (skip.contains(el)) continue;
        const host = (el as HTMLElement).closest?.('[data-spot]') as HTMLElement | null;
        if (host && rootRef.current?.contains(host)) {
          const v = host.dataset.spot as string;
          return v.startsWith('t:') ? ({ kind: 'tray', index: Number(v.slice(2)) } as Spot) : ({ kind: 'heading', heading: v.slice(2) } as Spot);
        }
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.active) {
        if (Math.hypot(dx, dy) <= 8) return;
        d.active = true;
        const cur = playRef.current;
        if (!sameSpot(cur.selected, d.spot)) {
          const w = wordAt(cur, d.spot);
          const next = { ...cur, selected: d.spot, confirm: null };
          playRef.current = next;
          setPlay(next);
          setStatus(d.spot.kind === 'tray' ? `${w}: tap a heading.` : `${w}: tap another heading, or an empty tray cell.`);
        }
        d.el.classList.add('is-dragging');
      }
      d.el.style.transform = `translate(${dx}px, ${dy}px)`;
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.active) return;
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const target = spotFromPoint(e.clientX, e.clientY, d.el);
      d.el.classList.remove('is-dragging');
      if (target && !sameSpot(target, d.spot)) {
        // The tile is still drawn where it was dropped, so FLIP slides it home from there.
        dispatch(target);
        d.el.style.transform = '';
      } else {
        const from = d.el.getBoundingClientRect();
        d.el.style.transform = '';
        const to = d.el.getBoundingClientRect();
        if (!reducedMotion() && typeof d.el.animate === 'function')
          d.el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'translate(0, 0)' }], { duration: 150 });
      }
    };
    const onCancel = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      d.el.classList.remove('is-dragging');
      d.el.style.transform = '';
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dispatch]);

  const live = liveHeadings(play, board);

  const onHeadingsKey = (e: React.KeyboardEvent) => {
    const cols = (() => {
      const grid = rootRef.current?.querySelector('.m5d-grid');
      if (!grid) return 3;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length || 3;
    })();
    const max = live.length - 1;
    let next = focusH;
    if (e.key === 'ArrowRight') next = Math.min(max, focusH + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, focusH - 1);
    else if (e.key === 'ArrowDown') next = Math.min(max, focusH + cols);
    else if (e.key === 'ArrowUp') next = Math.max(0, focusH - cols);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Escape') {
      if (playRef.current.selected) {
        const s = { ...playRef.current, selected: null };
        playRef.current = s;
        setPlay(s);
        setStatus('Tap a word.');
      }
      return;
    } else return;
    e.preventDefault();
    setFocusH(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-spot="h:${CSS.escape(live[next])}"]`)?.focus();
  };

  const onTrayKey = (e: React.KeyboardEvent) => {
    let next = focusT;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(4, focusT + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, focusT - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 4;
    else if (e.key === 'Escape') {
      if (playRef.current.selected) {
        const s = { ...playRef.current, selected: null };
        playRef.current = s;
        setPlay(s);
        setStatus('Tap a word.');
      }
      return;
    } else return;
    e.preventDefault();
    setFocusT(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-spot="t:${next}"]`)?.focus();
  };

  // ------------------------------------------------------------ notices

  const today = localDate();
  const yesterday = addDays(openedOn, -1);
  const records = useMemo(() => readStore().records, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  const yRec = records[yesterday];
  const dayBefore = records[addDays(openedOn, -2)];
  const yesterdayOpen =
    isTodayRoute &&
    launch !== '' &&
    yesterday >= launch &&
    !(yRec && yRec.ended) &&
    ((yRec && yRec.started) || countsForRun(addDays(openedOn, -2), dayBefore));

  const notices: React.ReactNode[] = [];
  if (rolledOver)
    notices.push(
      <p className="m5d-note" key="s16">
        This is yesterday's board (#{board.number}). <a href={dailyPath()}>Today's is up.</a>
      </p>,
    );
  if (via === 'tomorrow')
    notices.push(
      <p className="m5d-note" key="s15">
        This board is already today where your friend is. It counts for its own date.
      </p>,
    );
  if (via === 'archive')
    notices.push(
      <p className="m5d-note is-soft" key="s10">
        From the archive. Past boards don't extend your run.
      </p>,
    );
  if (via === 'yesterday' && !play.ended)
    notices.push(
      <p className="m5d-note" key="y">
        Yesterday's board. Finish it today and it still counts.
      </p>,
    );
  if (yesterdayOpen && !rolledOver)
    notices.push(
      <p className="m5d-note" key="s8">
        Yesterday's board (#{board.number - 1}) is unfinished. Finish it today and it still counts.{' '}
        <a href={dailyPath(yesterday)}>Open it</a>
      </p>,
    );
  if (play.ended && isTodayRoute && !rolledOver)
    notices.push(
      <p className="m5d-note is-soft" key="s6">
        Next board after midnight, your time.
      </p>,
    );
  if (!play.ended)
    play.hints.forEach((h, i) =>
      notices.push(
        <p className="m5d-note" key={`hint${i}`}>
          Hint {i + 1}: {hintText(board, h)}
        </p>,
      ),
    );
  if (showRules)
    notices.push(
      <div className="m5d-note m5d-rules" key="rules">
        <p>Fill the top five headings and five more of each arrive. New words often want spots you've used.</p>
        <p>One arrangement fits all ten. Four checks, then the answer.</p>
      </div>,
    );
  if (saveFailed)
    notices.push(
      <p className="m5d-note is-soft" key="save">
        This browser stopped saving. The board still plays.
      </p>,
    );

  // ------------------------------------------------------------ render helpers

  const selectedWord = play.selected ? wordAt(play, play.selected) : null;
  const lastCheck = play.checks.length ? play.checks[play.checks.length - 1] : null;
  const missed = play.ended && play.ended !== 'solved' ? missedHeadings(board, lastCheck ? lastCheck.arrangement : null) : {};
  const pins = pinnedWords(play);
  const arriving = arrivingAt && Date.now() - arrivingAt < 2000;

  const headingCard = (h: string, i: number, idx: number) => {
    const w = play.placements[h];
    const pinned = isPinnedHeading(play, board, h);
    const isSel = !!play.selected && play.selected.kind === 'heading' && play.selected.heading === h;
    const spot: Spot = { kind: 'heading', heading: h };
    const ended = !!play.ended;
    const right = ended && play.ended !== 'solved' && !missed[h] && lastCheck;
    let name = `${spokenHeading(h, board)}, ${w ? `holds ${w}` : 'empty'}`;
    if (pinned) name += ', pinned';
    if (ended && missed[h]) name += `. You had ${missed[h]}`;
    else if (right) name += '. Right at your last check';
    if (selectedWord && !pinned && !isSel) name += `. Place ${selectedWord}`;
    return (
      <button
        key={h}
        type="button"
        className={`m5d-card${pinned ? ' is-pinned' : ''}${ended ? ' is-locked' : ''}${arriving && i >= 5 ? ' is-arriving' : ''}`}
        style={{ ['--i' as string]: i - 5 } as React.CSSProperties}
        data-spot={`h:${h}`}
        aria-label={name}
        aria-pressed={isSel}
        tabIndex={idx === focusH ? 0 : -1}
        onFocus={() => setFocusH(idx)}
        onClick={onSpotClick(spot)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="m5d-label" aria-hidden="true">
          {/* The blank stays with the word before it: "You can ___ / someone". */}
          <span>{h.replace(/ (_{2,})/g, '\u00a0$1')}</span>
        </span>
        <span className={`m5d-well${w ? ' is-filled' : ''}`} aria-hidden="true">
          {w && (
            <span
              className={`m5d-tile${isSel ? ' is-selected' : ''}`}
              data-tile={w}
              onPointerDown={pinned || ended ? undefined : onTilePointerDown(spot)}
              draggable={false}
            >
              {w}
            </span>
          )}
          {pinned && <FaThumbtack className="m5d-pin" aria-hidden="true" focusable="false" />}
          {ended && missed[h] && (
            <span className="m5d-mark is-missed" title={`You had ${missed[h]}`}>
              <FaExchangeAlt aria-hidden="true" focusable="false" />
            </span>
          )}
          {right && (
            <span className="m5d-mark is-right" title="Right">
              <FaCheck aria-hidden="true" focusable="false" />
            </span>
          )}
        </span>
      </button>
    );
  };

  const placeholder = (k: number) => <div key={`ph${k}`} className="m5d-card is-placeholder" aria-hidden="true" />;

  const band = (half: 0 | 1) => {
    const hs = half === 0 ? topHeadings(board) : bottomHeadings(board);
    const showRulesBand = half === 1 && !play.s2 && firstBoard;
    return (
      <section className="m5d-band" aria-label={half === 0 ? 'Top five headings' : 'Bottom five headings'}>
        <h2 className="m5d-sechead">
          <span>{sectionHeader(play, board, half)}</span>
          {half === 1 && !play.s2 && !showRulesBand && <span className="m5d-sechead-wide">Five more headings arrive when the top five are full.</span>}
        </h2>
        <div className="m5d-gridwrap">
          {showRulesBand ? (
            <div className="m5d-rules-band">
              <p>Fill these five and five more of each arrive. New words often want spots you've used.</p>
              <p>One arrangement fits all ten. Four checks, then the answer.</p>
            </div>
          ) : (
            <div className="m5d-grid" role={half === 0 || play.s2 ? 'group' : undefined}>
              {half === 1 && !play.s2
                ? [0, 1, 2, 3, 4].map(placeholder).concat(
                    <p key="arrive" className="m5d-arrive-cell">
                      Five more headings arrive when the top five are full.
                    </p>,
                  )
                : hs.map((h, k) => headingCard(h, half * 5 + k, live.indexOf(h)))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const trayCell = (w: string | null, i: number) => {
    const spot: Spot = { kind: 'tray', index: i };
    const isSel = !!play.selected && play.selected.kind === 'tray' && play.selected.index === i;
    return (
      <button
        key={i}
        type="button"
        className={`m5d-traycell${w ? ' is-filled' : ''}${arriving && w && board.sections[1].words.includes(w) ? ' is-arriving' : ''}`}
        data-spot={`t:${i}`}
        aria-label={w ? `${w}, in tray` : 'Empty tray cell'}
        aria-pressed={w ? isSel : undefined}
        tabIndex={i === focusT ? 0 : -1}
        onFocus={() => setFocusT(i)}
        onClick={onSpotClick(spot)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {w && (
          <span className={`m5d-tile${isSel ? ' is-selected' : ''}`} data-tile={w} onPointerDown={onTilePointerDown(spot)} draggable={false}>
            {w}
          </span>
        )}
      </button>
    );
  };

  const check = checkButton(play, board);
  const hintRung = nextHint(play, board);
  const undoable = play.undo.length > 0;
  const rulesButton = !play.started && !firstBoard;

  // Share guard: ignore input for 400 ms after the result bar appears.
  const [shareArmedAt, setShareArmedAt] = useState(0);
  useEffect(() => {
    if (play.ended) setShareArmedAt(Date.now() + 400);
  }, [play.ended]);

  const dock = play.ended ? null : (
    <div className="m5d-dock" role="region" aria-label="Tray and controls">
      <div className="m5d-status">
        <p className="m5d-status-text" aria-hidden="true">
          {status}
        </p>
        {undoable ? (
          <button type="button" className="m5d-textbtn" onClick={() => dispatch({ kind: 'undo' })}>
            Undo
          </button>
        ) : rulesButton ? (
          <button type="button" className="m5d-textbtn" aria-expanded={showRules} onClick={() => setShowRules((v) => !v)}>
            Rules
          </button>
        ) : null}
      </div>
      <div className="m5d-tray" role="group" aria-label="Tray" onKeyDown={onTrayKey}>
        {play.tray.map(trayCell)}
      </div>
      <div className="m5d-bar">
        {play.confirm ? (
          <>
            <div className="m5d-bar-left">
              <button type="button" className="m5d-act is-quiet" onClick={() => dispatch({ kind: 'cancel' })}>
                <span>{play.confirm === 'hint' ? 'Not now' : 'Keep playing'}</span>
              </button>
            </div>
            <button type="button" className="m5d-primary" onClick={() => dispatch({ kind: 'confirm' })}>
              {play.confirm === 'hint' ? 'Hint' : 'Show it'}
            </button>
          </>
        ) : (
          <>
            <div className="m5d-bar-left">
              {play.s2 && hintRung && (
                <button type="button" className="m5d-act" onClick={() => dispatch({ kind: 'hint' })}>
                  <span>Hint</span>
                  <small>Shows on your card</small>
                </button>
              )}
              {play.s2 && (
                <button type="button" className="m5d-act" onClick={() => dispatch({ kind: 'show' })}>
                  <span>Show answer</span>
                </button>
              )}
            </div>
            <button
              type="button"
              className="m5d-primary"
              aria-disabled={!check.enabled}
              onClick={() => dispatch({ kind: 'check' })}
            >
              {check.label}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const resultText =
    play.ended === 'solved'
      ? `Solved on check ${play.checks.length} of 4`
      : 'Not solved';

  const card = play.ended ? (
    <React.Suspense fallback={null}>
    <Card
      board={board}
      play={play}
      record={recordRef.current}
      openedOn={openedOn}
      today={today}
      via={via}
      isToday={isTodayRoute && !rolledOver}
      hasStorage={hasStorage}
      shareArmedAt={shareArmedAt}
      onArchive={onArchive}
      onDisputed={(key) => {
        recordRef.current = saveRecord(board.date, { ...recordRef.current, disputed: recordRef.current.disputed.concat(key), updatedAt: Date.now() }, localDate()).record;
      }}
    />
    </React.Suspense>
  ) : null;

  return (
    <div className={`m5d-play${play.ended ? ' is-ended' : ''}`} style={CSS_VARS} ref={rootRef}>
      {header}
      <div className="m5d-main">
        <div className="m5d-above">{notices}</div>
        <div className={`m5d-board${play.selected ? ' is-armed' : ''}`} onKeyDown={onHeadingsKey}>
          {band(0)}
          {band(1)}
        </div>
        {play.ended && play.ended !== 'solved' && lastCheck && (
          <p className="m5d-note is-soft m5d-legend-line">
            <span className="m5d-mark is-right" aria-hidden="true">
              <FaCheck focusable="false" />
            </span>{' '}
            right at your last check{' · '}
            <span className="m5d-mark is-missed" aria-hidden="true">
              <FaExchangeAlt focusable="false" />
            </span>{' '}
            you had another word there, listed below
          </p>
        )}
        {card}
      </div>
      {dock}
      {play.ended && (
        <div className="m5d-dock is-result" role="region" aria-label="Result">
          <div className="m5d-resultbar">
            <strong>{resultText}</strong>
            <ShareButton board={board} play={play} via={via} armedAt={shareArmedAt} />
          </div>
        </div>
      )}
      <div className="m5d-sr" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
};

export default Game;
