// Past boards (S9): three months of day marks. A digit is the check a board was
// solved on, "-" a board finished unsolved, "·" one not finished, blank before
// launch. Never "x": the card never says lost. Below 360 px the grid is a list.
import React, { useEffect, useRef } from 'react';
import type { DayRecord } from './types';
import { boardNumber, dailyPath, daysOfMonth, monthLabel, monthOf, previousMonth, shortLabel, weekday } from './dates';
import { archiveMark } from './storage';

interface Props {
  records: Record<string, DayRecord>;
  today: string;
  launch: string;
  current: string;
  hasStorage: boolean;
  onClose: () => void;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const markText = (r: DayRecord | undefined) => {
  const m = archiveMark(r);
  if (m.kind === 'solved') return String(m.check);
  if (m.kind === 'unsolved') return '-';
  return '·';
};

const markWords = (r: DayRecord | undefined) => {
  const m = archiveMark(r);
  if (m.kind === 'solved') return `solved on check ${m.check}`;
  if (m.kind === 'unsolved') return 'finished, not solved';
  return r && r.started ? 'not finished' : 'not played';
};

const Archive: React.FC<Props> = ({ records, today, launch, current, hasStorage, onClose }) => {
  const months = [monthOf(today), previousMonth(monthOf(today)), previousMonth(previousMonth(monthOf(today)))].filter(
    (m) => m >= monthOf(launch),
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className="m5d-archive" aria-labelledby="m5d-archive-title">
      <div className="m5d-archive-top">
        <h2 id="m5d-archive-title" tabIndex={-1} ref={titleRef}>
          Past boards
        </h2>
        <button type="button" className="m5d-textbtn" onClick={onClose}>
          Back to the board
        </button>
      </div>
      {!hasStorage && <p className="m5d-legend">This browser isn't keeping records, so every day shows as not played.</p>}
      {months.map((month) => {
        const days = daysOfMonth(month);
        const lead = (weekday(days[0]) + 6) % 7; // Monday first
        return (
          <div className="m5d-month" key={month}>
            <h3>{monthLabel(month)}</h3>
            <div className="m5d-cal" role="list" aria-label={monthLabel(month)}>
              {DOW.map((d) => (
                <span className="m5d-cal-dow" key={d} aria-hidden="true">
                  {d.slice(0, 1)}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span className="m5d-day is-empty" key={`lead${i}`} aria-hidden="true" />
              ))}
              {days.map((d) => {
                const day = Number(d.slice(8));
                if (d < launch) {
                  return (
                    <span className="m5d-day is-empty" key={d} role="listitem" aria-label={`${shortLabel(d)}, before the first board`}>
                      {day}
                    </span>
                  );
                }
                if (d > today) {
                  return (
                    <span className="m5d-day is-future" key={d} role="listitem" aria-label={`${shortLabel(d)}, not out yet`}>
                      {day}
                    </span>
                  );
                }
                const r = records[d];
                return (
                  <a
                    className={`m5d-day${d === today ? ' is-today' : ''}`}
                    key={d}
                    role="listitem"
                    href={d === today ? dailyPath() : dailyPath(d)}
                    aria-label={`${shortLabel(d)}, board ${boardNumber(d, launch)}, ${markWords(r)}${d === current ? ', open now' : ''}`}
                  >
                    <b aria-hidden="true">{markText(r)}</b>
                    <span aria-hidden="true">{day}</span>
                  </a>
                );
              })}
            </div>
            <ul className="m5d-daylist" aria-label={monthLabel(month)}>
              {days
                .filter((d) => d >= launch && d <= today)
                .reverse()
                .map((d) => (
                  <li key={d}>
                    <a href={d === today ? dailyPath() : dailyPath(d)}>
                      <span>
                        #{boardNumber(d, launch)} {'·'} {shortLabel(d)}
                      </span>
                      <b>{markText(records[d])}</b>
                    </a>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
      <p className="m5d-legend">A number is the check you solved on. A dash: finished, not solved. A dot: not finished.</p>
    </section>
  );
};

export default Archive;
