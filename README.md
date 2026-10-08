# Match Five

A word puzzle: put each word under a heading it belongs to. Words fit more than
one heading, and every new batch of five makes you rethink the last.

Play it at [burgerfun.ca/match-five](https://burgerfun.ca/match-five/).

## About the game

Each level hands you five words and five headings at a time. Tap a word, then
tap the heading it belongs under (or drag it on a computer). A slot turns green
when its word fits and red when it does not. When every slot so far is green,
five more words and headings arrive, and the new words often want the slots you
already filled. There are eight levels.

## Data

- `src/data/rawGameData.json` is written by hand. Number, spelling and letter
  headings (Prime, `Contains 'A'`, `Letter in 'MOON'` and so on) are marked
  `"computed": true` and carry no word list.
- `npm run generate-game-data` writes `src/data/gameData.json`: stable word IDs,
  and every computed heading's list from its rule in `scripts/clueRules.js`.
- `npm run test:data` re-derives every computed list with independent code,
  checks that every stage of every level can be completed, and fails on any
  emoji in the data or the UI.

## Deploying

burgerfun.ca builds this repo as a submodule and serves the commit it pins.
GitHub Pages serves only a redirect to burgerfun.ca (`pages-redirect/`).

Built with React.
