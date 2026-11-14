// Route, date and board loading for /match-five/daily/ and /match-five/daily/YYYY-MM-DD/.
// One page, no modals: every state in the 4.2 inventory renders inside it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyBoard } from './types';
import { addDays, dailyPath, latestPlayableDate, localDate, parseRoute, viaFor } from './dates';
import { loadBoard } from './loader';
import { readRecord, readStore, storageAvailable } from './storage';
import { isProductionHost } from './analytics';
import Game from './Game';
import Header from './Header';
import { CSS_VARS } from './geometry';

// Past boards load on demand, off the board's critical path.
const Archive = React.lazy(() => import(/* webpackChunkName: "daily-archive" */ './Archive'));

type Load =
  | { kind: 'loading' }
  | { kind: 'board'; board: DailyBoard; launch: string; errata: Record<string, string>[] }
  | { kind: 'no-board'; launch: string | null }
  | { kind: 'failed' };

const announceArm = () => {
  // A kind-less pause then a resume: the reward runtime becomes pause-aware (its
  // ticket then waits for the card) on runtimes that predate the one-line
  // onResume fix; Next Up ignores a pause without a known kind.
  try {
    window.dispatchEvent(new CustomEvent('burgerfun:pause', { detail: {} }));
    window.dispatchEvent(new CustomEvent('burgerfun:resume'));
  } catch {
    /* nothing listens outside burgerfun.ca */
  }
};

const fixtureParam = () => {
  try {
    return new URLSearchParams(window.location.search).get('board');
  } catch {
    return null;
  }
};

const DailyApp: React.FC = () => {
  const route = useMemo(() => parseRoute(window.location.pathname), []);
  const openedOn = useMemo(() => localDate(), []);
  const date = route.kind === 'date' ? route.date : openedOn;
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [archive, setArchive] = useState<boolean>(() => {
    try {
      return !!(window.history.state && window.history.state.m5dArchive);
    } catch {
      return false;
    }
  });
  const hasStorage = useMemo(() => storageAvailable(), []);

  useEffect(() => {
    announceArm();
  }, []);

  useEffect(() => {
    if (route.kind === 'malformed') {
      setLoad({ kind: 'no-board', launch: null });
      return;
    }
    let live = true;
    setLoad({ kind: 'loading' });
    const stored = readRecord(date)?.board || null;
    loadBoard({
      date,
      latest: latestPlayableDate(),
      stored,
      allowFixtures: !isProductionHost(),
      fixture: fixtureParam(),
    }).then((res) => {
      if (live) setLoad(res);
    });
    return () => {
      live = false;
    };
  }, [route.kind, date, attempt]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => setArchive(!!(e.state && e.state.m5dArchive));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openArchive = useCallback(() => {
    if (archive) {
      window.history.back();
      return;
    }
    try {
      window.history.pushState({ m5dArchive: true }, '', window.location.href);
    } catch {
      /* history is optional */
    }
    setArchive(true);
    window.scrollTo(0, 0);
  }, [archive]);

  const closeArchive = useCallback(() => {
    if (window.history.state && window.history.state.m5dArchive) window.history.back();
    else setArchive(false);
  }, []);

  const board = load.kind === 'board' ? load.board : null;
  const launch = load.kind === 'board' ? load.launch : load.kind === 'no-board' ? load.launch : null;
  const via = viaFor(date, openedOn);

  const header = (
    <Header
      board={board}
      archiveOpen={archive}
      onArchive={openArchive}
    />
  );

  if (archive) {
    return (
      <div className="m5d" style={CSS_VARS}>
        <div className="m5d-play is-archive">
          {header}
          <React.Suspense fallback={null}>
          <Archive
            records={readStore().records}
            today={openedOn}
            launch={launch || board?.date || openedOn}
            current={date}
            onClose={closeArchive}
            hasStorage={hasStorage}
          />
          </React.Suspense>
        </div>
      </div>
    );
  }

  if (load.kind === 'board' && board) {
    return (
      <div className="m5d" style={CSS_VARS}>
        <Game
          key={`${board.date}:${board.boardHash}`}
          board={board}
          launch={launch || ''}
          errata={load.errata}
          openedOn={openedOn}
          via={via}
          isTodayRoute={date === openedOn}
          hasStorage={hasStorage}
          header={header}
          onArchive={openArchive}
        />
      </div>
    );
  }

  if (load.kind === 'loading') {
    // The same bands as the live board, so its arrival shifts nothing (DOSSIER-v2 2, step 1).
    const ph = (k: number) => <div key={k} className="m5d-card is-placeholder" aria-hidden="true" />;
    return (
      <div className="m5d" style={CSS_VARS}>
        <div className="m5d-play" aria-busy="true">
          {header}
          <div className="m5d-main">
            <div className="m5d-above" />
            <div className="m5d-board">
              {[0, 1].map((half) => (
                <section className="m5d-band" key={half}>
                  <h2 className="m5d-sechead">{half ? 'Bottom five' : 'Top five'}</h2>
                  <div className="m5d-gridwrap">
                    <div className="m5d-grid">{[0, 1, 2, 3, 4].map(ph)}</div>
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="m5d-dock">
            <div className="m5d-status">
              <p className="m5d-status-text" role="status">
                Loading the board.
              </p>
            </div>
            <div className="m5d-tray">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="m5d-traycell" aria-hidden="true" />
              ))}
            </div>
            <div className="m5d-bar">
              <div className="m5d-bar-left" />
              <div className="m5d-primary" aria-hidden="true" style={{ background: '#e3e4ee' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m5d" style={CSS_VARS}>
      <div className="m5d-play is-ended">
        {header}
        <div className="m5d-message" role="status">
          {load.kind === 'no-board' && (
            <>
              <p>There's no board for that day.</p>
              <p>
                <a className="m5d-link" href={dailyPath()}>
                  Today's board
                </a>
              </p>
            </>
          )}
          {load.kind === 'failed' && (
            <>
              <p>The board didn't load.</p>
              <button type="button" className="m5d-primary" onClick={() => setAttempt((n) => n + 1)} style={{ minWidth: 140 }}>
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyApp;

/** Yesterday relative to a local date, for S8. */
export const yesterdayOf = (today: string) => addDays(today, -1);
