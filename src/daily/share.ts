// The share text (DOSSIER-v2 6.3). Its inputs are a board number, a date string
// and numbers. No board text can reach it, so no word or heading can leak into a
// friend's chat, by construction.
import { isDateString } from './dates';

export interface ShareInput {
  number: number;
  date: string;
  /** Right out of 10 at each check, in order. */
  rights: number[];
  solved: boolean;
  hints: number;
}

export const SITE = 'https://burgerfun.ca';

export const shareUrl = (date: string) => `${SITE}/match-five/daily/${date}/`;

/** Only ASCII letters, digits, spaces, newlines and . , # : / - */
export const SHARE_ALLOWED = /^[A-Za-z0-9 \n.,#:/-]*$/;

export const buildShareText = ({ number, date, rights, solved, hints }: ShareInput) => {
  if (!Number.isInteger(number) || number < 1) throw new Error('board number');
  if (!isDateString(date)) throw new Error('date');
  const clean = rights.map((n) => Math.max(0, Math.min(10, Math.floor(n))));
  const hintPart = hints > 0 ? `, ${hints} ${hints === 1 ? 'hint' : 'hints'}` : '';
  const trail = clean.length ? ` Right per check: ${clean.join(', ')}` : '';
  let line2: string;
  if (solved) {
    const n = clean.length;
    line2 = n === 1 ? `Solved on check 1 of 4${hintPart}.` : `Solved on check ${n} of 4${hintPart}.${trail}`;
  } else {
    line2 = clean.length ? `Not solved${hintPart}.${trail}` : `Not solved${hintPart}, no checks.`;
  }
  return [`Match Five Daily #${number}`, line2, shareUrl(date)].join('\n');
};
