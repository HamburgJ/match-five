// Match Five Daily: shared types. board.ts normalises what the loader fetches
// into DailyBoard.
//
// Board files (public/daily/boards/, DOSSIER-v2 7.8 and 8.2), as the client reads them:
//   index.json      { launch: "YYYY-MM-DD", months?: ["YYYY-MM"], reserve?: "reserve.json", errata?: "errata.json" }
//   YYYY-MM.json    { createdOn, boards: { "YYYY-MM-DD": Board } }   (or boards: [Board with a "date"])
//   reserve.json    { boards: [Board] }  or  { generations: [{ from: "YYYY-MM-DD", boards: [Board] }] }
//                   The reserve board for a date is boards[fnv1a(date) % boards.length] (loader.ts).
//   errata.json     { "YYYY-MM-DD": { alternates: [{ word: heading }], note } }
// Board: { sections: [{ headings|slots: [5], words: [5] } x2], answer: { word: heading } | [[word, heading]],
//          proofOrder: [10 words], cells: { "Word|Heading": "L"|"S"|"O"|"A"|"n" }  (or key: { heading: { L: [], S: [], ... } }),
//          gloss: { "Word|Heading": "..." }, reading: { "Word|Heading": "..." } (n cells),
//          negative: { heading: "doesn't lay eggs" | ["has no head", "has a brain"] | "you can't {word} someone" },
//          failsHalf: { "Word|Heading": 0|1 }, computed: { heading: "same-letter-twice-in-a-row"|"three-letters" },
//          articles: { word: "a"|"an"|"" }, nudge?: word, obviousness?: { "Word|Heading": number },
//          harder?: boolean (or band: "fri"), bruteForce: { orders, strict, generous }, boardHash?, textVersion? }
// The board number is never read from data: it is derived from the date and the launch date.
// The content pipeline's own publish shape (scripts/daily/lib/board.mjs publishedBoard: words and
// headings as objects, cells as [w, h, tier, sense, text], answer and proofOrder by index, hash,
// negative as a string or { has, not }, negWhy per compound heading) is accepted as well.

/** One verdict per (word, heading) cell. A cell missing from `cells` is N, a confident no. */
export type Tier = 'L' | 'S' | 'O' | 'A' | 'n' | 'N';

/** Rules for computed headings, recomputed in code (never trusted from data). */
export type ComputedRule = 'same-letter-twice-in-a-row' | 'three-letters';

export interface DailyBoard {
  /** Local calendar date the board belongs to, YYYY-MM-DD. */
  date: string;
  /** Board number, derived from the date and the launch date (never stored by hand). */
  number: number;
  /** Two sections of five headings and five words; headings fixed in this order. */
  sections: [Section, Section];
  /** word -> heading */
  answer: Record<string, string>;
  /** Proof order: every other word that fits a pair's heading comes earlier. */
  proofOrder: string[];
  /** `${word}|${heading}` -> tier, for every board cell that is not N. */
  cells: Record<string, Tier>;
  /** `${word}|${heading}` -> gloss of 6 words or fewer, for every S and O cell. */
  gloss: Record<string, string>;
  /** `${word}|${heading}` -> the reading some would hold, for n cells. */
  reading: Record<string, string>;
  /**
   * heading -> negative predicate. A plain heading has one ("doesn't lay eggs",
   * "you can't {word} someone"); a compound heading has one per half
   * (["has no head", "has a brain"]).
   */
  negative: Record<string, string | [string, string]>;
  /** `${word}|${heading}` -> which half of a compound heading a confident no fails (0 or 1). */
  failsHalf: Record<string, 0 | 1>;
  /** heading -> rule id, for computed headings (a ComputedRule for the two the client can recompute). */
  computed: Record<string, ComputedRule | string>;
  /** word -> article: 'a', 'an' or '' (mass nouns). */
  articles: Record<string, string>;
  /** heading -> how a screen reader says it ("You can blank someone"). */
  spoken: Record<string, string>;
  /** The word the nudge names (the least obvious S answer pair), if the board has one. */
  nudge: string | null;
  /** Labelled "harder" only when the board meets the Friday band. */
  harder: boolean;
  /** The recorded exhaustive count; the uniqueness sentence needs 1 and 1. */
  bruteForce: { orders: number; strict: number; generous: number } | null;
  /** Covers words, headings, the key cells on the board and the answer. */
  boardHash: string;
  /** Covers glosses, readings and predicates, versioned apart from the puzzle. */
  textVersion: string;
  /** Where the board came from, for analytics-free debugging only. */
  source: 'schedule' | 'reserve' | 'fixture' | 'stored';
}

export interface Section {
  headings: string[];
  words: string[];
}

/** A tray cell holds a word or nothing. There are always exactly five. */
export type Tray = (string | null)[];

/** heading -> word (null when empty). Every heading of both sections has a key. */
export type Placements = Record<string, string | null>;

export interface CheckRecord {
  /** The ten words in heading order (top five, then bottom five). */
  arrangement: string[];
  /** Right per half: [top, bottom]. */
  counts: [number, number];
  at: number;
}

export type HintRung = 'nudge' | 'pin';
export interface HintRecord {
  rung: HintRung;
  word: string;
}

export type Ended = null | 'solved' | 'shown' | 'out';

/** One stored record per date (DOSSIER-v2 8.4). */
export interface DayRecord {
  boardHash: string;
  textVersion: string;
  board: DailyBoard | null;
  placements: Placements;
  tray: Tray;
  s2: boolean;
  checks: CheckRecord[];
  hints: HintRecord[];
  ended: Ended;
  /** Local date the board ended on (for the run, decisions 9.1 and 9.2). */
  endedOn: string | null;
  /** Board ready to first placement, ms. */
  firstMoveMs: number | null;
  /** Visible time from first placement to the end, ms. */
  elapsedMs: number;
  updatedAt: number;
  /** Pairs the player pressed Disagree on ("Word>Heading"). */
  disputed: string[];
  /** Whether a placement was ever made on this board. */
  started: boolean;
  /** Set when an errata entry upgraded a check to solved (7.9). */
  acceptedAfterFix?: boolean;
}

/** Where a word sits, or where a tap landed. */
export type Spot = { kind: 'tray'; index: number } | { kind: 'heading'; heading: string };
