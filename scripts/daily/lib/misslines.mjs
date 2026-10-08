// lib/misslines.mjs - the reveal's miss lines (dossier v2 6.1, block 4), generated from the board's key cells and
// its answer; no free text. Reference implementation for the review page and for the daily UI.
//   N  "{Word} under {Heading}: by our key, {a} {word} {negative}."           (always listed first; R3 guarantees one)
//      computed: "{Word} under {Heading}: {w-o-r-d} has no letter twice in a row."
//      verb:     "{Word} under You can ___ someone: by our key, you can't {word} someone."
//   L/S "{Word} under {Heading}: true, but {reason}."   reason: "{Owner} fits nowhere else ({gloss})",
//      "once {Blocker} is under {Heading2}, {Owner} fits nowhere else ({gloss})", or "once A, B and C are placed, ..."
//   O  "{Word} under {Heading}: true ({gloss}), but {reason}."
//   n  "{Word} under {Heading}: some would say yes ({reading}), so no answer depends on it."
// arrangement[w] = the heading index the player put word w under (the last check). Only wrong pairs get a line.

const lc = (s) => s.toLowerCase();
const spelled = (t) => t.toUpperCase().replace(/[^A-Z]/g, '').split('').join('-'); // K-I-W-I, as the daily UI spells it
const subject = (w) => `${w.article ? `${w.article} ` : ''}${lc(w.text)}`;

export function negativeLine(board, i, j) {
  const w = board.words[i], h = board.headings[j];
  if (h.family === 'computed') {
    const count = lc(w.text).replace(/[^a-z]/g, '').length;
    return `${w.text} under ${h.label}: ${h.negative.replace('{spelled}', spelled(w.text)).replace('{count}', count)}.`;
  }
  if (h.family === 'verb') return `${w.text} under ${h.label}: by our key, you can't ${lc(w.text)} someone.`;
  let neg = h.negative;
  if (typeof neg === 'object') neg = board.negWhy?.[j]?.[i] === 'not' ? neg.not : neg.has;
  return `${w.text} under ${h.label}: by our key, ${subject(w)} ${neg}.`;
}

function reason(board, j) {
  // why the answer's word needs this heading: its other homes (strict yes) are all taken by their own answer words.
  // Same wording as the daily UI (src/daily/reveal.ts ownerReason), so the review shows what players will read.
  const owner = board.answer.indexOf(j);
  const W = board.words, H = board.headings;
  const yes = new Set(board.cells.filter((c) => ['L', 'S', 'O'].includes(c[2])).map((c) => `${c[0]}|${c[1]}`));
  const cell = board.cells.find((x) => x[0] === owner && x[1] === j);
  const tail = cell && (cell[2] === 'S' || cell[2] === 'O') && cell[4] ? ` (${cell[4]})` : '';
  const others = H.map((_, k) => k).filter((k) => k !== j && yes.has(`${owner}|${k}`));
  if (!others.length) return `${W[owner].text} fits nowhere else${tail}`;
  const blockers = others.map((k) => ({ word: W[board.answer.indexOf(k)].text, heading: H[k].label }));
  if (blockers.length === 1) return `once ${blockers[0].word} is under ${blockers[0].heading}, ${W[owner].text} fits nowhere else${tail}`;
  const names = blockers.map((x) => x.word);
  const list = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `once ${list} are placed, ${W[owner].text} fits nowhere else${tail}`;
}

export function missLines(board, arrangement) {
  const out = { no: [], other: [] };
  const tier = (i, j) => { const c = board.cells.find((x) => x[0] === i && x[1] === j); return c ? c : [i, j, 'N', null, null]; };
  arrangement.forEach((j, i) => {
    if (j === board.answer[i]) return;
    const c = tier(i, j);
    const W = board.words[i], H = board.headings[j];
    if (c[2] === 'N') out.no.push(negativeLine(board, i, j));
    else if (c[2] === 'L' || c[2] === 'S') out.other.push(`${W.text} under ${H.label}: true, but ${reason(board, j)}.`);
    else if (c[2] === 'O') out.other.push(`${W.text} under ${H.label}: true (${c[4]}), but ${reason(board, j)}.`);
    else if (c[2] === 'n') out.other.push(`${W.text} under ${H.label}: some would say yes (${c[4]}), so no answer depends on it.`);
    else out.other.push(`${W.text} under ${H.label}: arguable, and never on a board.`); // R1 makes this unreachable
  });
  return [...out.no, ...out.other];
}

/** The second lives on the card (block 2): every S pair in the answer, with its gloss. */
export function secondLives(board) {
  return board.answer.map((j, i) => [i, j]).filter(([i, j]) => board.cells.some((c) => c[0] === i && c[1] === j && c[2] === 'S'))
    .map(([i, j]) => ({ word: board.words[i].text, heading: board.headings[j].label, gloss: board.cells.find((c) => c[0] === i && c[1] === j)[4] }));
}

/** Hint rung 2 (3.7): the first word in the proof order not already in its answer heading, with its reason line. */
export function pinLine(board, placed = []) {
  const i = board.proofOrder.find((w) => placed[w] !== board.answer[w]);
  if (i === undefined) return null;
  const j = board.answer[i];
  const c = board.cells.find((x) => x[0] === i && x[1] === j);
  const gloss = c && c[2] === 'S' && c[4] ? ` (${c[4]})` : '';
  return board.exclusive[j]
    ? `${board.headings[j].label} takes only one of today's words, by our key: ${board.words[i].text}${gloss}.`
    : `Everything else that fits ${board.headings[j].label} is needed elsewhere, so it's ${board.words[i].text}${gloss}.`;
}
