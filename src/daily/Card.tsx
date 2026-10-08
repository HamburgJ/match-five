// The result card (DOSSIER-v2 6.1): the page's persistent end state for the date.
// Block 1 is the one glance; then today's second lives, the answer, the misses,
// and the rest. No toast, no modal.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DailyBoard, DayRecord } from './types';
import { type PlayState, hintText } from './engine';
import { dailyPath, shortLabel, type Via } from './dates';
import { canShare, feedbackFor, selectShareBox, shareOrCopy, shareTextFor } from './ShareButton';
import { missLines, plainPairs, secondLives } from './reveal';
import { readStore, streakOf } from './storage';
import { uniquenessRecorded } from './board';
import * as A from './analytics';

const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};

interface Props {
  board: DailyBoard;
  play: PlayState;
  record: DayRecord;
  openedOn: string;
  today: string;
  via: Via;
  isToday: boolean;
  hasStorage: boolean;
  shareArmedAt: number;
  onDisputed: (key: string) => void;
  onArchive: () => void;
}

const Disagree: React.FC<{ word: string; heading: string; board: DailyBoard; done: boolean; onDone: (key: string) => void }> = ({ word, heading, board, done, onDone }) => {
  const [noted, setNoted] = useState(done);
  const key = `${word}>${heading}`;
  return noted ? (
    <span className="m5d-textbtn" aria-live="polite" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
      Noted
    </span>
  ) : (
    <button
      type="button"
      className="m5d-textbtn"
      aria-label={`Disagree: ${word} under ${heading}`}
      onClick={() => {
        A.logDispute(board.number, word, heading);
        setNoted(true);
        onDone(key);
      }}
    >
      Disagree
    </button>
  );
};

const Card: React.FC<Props> = ({ board, play, record, today, via, isToday, hasStorage, shareArmedAt, onDisputed, onArchive }) => {
  const text = useMemo(() => shareTextFor(board, play), [board, play]);
  const [feedback, setFeedback] = useState('');
  const announced = useRef(false);
  const solved = play.ended === 'solved';
  const kind = isToday ? 'daily-solved' : 'game-complete';

  // The card is the pause point: Next Up may show, and the golden ticket waits for it.
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    try {
      window.dispatchEvent(new CustomEvent('burgerfun:pause', { detail: { kind, game: 'match-five' } }));
    } catch {
      /* nothing listens outside the site */
    }
  }, [kind]);

  const records = readStore().records;
  const streak = streakOf(records, today);
  const rights = play.checks.map((c) => c.counts[0] + c.counts[1]);
  const trail = solved && rights.length === 1 ? [] : rights;
  const hints = play.hints.length;
  const trailLine = [trail.join(' · '), hints ? `${hints} ${hints === 1 ? 'hint' : 'hints'}` : ''].filter(Boolean).join(' · ');
  const lives = secondLives(board);
  const pairs = plainPairs(board);
  const last = play.checks.length ? play.checks[play.checks.length - 1] : null;
  const misses = !solved && last ? missLines(board, last.arrangement) : [];
  const disputed = new Set(record.disputed);

  const doShare = async (prefer: 'share' | 'copy') => {
    if (Date.now() < shareArmedAt) return;
    const o = await shareOrCopy(text, prefer, selectShareBox);
    if (o === 'shared' || o === 'copied') A.logShare(board.number, o === 'shared' ? 'web_share' : 'copy', via);
    setFeedback(feedbackFor(o));
  };

  const recordLine = !hasStorage
    ? "This browser isn't keeping records, so there's no streak here."
    : `${streak.run} ${streak.run === 1 ? 'day' : 'days'} running · ${streak.finished} ${streak.finished === 1 ? 'board' : 'boards'} finished, ${streak.solved} solved`;

  const privacy = isStandalone()
    ? 'Your results here are kept in this app only, separate from Safari.'
    : 'Your results are kept in this browser only, and some browsers clear them after a week away.';

  return (
    <section className="m5d-result" aria-labelledby="m5d-result-title">
      <div className="m5d-glance">
        <h2 id="m5d-result-title">
          Match Five Daily #{board.number} {'·'} {shortLabel(board.date)}
          {board.harder ? ' · harder' : ''}
        </h2>
        <p className="m5d-score">
          {solved ? `Solved on check ${play.checks.length} of 4` : 'Not solved. Here is the one that fits.'}
          {solved && record.acceptedAfterFix ? ' (accepted after a fix)' : ''}
        </p>
        {trailLine && <p className="m5d-trail">{trailLine}</p>}
        <p className="m5d-record">{recordLine}</p>
        <div className="m5d-glance-actions">
          {canShare() && (
            <button type="button" className="m5d-primary" onClick={() => doShare('share')}>
              Share
            </button>
          )}
          <button type="button" className={canShare() ? 'm5d-secondary' : 'm5d-primary'} onClick={() => doShare('copy')}>
            Copy
          </button>
          <div data-burger-pickup-slot="" />
        </div>
        <p className="m5d-feedback" aria-live="polite">
          {feedback}
        </p>
        {hints > 0 && (
          <ul className="m5d-pairs" aria-label="Hints used">
            {play.hints.map((h, i) => (
              <li key={h.rung}>
                <span>
                  Hint {i + 1}: {hintText(board, h)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lives.length > 0 && (
        <div className="m5d-block">
          <h3>Today's second lives</h3>
          <ul className="m5d-lives">
            {lives.map((p) => (
              <li key={p.word}>
                <span className="m5d-pair">
                  {p.word} <span>under {p.heading}</span>
                </span>
                <span className="m5d-gloss">{p.gloss}</span>
                <Disagree word={p.word} heading={p.heading} board={board} done={disputed.has(`${p.word}>${p.heading}`)} onDone={onDisputed} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="m5d-block">
        <h3>{lives.length ? 'The rest of the answer' : 'The answer'}</h3>
        <ul className="m5d-pairs">
          {pairs.map((p) => (
            <li key={p.word}>
              <span>
                <b>{p.word}</b> under {p.heading}
              </span>
              <Disagree word={p.word} heading={p.heading} board={board} done={disputed.has(`${p.word}>${p.heading}`)} onDone={onDisputed} />
            </li>
          ))}
        </ul>
      </div>

      {misses.length > 0 && (
        <div className="m5d-block">
          <h3>Your last check</h3>
          <ul className="m5d-misses">
            {misses.map((m) => (
              <li key={`${m.word}|${m.heading}`}>
                <span>{m.text}</span>
                <Disagree word={m.word} heading={m.heading} board={board} done={disputed.has(`${m.word}>${m.heading}`)} onDone={onDisputed} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="m5d-block">
        {uniquenessRecorded(board) && (
          <p className="m5d-fine">
            This is the only arrangement that fits, by our answer key. A program checked all 3,628,800 ways to arrange today's words, and again with every borderline call we marked counted as yes.
          </p>
        )}
        <h3 style={{ marginTop: 16 }}>Your result to share</h3>
        <pre className="m5d-sharebox">{text}</pre>
        <div className="m5d-glance-actions">
          {canShare() && (
            <button type="button" className="m5d-primary" onClick={() => doShare('share')}>
              Share
            </button>
          )}
          <button type="button" className={canShare() ? 'm5d-secondary' : 'm5d-primary'} onClick={() => doShare('copy')}>
            Copy
          </button>
        </div>
        <p className="m5d-fine">
          {isToday ? 'Next board after midnight, your time. ' : ''}
          <button type="button" className="m5d-textbtn m5d-inline" onClick={onArchive}>
            Past boards
          </button>
          {!isToday && (
            <>
              {' '}
              <a className="m5d-link" href={dailyPath()}>
                Today's board
              </a>
            </>
          )}
        </p>
        <p className="m5d-fine">{privacy}</p>
      </div>

      <div className="m5d-next">
        <burger-next-cards kind={kind} game="match-five" />
      </div>
    </section>
  );
};

export default Card;
