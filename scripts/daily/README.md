# Match Five Daily: content pipeline

The design contract is `match-five-daily-design/DOSSIER-v2.md` (sections 3.4-3.5, 7 and 10). This folder holds the
pipeline that turns a sense-level answer key into proven, scheduled boards, and the tests that check them.

**Status: PILOT.** Every tier in `data/key.json` was judged by the M1 lane (a model in the loop) standing in for the
dossier 7.3 judge, conservatively: anything arguable is A or n. Josh has not reviewed it. `public/daily/boards/` holds
pilot boards marked `"pilot": true`; `npm run test:daily -- --release` refuses them.

## Commands

| Step | Command | What it does |
|---|---|---|
| Key | `node scripts/daily/build-key.mjs` | `content/` -> `data/key.json` (word-level key snapshot) and `work/key-report.txt` |
| Recall | `node scripts/daily/wordnet/recall.mjs` | WordNet recall pass: anchor hypernyms, verb frame 9, part meronyms; writes `work/recall-wordnet.txt`. Every finding is resolved in `content/recall-overrides.txt` |
| Pool | `node scripts/daily/pool.mjs` | thousands of candidate boards over many seeds; prints yield per weekday band |
| Calendar | `node scripts/daily/calendar.mjs [--keep work/calendar.json --keep-until N]` | 90 scheduled days + 30 reserve under every cap in 7.6, built day by day with the caps in the generator's energy |
| Publish | `node scripts/daily/publish.mjs --calendar ... --batch <id> --created-on YYYY-MM-DD [--pilot]` | writes `public/daily/boards/`, with each board's 10! brute-force record and the ledger |
| Golden | `node scripts/daily/build-golden.mjs` | the 300-cell golden set for Josh (`content/golden-set.json`) |
| Review | `node scripts/daily/review/build-review.mjs` | Josh's review pack in `match-five-daily-design/review/`: `JOSH-REVIEW.md` and `review.html` (golden rulings, joke and verb cuts, 10 sample boards); `review/apply-review.mjs <export.json>` writes his decisions back into `content/` |
| Judge | `npm run daily:judge` (plan), `-- --dry-run`, `-- --mock`, `-- --live --vendor clef --budget-usd 3` | the 7.3 judge; never run in the pilot |

Inspection: `node scripts/daily/tools/inspect-key.mjs heading <id...> | word <id...> | takers`, and
`node scripts/daily/tools/show-boards.mjs work/calendar.json [from] [count]`.

## Tests (package.json)

| Script | Runs | Checks |
|---|---|---|
| `test:daily:schema` | on `postinstall`, under a second, clock-free | item 1: shapes, ids known to the key snapshot |
| `test:daily` | `npm test` and CI | items 1-9 of dossier 7.8, then the mutation test (18 mutations: every corruption in 7.8, plus a wrong compound half, E1, E2 and a bad erratum) |
| `test:daily:full` | content PRs | items 1-9 plus all 3,628,800 orders under both graphs, compared with each board's record |

`verify-boards.test.js` shares no code with the generator: its own date maths, counters (backtracking, Ryser's
permanent modulo two primes pinned by Bregman's bound, the certificate, and the 10! enumeration), computed-heading
rules, hashes, widths and caps. `mutation.test.mjs` corrupts copies of the shipped data and proves each corruption is
caught.

## Content (`content/`)

- `vocab/*.txt`: words, senses and per-sense facts. Format in `build-key.mjs`. Salience L/S/O per sense; facts are
  predicates with tiers (`has:head`, `can:fly:A"text"`).
- `classes.json`: the class taxonomy with inherited default facts (a bird lays eggs, has feathers, has no teeth).
- `headings.json`: the heading pools (anchors, properties, joke drafts, the verb heading, computed headings), each
  with its membership rule and negative predicate. Every heading is `draft` until Josh approves it.
- `anchor-lists.txt`: member lists for list anchors (Farm animal, Rodent, Part of a car, Colour...).
- `recall-overrides.txt`: every recall-pass and review decision, auditable, merged by `build-key.mjs`.
- `golden-set.json`: Josh's 300 rulings (y / n / a / o) fit the judge's thresholds.

Every cell is one of L, S (yes), O (true but obscure: yes for uniqueness, never the answer), A (arguable: never on a
board), n (soft no: yes only in the generous count) or N. Compound headings are combined per sense in code from two
literal predicates, then across senses (L > S > A > O > n > N); negations are never judged.

## Board files (`public/daily/boards/`), schema 1

- `index.json`: `{ schema, pilot, launch, first, last, months: ['2026-11', ...], batches: [{ id, createdOn, first, last }], reserve: { file, count }, ledger, errata }`
- `YYYY-MM.json`: `{ schema, pilot, month, days: { 'YYYY-MM-DD': board } }`
- `reserve.json`: `{ schema, pilot, boards: [board with id 'r001'.. and addedOn] }`, append-only
- `ledger.json`: `{ schema, pilot, days: { date: hash }, reserve: { id: hash } }`; published days never change
- `errata.json`: `{ schema, entries: { 'YYYY-MM-DD': { alternates: [{ Word: Heading } x10], note } } }`: accepted alternate
  arrangements by text (7.9); the date may be a scheduled day or one served from the reserve

A board:

```
{ date, number, batch, band ('mon'|'tue'|'wed'|'fri'), harder, pilot,
  words:    [{ id, text, article }] x10        0-4 arrive at load, 5-9 when the top five are full
  headings: [{ id, label, spoken, family, negative }] x10   0-4 top five, 5-9 bottom five
  cells:    [[w, h, tier, sense, text]]        every non-N cell among the 100; S/O text is the gloss, n text the reading
  answer:   [heading index for each word]
  proofOrder: [word indices]                   for each answer pair, every other word that fits its heading comes earlier
  path:     [[[w, h, 'word'|'heading'], ...]]  forced-move rounds
  nudge:    w | null                           hint rung 1: the least obvious S answer pair
  exclusive: [bool x10]                        per heading: every other board word is N (pin sentence 1)
  negWhy:   { [h]: { [w]: 'has' | 'not' } }      compound headings: the half each N cell fails ("a taco has no head" /
                                               "a dog can eat"); every N cell of every compound heading is listed
  bands, players: { sims, literal: { w1, w4 }, noaha: { w1, w4 } }, stats: { s1Fillings, literalMoves, ... },
  hash, textVersion, bruteForce: { orders: 3628800, strict: 1, generous: 1 } }
```

Board rules: R1-R11 from dossier 3.5, plus two editorial rules the pilot's cold-solve review added (generator energy,
hard filter and independent test): **E1** no word is named by a heading on its own board ("Screen" with "Has a
screen"); **E2** no two headings share a base predicate ("Has a trunk" with "Has a trunk, no branches").

Client rules the data assumes:
- **Board number** = days from `index.launch` to the date, plus 1 (derived from the date string, never stored state).
- **Reserve pick** for a date with no schedule entry: the boards with `addedOn` at least two days before the date,
  then `fnv1a32(date string) mod count`.
- **Hint rung 2 (pin)**: the first word in `proofOrder` not already in its answer heading. Sentence 1 ("{Heading}
  takes only one of today's words, by our key: {Word} ({gloss}).") only when `exclusive[h]`; otherwise sentence 2.
- **Miss lines**: `lib/misslines.mjs` is the reference implementation of the dossier 6.1 templates.
- **Hashes**: `hash` = sha256 of `JSON.stringify({ answer, cells: [[w, h, tier]] sorted, headings: [labels], words: [texts] })`;
  `textVersion` = first 12 hex of sha256 of `JSON.stringify({ articles, cells: [[w, h, sense, text]] sorted, negatives, negWhy, spoken })`.
  A stored record whose `boardHash` differs keeps its result and drops its placements (8.4).
- **R10 geometry** lives in `fit/layout.json` (from dossier 4.1). If the daily's CSS changes a number there, change it
  here and rerun the pipeline; `fit/advance-tables.json` holds the measured Outfit 600 and Roboto 500 widths.

## Licences

Sense inventory drafted with Princeton WordNet 3.0 as a recall aid ("WordNet 3.0 Copyright 2006 by Princeton
University. All rights reserved."; permissive licence, see `wordnet/wn.mjs`). Open English WordNet (CC BY 4.0) can
replace it with the same reader once Josh approves the download.
