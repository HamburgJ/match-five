// lib/board.mjs - turn a generated board into the published board object (format: README "Board files").
import { analyzeBoard, graphs } from './analyze.mjs';
import { bruteForceCount } from './match.mjs';
import { puzzleHash, textVersion } from './hash.mjs';
import { YES_STRICT, YES_GENEROUS } from './key.mjs';

export function publishedBoard(K, W, H, { players, bands, pilot = true, brute = false } = {}) {
  const a = analyzeBoard(K, W, H);
  if (!a.ok) throw new Error(`board fails ${a.fails.join(', ')}: ${W.join(',')} | ${H.join(',')}`);
  const words = W.map((w) => { const x = K.word(w); return { id: w, text: x.text, article: x.article }; });
  const headings = H.map((h) => { const x = K.heading(h); return { id: h, label: x.label, spoken: x.spoken || x.label, family: x.family, negative: x.negative }; });
  const board = {
    pilot,
    words, headings,
    cells: a.cells,
    answer: a.ans,
    proofOrder: a.cert,
    path: a.path.rounds.map((r) => r.map((x) => [x.w, x.h, x.by])),
    nudge: a.nudge,
    exclusive: a.exclusive,
    // for 'Has X, can't Y' headings, every N cell names the half it fails: 'has' ("a taco has no head") or 'not'
    // ("a dog can eat"), so the reveal's confident no is the true one. { [heading index]: { [word index]: half } }
    negWhy: Object.fromEntries(H.map((h, j) => [j, h]).filter(([, h]) => typeof K.heading(h).negative === 'object')
      .map(([j, h]) => [j, Object.fromEntries(W.map((w, i) => [i, w]).filter(([, w]) => K.tier(w, h) === 'N').map(([i, w]) => [i, K.raw.negWhy?.[h]?.[w] === 'not' ? 'not' : 'has']))])),
    bands: bands || [],
    players: players || null,
    stats: {
      s1Fillings: a.s1Fillings, literalMoves: a.literalMoves, rounds: a.path.rounds.length, meanDeg: a.meanDeg, maxTakers: a.maxTakers,
      sPairs: a.sPairs.length, aha: a.aha.length, oCells: a.oCells, nCells: a.nCells, leftover: a.leftover,
    },
  };
  board.hash = puzzleHash(board);
  board.textVersion = textVersion(board);
  if (brute) board.bruteForce = bruteForceRecord(K, W, H);
  return board;
}

export function bruteForceRecord(K, W, H) {
  const { T } = graphs(K, W, H);
  const s = bruteForceCount(T.map((r) => r.map((t) => YES_STRICT.has(t))));
  const g = bruteForceCount(T.map((r) => r.map((t) => YES_GENEROUS.has(t))));
  if (s.visited !== 3628800 || g.visited !== 3628800) throw new Error('brute force did not visit 10! orders');
  return { orders: s.visited, strict: s.count, generous: g.count };
}
