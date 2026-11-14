// The result bar's Share button and the share/copy helpers the card reuses. Kept out
// of the lazily loaded card so the bar can draw the moment a board ends.
import React, { useState } from 'react';
import type { DailyBoard } from './types';
import type { PlayState } from './engine';
import type { Via } from './dates';
import { buildShareText } from './share';
import * as A from './analytics';

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export const shareTextFor = (board: DailyBoard, play: PlayState) =>
  buildShareText({
    number: board.number,
    date: board.date,
    rights: play.checks.map((c) => c.counts[0] + c.counts[1]),
    solved: play.ended === 'solved',
    hints: play.hints.length,
  });

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual';

/** Native share when there is one, else the clipboard, else select the text for a long press. */
export const shareOrCopy = async (text: string, prefer: 'share' | 'copy', selectFallback: () => void): Promise<ShareOutcome> => {
  if (prefer === 'share' && canShare()) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* fall through to manual copy */
  }
  selectFallback();
  return 'manual';
};

export const selectShareBox = () => {
  const box = document.querySelector('.m5d-sharebox');
  if (!box) return;
  try {
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    box.scrollIntoView({ block: 'center' });
  } catch {
    /* nothing more to do */
  }
};

export const feedbackFor = (o: ShareOutcome) =>
  o === 'copied' ? 'Copied. Paste it anywhere.' : o === 'manual' ? 'Press and hold to copy.' : o === 'shared' ? 'Shared.' : '';

export const ShareButton: React.FC<{ board: DailyBoard; play: PlayState; via: Via; armedAt: number }> = ({ board, play, via, armedAt }) => {
  const [note, setNote] = useState('');
  const native = canShare();
  return (
    <button
      type="button"
      className="m5d-primary"
      onClick={async () => {
        if (Date.now() < armedAt) return;
        const o = await shareOrCopy(shareTextFor(board, play), 'share', selectShareBox);
        if (o === 'shared' || o === 'copied') A.logShare(board.number, o === 'shared' ? 'web_share' : 'copy', via);
        setNote(feedbackFor(o));
        window.setTimeout(() => setNote(''), 2500);
      }}
    >
      {note === 'Copied. Paste it anywhere.' ? 'Copied' : native ? 'Share' : 'Copy result'}
    </button>
  );
};

