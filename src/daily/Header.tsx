import React from 'react';
import { FaRegCalendarAlt } from 'react-icons/fa';
import type { DailyBoard } from './types';
import { shortLabel } from './dates';

interface Props {
  board: DailyBoard | null;
  archiveOpen: boolean;
  onArchive: () => void;
}

/**
 * The 48 px header: the shared burger fun logo's slot (site-brand.js moves
 * <burger-fun-logo> into it; React never renders children there), the title,
 * and Past boards.
 */
const Header: React.FC<Props> = ({ board, archiveOpen, onArchive }) => (
  <header className="m5d-header">
    <div className="m5d-brand" data-burger-brand-slot="" />
    <div className="m5d-title">
      <h1>Match Five Daily</h1>
      <p>{board ? `#${board.number} · ${shortLabel(board.date)}${board.harder ? ' · harder' : ''}` : ' '}</p>
    </div>
    <button
      type="button"
      className="m5d-iconbtn"
      aria-label="Past boards"
      aria-pressed={archiveOpen}
      title="Past boards"
      onClick={onArchive}
    >
      <FaRegCalendarAlt aria-hidden="true" focusable="false" />
    </button>
  </header>
);

export default Header;
