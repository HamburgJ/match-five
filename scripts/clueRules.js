// Rules for Match Five's mechanical clues: numbers, spelling and letters.
//
// A mechanical clue's accept list is never typed by hand. rawGameData.json
// marks it `"computed": true`, and generateGameData.js fills `accepts` with
// every word in the game that satisfies the rule below. Hand-typed lists for
// these clues were wrong in nine places (10 rejected as "2 Digit", Mirror
// accepted as a palindrome, Water and Chocolate rejected by the letter clues,
// U rejected by "Not in 'MOON'").
//
// generateGameData.test.js re-derives every list with its own code and fails
// if the two disagree, so a change here has to be argued in two places.

// Which tiles a family of clues can judge. A clue never accepts a tile outside
// its domain: "No 'E'" does not accept the number 10, and "Contains 'A'" does
// not accept the letter tile A.
const isNumberTile = (word) => /^[0-9]+$/.test(word);
const isLetterTile = (word) => /^[A-Z]$/.test(word);
const isWordTile = (word) => /^[A-Za-z]{2,}$/.test(word);

const VOWELS = 'AEIOU';

const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) {
    if (n % d === 0) return false;
  }
  return true;
};

const isPerfectPower = (n, power) => {
  const root = Math.round(n ** (1 / power));
  return [root - 1, root, root + 1].some((r) => r >= 0 && r ** power === n);
};

const isFibonacci = (n) => {
  let a = 0;
  let b = 1;
  while (b < n) [a, b] = [b, a + b];
  return n === b || n === 0;
};

const reverse = (text) => [...text].reverse().join('');

// Labels written as words, not digits, are matched by these.
const fixed = {
  Even: (w) => isNumberTile(w) && Number(w) % 2 === 0,
  Odd: (w) => isNumberTile(w) && Number(w) % 2 === 1,
  Prime: (w) => isNumberTile(w) && isPrime(Number(w)),
  // 1 is not prime, so it is a non-prime here, as the hand-typed list had it.
  'Non-Prime': (w) => isNumberTile(w) && !isPrime(Number(w)),
  Square: (w) => isNumberTile(w) && isPerfectPower(Number(w), 2),
  Cube: (w) => isNumberTile(w) && isPerfectPower(Number(w), 3),
  Fibonacci: (w) => isNumberTile(w) && isFibonacci(Number(w)),
  // Every one-digit number reads the same backwards; a word needs two or more
  // letters to count.
  Palindrome: (w) =>
    (isNumberTile(w) && w === reverse(w)) ||
    (isWordTile(w) && w.toUpperCase() === reverse(w.toUpperCase())),
  // "Double Letter" means the same letter twice in a row (Apple, Grass), which
  // is how its list was always written.
  'Double Letter': (w) => isWordTile(w) && /([A-Z])\1/.test(w.toUpperCase()),
  // Y is sometimes a vowel, so the letter tile Y fits both Vowel and
  // Consonant. The old lists already accepted it in both; keeping it is the
  // generous call for a game that judges every placement on the spot.
  Vowel: (w) => isLetterTile(w) && (VOWELS.includes(w) || w === 'Y'),
  Consonant: (w) => isLetterTile(w) && !VOWELS.includes(w),
};

// Labels with a parameter. Each entry: [pattern, (match) => predicate].
const patterns = [
  [/^([0-9]+) Digits?$/, (m) => (w) => isNumberTile(w) && w.length === Number(m[1])],
  [/^([0-9]+) Letters?$/, (m) => (w) => isWordTile(w) && w.length === Number(m[1])],
  [/^Contains '([A-Z])'$/, (m) => (w) => isWordTile(w) && w.toUpperCase().includes(m[1])],
  [/^No '([A-Z])'$/, (m) => (w) => isWordTile(w) && !w.toUpperCase().includes(m[1])],
  [/^Letter in '([A-Z]+)'$/, (m) => (w) => isLetterTile(w) && m[1].includes(w)],
  [/^Not in '([A-Z]+)'$/, (m) => (w) => isLetterTile(w) && !m[1].includes(w)],
];

/** The rule for a mechanical clue label, or null for a clue judged by people. */
function ruleFor(label) {
  if (Object.prototype.hasOwnProperty.call(fixed, label)) return fixed[label];
  for (const [pattern, build] of patterns) {
    const match = label.match(pattern);
    if (match) return build(match);
  }
  return null;
}

module.exports = { ruleFor };
