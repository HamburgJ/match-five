const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { processGameData, stableWordId } = require('./generateGameData');

const root = path.join(__dirname, '..');
const rawPath = path.join(root, 'src/data/rawGameData.json');
const generatedPath = path.join(root, 'src/data/gameData.json');
const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const committedData = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
const first = processGameData(rawData);
const second = processGameData(rawData);

// ---------------------------------------------------------------------------
// 1. The generator is deterministic and the committed output is current.
// ---------------------------------------------------------------------------

assert.deepEqual(first, second, 'identical source data must produce identical generated data');
assert.deepEqual(
  committedData,
  first,
  'committed gameData.json is stale; run npm run generate-game-data and commit the result'
);

const ids = first.levels.flatMap(level =>
  level.sections.flatMap(section => section.words.map(word => word.id))
);

assert.equal(new Set(ids).size, ids.length, 'every generated word ID must be unique');
assert.ok(
  ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)),
  'every generated word ID must be a UUID v5'
);
assert.equal(
  stableWordId(0, 0, 0, 'Apple'),
  '05fc2d67-7966-5001-8a78-053dd43a893c',
  'the stable ID namespace or key format changed unexpectedly'
);

// ---------------------------------------------------------------------------
// 2. Independent check of every mechanical clue.
//
// Everything below reads the committed gameData.json and rawGameData.json and
// shares no code with generateGameData.js or clueRules.js: its own label
// parser, its own arithmetic and spelling checks. A computed list must equal,
// as a set, every word in the game that truly fits the clue.
// ---------------------------------------------------------------------------

const data = committedData;
const vocabulary = [...new Set(data.levels.flatMap(level =>
  level.sections.flatMap(section => section.words.map(word => word.text))
))];

const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const upper = text => text.toUpperCase();
const allChars = (text, alphabet) => text.length > 0 && [...text].every(ch => alphabet.includes(ch));
const numberTile = text => allChars(text, DIGITS);
const letterTile = text => text.length === 1 && UPPER.includes(text);
const wordTile = text => text.length >= 2 && allChars(upper(text), UPPER);

const largest = Math.max(...vocabulary.filter(numberTile).map(Number), 1);
const primes = new Set();
{
  const composite = new Array(largest + 1).fill(false);
  for (let n = 2; n <= largest; n++) {
    if (composite[n]) continue;
    primes.add(n);
    for (let m = n * n; m <= largest; m += n) composite[m] = true;
  }
}
const squares = new Set();
const cubes = new Set();
for (let i = 0; i * i <= largest; i++) squares.add(i * i);
for (let i = 0; i * i * i <= largest; i++) cubes.add(i * i * i);
const fibonacci = new Set([0, 1]);
for (let a = 1, b = 2; b <= largest; [a, b] = [b, a + b]) fibonacci.add(b);

const readsBothWays = text => {
  for (let i = 0, j = text.length - 1; i < j; i++, j--) {
    if (text[i] !== text[j]) return false;
  }
  return true;
};
const sameLetterTwiceInARow = text => {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) return true;
  }
  return false;
};
const quoted = (label, prefix) => {
  // "Contains 'A'" -> "A"; returns null unless label is prefix + 'LETTERS'.
  if (!label.startsWith(prefix + "'") || !label.endsWith("'")) return null;
  const inner = label.slice(prefix.length + 1, -1);
  return allChars(inner, UPPER) ? inner : null;
};
const countBefore = (label, nouns) => {
  // "3 Letters" -> 3 when the rest of the label is one of the nouns.
  const space = label.indexOf(' ');
  if (space < 1) return null;
  const head = label.slice(0, space);
  return allChars(head, DIGITS) && nouns.includes(label.slice(space + 1)) ? Number(head) : null;
};

/** The truth for a mechanical label, or null when people judge the clue. */
function truthFor(label) {
  switch (label) {
    case 'Even': return w => numberTile(w) && Number(w) % 2 === 0;
    case 'Odd': return w => numberTile(w) && Number(w) % 2 !== 0;
    case 'Prime': return w => numberTile(w) && primes.has(Number(w));
    case 'Non-Prime': return w => numberTile(w) && !primes.has(Number(w));
    case 'Square': return w => numberTile(w) && squares.has(Number(w));
    case 'Cube': return w => numberTile(w) && cubes.has(Number(w));
    case 'Fibonacci': return w => numberTile(w) && fibonacci.has(Number(w));
    case 'Palindrome': return w => (numberTile(w) || wordTile(w)) && readsBothWays(upper(w));
    case 'Double Letter': return w => wordTile(w) && sameLetterTwiceInARow(upper(w));
    // Y counts as both a vowel and a consonant (it is sometimes either).
    case 'Vowel': return w => letterTile(w) && 'AEIOUY'.includes(w);
    case 'Consonant': return w => letterTile(w) && !'AEIOU'.includes(w);
    default: break;
  }
  const digits = countBefore(label, ['Digit', 'Digits']);
  if (digits !== null) return w => numberTile(w) && w.length === digits;
  const letters = countBefore(label, ['Letter', 'Letters']);
  if (letters !== null) return w => wordTile(w) && w.length === letters;
  const contains = quoted(label, 'Contains ');
  if (contains && contains.length === 1) return w => wordTile(w) && upper(w).includes(contains);
  const lacks = quoted(label, 'No ');
  if (lacks && lacks.length === 1) return w => wordTile(w) && !upper(w).includes(lacks);
  const inWord = quoted(label, 'Letter in ');
  if (inWord) return w => letterTile(w) && inWord.includes(w);
  const notInWord = quoted(label, 'Not in ');
  if (notInWord) return w => letterTile(w) && !notInWord.includes(w);
  return null;
}

let mechanicalChecked = 0;
for (const [label, hint] of Object.entries(data.hints)) {
  assert.ok(Array.isArray(hint.accepts), `clue "${label}" has no accepts list`);
  assert.equal(new Set(hint.accepts).size, hint.accepts.length, `clue "${label}" lists a word twice`);
  const truth = truthFor(label);
  const raw = rawData.hints[label];
  assert.ok(raw, `clue "${label}" is missing from rawGameData.json`);
  if (!truth) {
    assert.notEqual(raw.computed, true, `clue "${label}" is marked computed but this test has no rule for it`);
    continue;
  }
  assert.equal(raw.computed, true, `mechanical clue "${label}" must be computed, not typed`);
  assert.ok(!('accepts' in raw), `computed clue "${label}" must not carry a typed list in rawGameData.json`);
  const expected = vocabulary.filter(truth).sort();
  const actual = [...hint.accepts].sort();
  assert.deepEqual(actual, expected, `clue "${label}" does not accept exactly the words that fit it`);
  mechanicalChecked += 1;
}
assert.ok(mechanicalChecked >= 40, `expected the mechanical clues to be checked, checked ${mechanicalChecked}`);

// The nine objective errors found in the hand-typed lists (Match Five Daily
// dossier, U1 section 4.3), pinned so they cannot come back.
const fits = (label, word) => data.hints[label].accepts.includes(word);
const repairs = [
  ['2 Digit', '10', true],
  ['Palindrome', 'Mirror', false],
  ["No 'I'", 'Water', true],
  ["No 'I'", 'Chocolate', true],
  ["No 'O'", 'Water', true],
  ["No 'U'", 'Water', true],
  ["No 'U'", 'Chocolate', true],
  ["Contains 'O'", 'Chocolate', true],
  ["Not in 'MOON'", 'U', true],
];
for (const [label, word, shouldFit] of repairs) {
  assert.equal(fits(label, word), shouldFit, `${word} ${shouldFit ? 'must' : 'must not'} fit "${label}"`);
}
// The unused "Not in 'RAIN'" listed R; it is computed now too.
assert.equal(fits("Not in 'RAIN'", 'R'), false, 'R is in RAIN');

// ---------------------------------------------------------------------------
// 3. Every stage of every level can be completed.
//
// A section unlocks only when every slot so far holds a word its clue
// accepts, so each stage (sections 1..k together) needs a perfect matching
// between its slots and its words. Kuhn's augmenting paths, written here.
// ---------------------------------------------------------------------------

function hasPerfectMatching(slots, words) {
  if (slots.length !== words.length) return false;
  const slotOfWord = new Array(words.length).fill(-1);
  const tryPlace = (slot, seen) => {
    for (let w = 0; w < words.length; w++) {
      if (seen[w] || !fits(slots[slot], words[w])) continue;
      seen[w] = true;
      if (slotOfWord[w] === -1 || tryPlace(slotOfWord[w], seen)) {
        slotOfWord[w] = slot;
        return true;
      }
    }
    return false;
  };
  return slots.every((_, slot) => tryPlace(slot, new Array(words.length).fill(false)));
}

data.levels.forEach((level, levelIndex) => {
  const slots = [];
  const words = [];
  level.sections.forEach((section, sectionIndex) => {
    section.slots.forEach(label => assert.ok(data.hints[label], `level ${levelIndex + 1} uses unknown clue "${label}"`));
    slots.push(...section.slots);
    words.push(...section.words.map(word => word.text));
    assert.ok(
      hasPerfectMatching(slots, words),
      `level ${levelIndex + 1} cannot get past section ${sectionIndex + 1}: no arrangement fits every slot`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. No emoji in the data or in anything the classic game renders.
// ---------------------------------------------------------------------------

const EMOJI = /\p{Extended_Pictographic}|️/u;
assert.ok(!('wordEmojis' in rawData) && !('wordEmojis' in data), 'tiles are text only; wordEmojis must stay deleted');
const strings = value => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(strings)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [key, ...strings(inner)])
  : [];
for (const text of [...strings(rawData), ...strings(data)]) {
  assert.ok(!EMOJI.test(text), `game data contains an emoji: ${JSON.stringify(text)}`);
}

const renderedSources = [
  'public/index.html',
  'src/App.css',
  'src/index.css',
  ...['src/components', 'src/styles'].flatMap(dir =>
    fs.readdirSync(path.join(root, dir)).map(name => `${dir}/${name}`)
  ),
];
for (const file of renderedSources) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const hit = text.match(EMOJI);
  assert.ok(!hit, `${file} contains an emoji (${hit && JSON.stringify(hit[0])}); the site rule is no emoji on screen`);
}

// ---------------------------------------------------------------------------
// 5. No uniqueness claim for the classic levels. Their final boards have from
//    16 to 658,017 complete arrangements, so the page and the classic UI may
//    never promise "the one arrangement". (Only the daily, whose boards are
//    proven unique, may say that, and its copy lives in src/daily.)
// ---------------------------------------------------------------------------

const UNIQUENESS_CLAIM = /\b(one|single|only|unique)\s+(consistent\s+)?(arrangement|solution|answer)\b|\bone\s+consistent\s+set\b|\bexactly one\b/i;
for (const file of renderedSources) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const claim = text.match(UNIQUENESS_CLAIM);
  assert.ok(!claim, `${file} claims a unique answer ("${claim && claim[0]}"), but every classic level has many`);
}

const stages = data.levels.reduce((sum, level) => sum + level.sections.length, 0);
console.log(
  `Verified ${ids.length} deterministic, unique Match Five word IDs; ` +
  `${mechanicalChecked} computed clues re-derived independently; ` +
  `all ${stages} stages of ${data.levels.length} levels completable; no emoji.`
);
