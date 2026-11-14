// lib/hash.mjs - board hashes (dossier v2 8.4).
// boardHash covers only the puzzle: the words, the headings, the key cells on the board (tiers) and the answer.
// textVersion covers the text a fix may change without wiping anyone's placements: glosses, readings,
// negative predicates, articles and spoken names.
// Canonical form (the independent test rebuilds it on its own; see README "Hashes"):
//   puzzle = JSON.stringify({ answer, cells: [[w, h, tier] sorted by w then h], headings: [labels], words: [texts] })
//   text   = JSON.stringify({ articles: [..], cells: [[w, h, sense, text] sorted], negatives: [..], negWhy: {..}, spoken: [..] })
// sha256 hex of the UTF-8 string; textVersion is the first 12 hex digits.
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const byWH = (a, b) => a[0] - b[0] || a[1] - b[1];

export function puzzleHash(board) {
  const cells = board.cells.map((c) => [c[0], c[1], c[2]]).sort(byWH);
  return sha(JSON.stringify({ answer: board.answer, cells, headings: board.headings.map((h) => h.label), words: board.words.map((w) => w.text) }));
}

export function textVersion(board) {
  const cells = board.cells.map((c) => [c[0], c[1], c[3] ?? null, c[4] ?? null]).sort(byWH);
  return sha(JSON.stringify({ articles: board.words.map((w) => w.article), cells, negatives: board.headings.map((h) => h.negative), negWhy: board.negWhy || {}, spoken: board.headings.map((h) => h.spoken) })).slice(0, 12);
}
