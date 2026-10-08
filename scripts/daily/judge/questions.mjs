// judge/questions.mjs - the questions the judge answers (dossier v2 7.3). Narrow, literal yes/no ('noul')
// questions only, asked about one word sense at a time: "Does a bass (the fish) lay eggs?". Negations are never
// asked; "Has a head, no brain" is two literal questions combined in code. Each (sense, predicate) cell gets
// three phrasings of the literal question and one obviousness question; each (word, heading) cell gets one
// reading question ("Could a reasonable person read the heading so that the word fits?").
//
// Prompt version: bump PROMPT_VERSION whenever a template changes; every stored answer carries it.
export const PROMPT_VERSION = 'm5d-judge-1';

const article = (w) => (w.article ? `${w.article} ` : '');
/** "a bass (the fish)" */
export const senseLabel = (w, s) => `${article(w)}${w.text.toLowerCase()} (${s.gloss})`;

// predicate -> three literal phrasings; {x} is the sense label
const PART = (part) => [`Does {x} have ${part}?`, `Is it true that {x} has ${part}?`, `Would you say {x} has ${part}?`];
const ABLE = (verb) => [`Can {x} ${verb}?`, `Is {x} able to ${verb}?`, `Is it true that {x} can ${verb}?`];
const IS = (cls) => [`Is {x} a kind of ${cls}?`, `Is {x} ${cls}?`, `Would you call {x} ${cls}?`];
const SPECIAL = {
  'lays-eggs': ['Does {x} lay eggs?', 'Is it true that {x} lays eggs?', 'Does {x} reproduce by laying eggs?'],
  'grows-on-trees': ['Does {x} grow on trees?', 'Is {x} something that grows on a tree?', 'Is it true that {x} grows on trees?'],
  'grows-under-the-soil': ['Does {x} grow under the soil?', 'Does {x} grow underground?', 'Is {x} something that grows beneath the ground?'],
  'grows-on-vine': ['Does {x} grow on a vine?', 'Is {x} something that grows on a vine?', 'Is it true that {x} grows on a climbing or trailing vine?'],
  'lives-in-sea': ['Does {x} live in the sea?', 'Is {x} a sea creature?', 'Is the sea where {x} lives?'],
  'has:hole-middle': PART('a hole in the middle'), 'has:six-legs': PART('six legs'), 'has:eight-legs': PART('eight legs'),
};
const CLASS_NAMES = { 'herb-spice': 'herb or spice', 'body-part': 'body part', gem: 'gemstone', 'unit-length': 'unit of length', 'unit-weight': 'unit of weight', 'unit-time': 'unit of time', 'body-of-water': 'body of water', 'card-game': 'card game', 'card-suit': 'card suit', 'chess-piece': 'chess piece', 'playing-card': 'playing card', 'dog-breed': 'dog breed', 'bird-of-prey': 'bird of prey', 'golf-equipment': 'golf equipment', 'baseball-equipment': 'baseball equipment', 'computer-part': 'computer part', 'kitchen-tool': 'kitchen tool', 'musical-instrument': 'musical instrument', living: 'alive' };

export function phrasings(pred) {
  if (SPECIAL[pred]) return SPECIAL[pred];
  const [kind, rest] = pred.split(':');
  if (kind === 'is') {
    const name = CLASS_NAMES[rest] || rest.replace(/-/g, ' ');
    return rest === 'living' ? ['Is {x} alive?', 'Is {x} a living thing?', 'Would you say {x} is alive?'] : IS(/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`);
  }
  if (kind === 'has') {
    const plural = /s$/.test(rest) && !/ss$/.test(rest);
    return PART(plural ? rest.replace(/-/g, ' ') : `a ${rest.replace(/-/g, ' ')}`);
  }
  if (kind === 'can') return ABLE(rest.replace(/-/g, ' '));
  return [`Is it true that {x}: ${pred}?`];
}

/** One obviousness question per cell: the judge's P(yes) here sets L versus S, and very low values on a true cell set O. */
export const obviousness = (q) => `Would most people answer yes to this straight away, without having to think of a second meaning or an unusual fact: "${q}"`;

/** One reading question per (word, heading) cell. Above 0.25 on a cell that is not already yes, the cell becomes n. */
export const reading = (w, label) => `Could a reasonable person read the heading "${label}" so that the word "${w.text}" fits under it, counting slang, brand names, unusual facts and other readings of the heading?`;

/** The question plan: every (sense, predicate) cell any active heading needs, and every (word, heading) reading cell. */
export function plan(key, content) {
  const preds = new Set();
  for (const h of content.headings) {
    if (h.def.is) preds.add(`is:${h.def.is}`);
    if (h.def.p) preds.add(h.def.p);
    if (h.def.has) { preds.add(h.def.has); preds.add(h.def.not); }
  }
  const cells = [];
  for (const w of content.words) {
    if (w.flags.includes('exclude')) continue;
    for (const s of w.senses) {
      const label = senseLabel(w, s);
      for (const pred of preds) {
        const qs = phrasings(pred).map((t) => t.replace('{x}', label));
        cells.push({ id: `${s.id}|${pred}`, sense: s.id, word: w.id, pred, state: label, questions: [...qs, obviousness(qs[0])] });
      }
    }
  }
  const readings = [];
  for (const w of content.words) {
    if (w.flags.includes('exclude')) continue;
    for (const h of content.headings) if (!h.def.rule && !h.def.verb) readings.push({ id: `${w.id}|${h.id}`, word: w.id, heading: h.id, state: w.text, questions: [reading(w, h.label)] });
  }
  return { preds: [...preds], cells, readings };
}
