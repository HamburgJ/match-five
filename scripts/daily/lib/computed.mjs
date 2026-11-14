// lib/computed.mjs - computed headings (spelling rules) and their computed misreadings, generator side.
// Dossier v2 3.4 and 3.9: a computed heading states its rule on the label; every plausible misreading
// is computed in code and enters the key as an n cell. verify-boards.test.js re-implements these rules
// on its own; the two implementations must agree on every vocabulary word.

const letters = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
const VOWELS = 'aeiou';

export const RULES = {
  'letters-3': { says: 'has exactly three letters', yes: (w) => letters(w).length === 3 },
  'letters-4': { says: 'has exactly four letters', yes: (w) => letters(w).length === 4 },
  'letters-5': { says: 'has exactly five letters', yes: (w) => letters(w).length === 5 },
  'letters-6': { says: 'has exactly six letters', yes: (w) => letters(w).length === 6 },
  'double-adjacent': {
    says: 'has the same letter twice in a row',
    yes: (w) => { const s = letters(w); for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) return true; return false; },
  },
  'first-last-same': {
    says: 'starts and ends with the same letter',
    yes: (w) => { const s = letters(w); return s.length > 1 && s[0] === s[s.length - 1]; },
  },
  'starts-vowel': { says: 'starts with a vowel', yes: (w) => VOWELS.includes(letters(w)[0]) },
  'ends-vowel': { says: 'ends with a vowel', yes: (w) => { const s = letters(w); return VOWELS.includes(s[s.length - 1]); } },
  'starts-b': { says: 'starts with B', yes: (w) => letters(w)[0] === 'b' },
  'starts-c': { says: 'starts with C', yes: (w) => letters(w)[0] === 'c' },
  'starts-p': { says: 'starts with P', yes: (w) => letters(w)[0] === 'p' },
  'starts-s': { says: 'starts with S', yes: (w) => letters(w)[0] === 's' },
  'starts-t': { says: 'starts with T', yes: (w) => letters(w)[0] === 't' },
  'starts-m': { says: 'starts with M', yes: (w) => letters(w)[0] === 'm' },
  'letters-7': { says: 'has exactly seven letters', yes: (w) => letters(w).length === 7 },
};

// Misreadings: a reading a stranger might take from the label. Each returns true when the word would
// qualify under the misreading (cells that are already yes are never downgraded to n).
export const MISREADINGS = {
  'repeat-anywhere': {
    says: 'some letter appears twice, not necessarily in a row',
    yes: (w) => { const s = letters(w); return new Set(s).size < s.length; },
  },
  'y-as-vowel-start': { says: 'counting Y as a vowel', yes: (w) => letters(w)[0] === 'y' },
  'y-as-vowel-end': { says: 'counting Y as a vowel', yes: (w) => { const s = letters(w); return s[s.length - 1] === 'y'; } },
  'sound-first-last': {
    // "Starts and ends with the same letter" read by sound: a silent final e hides the match
    // (e.g. "Eagle" ends in e and starts with e: that is a real match; "Snake" ends in e, not s).
    // Words whose last sounded letter (dropping a final silent e) equals the first letter.
    says: 'ignoring a silent final e',
    yes: (w) => { const s = letters(w); if (s.length < 3 || !s.endsWith('e')) return false; return s[0] === s[s.length - 2]; },
  },
};

/** Which misreadings each computed rule carries. */
export const RULE_MISREADINGS = {
  'double-adjacent': ['repeat-anywhere'],
  'starts-vowel': ['y-as-vowel-start'],
  'ends-vowel': ['y-as-vowel-end'],
  'first-last-same': ['sound-first-last'],
};

/** Tier of a computed cell: L when the rule holds, n when a misreading holds, else N. */
export function computedTier(rule, word) {
  const r = RULES[rule];
  if (!r) throw new Error(`unknown computed rule ${rule}`);
  if (r.yes(word)) return { tier: 'L', text: r.says };
  for (const m of RULE_MISREADINGS[rule] || []) if (MISREADINGS[m].yes(word)) return { tier: 'n', text: `misreading: ${MISREADINGS[m].says}` };
  return { tier: 'N' };
}
