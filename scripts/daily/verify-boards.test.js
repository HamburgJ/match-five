#!/usr/bin/env node
// verify-boards.test.js - the independent test for Match Five Daily's board data (dossier v2 7.8; AGENTS.md:
// every generated dataset ships with an independent-parser test).
//
// It shares NO code with the generator (scripts/daily/lib, generate.mjs, calendar.mjs, publish.mjs) or with
// the app's loader. It reads the shipped files itself and re-derives everything its own way:
//   - its own date arithmetic, its own hashes, its own computed-heading rules and misreadings;
//   - matching counts three ways: backtracking enumeration, Ryser's permanent modulo two primes pinned exact
//     by Bregman's bound, and the published certificate (proof order); --full adds all 10! = 3,628,800
//     orders under both graphs;
//   - its own text-width computation for R10 from the advance tables shipped beside it;
//   - its own reading of every calendar cap.
//
// Layers (package.json):
//   test:daily:schema  item 1 only; deterministic, clock-free, well under a second (runs on postinstall)
//   test:daily         items 1-9
//   test:daily:full    items 1-9 plus the 10! brute force under both graphs, compared with each board's record
// Flags: --release fails on pilot data or unapproved headings; --boards <dir>; --key <file>; --quiet.
//
// Items (dossier 7.8): 1 schema, 2 dates, 3 key, 4 uniqueness, 5 grammar, 6 fits, 7 calendar, 8 frozen days,
// 9 text. Exit code 1 on any failure.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HERE = __dirname;
const GAME = path.join(HERE, '..', '..');

// ---------------------------------------------------------------- the rules, restated independently
const TIERS = ['L', 'S', 'O', 'A', 'n', 'N'];
const STRICT_YES = { L: 1, S: 1, O: 1 };
const GENEROUS_YES = { L: 1, S: 1, O: 1, n: 1 };
const FAIR = { L: 1, S: 1 };
const CAPS = {
  wordGap: 14, engineGap: 30, wordMaxIn365: 6, ahaGap: 90, jokePairGap: 120,
  spacing: { anchor: 7, property: 14, joke: 42 }, computedSameGap: 14,
  weekly: { closed: 1, verb: 2, computed: 2, leftover: 1 }, firstFortnight: 14, reserveBands: ['tue'],
  jokeTakers: 3, maxJokes: 2, maxVerbs: 1, maxComputed: 1,
};
// band of each weekday (0 = Monday)
const WEEKDAY_BANDS = { 0: 'mon', 1: 'tue', 2: 'wed', 3: 'wed', 4: 'fri', 5: 'wed', 6: 'tue' };

// computed headings: each rule and its misreadings, written here from the labels' plain meaning
const onlyLetters = (s) => { let o = ''; for (const ch of s.toLowerCase()) if (ch >= 'a' && ch <= 'z') o += ch; return o; };
const isVowel = (ch) => ch === 'a' || ch === 'e' || ch === 'i' || ch === 'o' || ch === 'u';
const COMPUTED = {
  'letters-3': { yes: (w) => onlyLetters(w).length === 3, misread: [] },
  'letters-4': { yes: (w) => onlyLetters(w).length === 4, misread: [] },
  'letters-5': { yes: (w) => onlyLetters(w).length === 5, misread: [] },
  'letters-6': { yes: (w) => onlyLetters(w).length === 6, misread: [] },
  'letters-7': { yes: (w) => onlyLetters(w).length === 7, misread: [] },
  'double-adjacent': {
    yes: (w) => { const s = onlyLetters(w); for (let i = 0; i + 1 < s.length; i++) if (s[i] === s[i + 1]) return true; return false; },
    misread: [(w) => { const s = onlyLetters(w); for (let i = 0; i < s.length; i++) if (s.indexOf(s[i], i + 1) >= 0) return true; return false; }],
  },
  'first-last-same': {
    yes: (w) => { const s = onlyLetters(w); return s.length >= 2 && s[0] === s[s.length - 1]; },
    misread: [(w) => { const s = onlyLetters(w); return s.length >= 3 && s[s.length - 1] === 'e' && s[0] === s[s.length - 2]; }],
  },
  'starts-vowel': { yes: (w) => isVowel(onlyLetters(w)[0]), misread: [(w) => onlyLetters(w)[0] === 'y'] },
  'ends-vowel': { yes: (w) => { const s = onlyLetters(w); return isVowel(s[s.length - 1]); }, misread: [(w) => { const s = onlyLetters(w); return s[s.length - 1] === 'y'; }] },
  'starts-b': { yes: (w) => onlyLetters(w)[0] === 'b', misread: [] },
  'starts-c': { yes: (w) => onlyLetters(w)[0] === 'c', misread: [] },
  'starts-p': { yes: (w) => onlyLetters(w)[0] === 'p', misread: [] },
  'starts-s': { yes: (w) => onlyLetters(w)[0] === 's', misread: [] },
  'starts-t': { yes: (w) => onlyLetters(w)[0] === 't', misread: [] },
  'starts-m': { yes: (w) => onlyLetters(w)[0] === 'm', misread: [] },
};

// ---------------------------------------------------------------- small utilities
function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}
// civil date -> day number (days since 1970-01-01), no Date object involved
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  let y = +m[1]; const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return NaN;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return NaN;
  y -= mo <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const weekdayOf = (iso) => ((dayNumber(iso) + 3) % 7 + 7) % 7; // 0 = Monday (1970-01-01 was a Thursday)
function isoFromDay(n) {
  const z = n + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const cmpPair = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

// ---------------------------------------------------------------- counting
function countByBacktracking(ok) {
  const n = ok.length;
  let count = 0, found = null;
  const slotOf = new Array(n);
  const go = (w, used) => {
    if (w === n) { count++; if (!found) found = slotOf.slice(); return; }
    for (let h = 0; h < n; h++) if (!(used & (1 << h)) && ok[w][h]) { slotOf[w] = h; go(w + 1, used | (1 << h)); }
  };
  go(0, 0);
  return { count, found };
}
const PRIMES = (() => {
  const isPrime = (x) => { if (x < 2) return false; for (let d = 2; d * d <= x; d++) if (x % d === 0) return false; return true; };
  const out = [];
  for (let p = 2 ** 26 - 1; out.length < 2; p -= 2) if (isPrime(p)) out.push(p);
  return out;
})();
function ryserMod(ok, p) {
  const n = ok.length;
  const sums = new Array(n).fill(0);
  let total = 0;
  for (let k = 1; k < (1 << n); k++) {
    const flip = 31 - Math.clz32(k & -k);
    const gray = k ^ (k >> 1);
    const sign = (gray >> flip) & 1 ? 1 : -1;
    for (let i = 0; i < n; i++) if (ok[i][flip]) sums[i] += sign;
    let prod = 1;
    for (let i = 0; i < n && prod; i++) prod = (prod * (((sums[i] % p) + p) % p)) % p;
    let bits = 0; for (let g = gray; g; g &= g - 1) bits++;
    total = (total + ((n - bits) % 2 === 0 ? prod : (p - prod) % p)) % p;
  }
  return total;
}
function exactPermanent(ok) {
  // Bregman: perm <= prod over rows (r!)^(1/r); the two residues pin the count when the bound is below p1*p2
  let logBound = 0;
  for (const row of ok) { const r = row.filter(Boolean).length; let lf = 0; for (let t = 2; t <= r; t++) lf += Math.log(t); if (r) logBound += lf / r; }
  const [p1, p2] = PRIMES;
  if (logBound >= Math.log(p1) + Math.log(p2) - 1) return null;
  const r1 = BigInt(ryserMod(ok, p1)), r2 = BigInt(ryserMod(ok, p2)), P1 = BigInt(p1), P2 = BigInt(p2);
  const inv = (a, m) => { let [g, ng, s, ns] = [m, ((a % m) + m) % m, 0n, 1n]; while (ng) { const q = g / ng; [g, ng] = [ng, g - q * ng]; [s, ns] = [ns, s - q * ns]; } return ((s % m) + m) % m; };
  const t = ((((r2 - r1) % P2) + P2) % P2) * inv(P1, P2) % P2;
  return Number(r1 + P1 * t);
}
// every one of 10! orders, generated in lexicographic order (next-permutation), no pruning
function bruteForce(ok) {
  const n = ok.length, p = [];
  for (let i = 0; i < n; i++) p.push(i);
  let visited = 0, count = 0;
  for (;;) {
    visited++;
    let fits = true;
    for (let w = 0; w < n; w++) if (!ok[w][p[w]]) { fits = false; break; }
    if (fits) count++;
    let i = n - 2;
    while (i >= 0 && p[i] >= p[i + 1]) i--;
    if (i < 0) break;
    let j = n - 1;
    while (p[j] <= p[i]) j--;
    [p[i], p[j]] = [p[j], p[i]];
    for (let a = i + 1, b = n - 1; a < b; a++, b--) [p[a], p[b]] = [p[b], p[a]];
  }
  return { visited, count };
}

// ---------------------------------------------------------------- R10 widths
function makeWidths(tables, layout) {
  const width = (s, table, px) => {
    const t = tables[table];
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      const a = t.advance[s[i]];
      if (a === undefined) return Infinity;
      w += a + (i > 0 && t.kern[s[i - 1] + s[i]] ? t.kern[s[i - 1] + s[i]] : 0);
    }
    return w * px;
  };
  const col = (v) => (v - 2 * layout.gutter - (layout.columns - 1) * layout.gap) / layout.columns;
  const lines = (label, px, max) => {
    let n = 1, line = '';
    for (const word of label.split(' ')) {
      if (width(word, 'label', px) > max) return Infinity;
      const next = line ? line + ' ' + word : word;
      if (width(next, 'label', px) > max) { n++; line = word; } else line = next;
    }
    return n;
  };
  return {
    labelOk: (label) => layout.checks.every((c) => lines(label, c.labelPx, col(c.viewport) - 2 * layout.cardBorder - 2 * layout.cardPadding - layout.safetyPx) <= c.labelMaxLines),
    wordOk: (word) => layout.checks.every((c) => {
      const inner = col(c.viewport) - 2 * layout.cardBorder - 2 * layout.cardPadding - 2 * layout.wellBorder - 2 * layout.tilePaddingX;
      const tray = col(c.viewport) - 2 * layout.trayBorder - 2 * layout.trayPaddingX;
      const w = width(word, 'word', c.wordPx);
      return w <= inner - layout.safetyPx && w <= tray - layout.safetyPx;
    }),
  };
}

// ---------------------------------------------------------------- the verifier
function verify(opts = {}) {
  const boardsDir = opts.boardsDir || path.join(GAME, 'public', 'daily', 'boards');
  const keyPath = opts.keyPath || path.join(HERE, 'data', 'key.json');
  const mode = opts.mode || 'normal';
  const release = !!opts.release;
  const failures = [];
  const notes = [];
  const fail = (where, msg) => { failures.push(`${where}: ${msg}`); };

  // ---- load
  let index, key;
  // the schema layer runs inside every site install: with no board data at all there is nothing to check yet
  if (mode === 'schema' && !fs.existsSync(path.join(boardsDir, 'index.json'))) { notes.push('no board data yet (public/daily/boards/index.json absent)'); return { failures, notes, counts: { scheduled: 0, reserve: 0 } }; }
  try { index = readJson(path.join(boardsDir, 'index.json')); } catch (e) { fail('index.json', `unreadable (${e.message})`); return { failures, notes }; }
  try { key = readJson(keyPath); } catch (e) { fail('key', `unreadable (${e.message})`); return { failures, notes }; }
  if (index.schema !== 1) fail('index.json', 'schema is not 1');
  if (key.schema !== 1) fail('key', 'schema is not 1');
  const covW = new Set(key.coverage && key.coverage.words), covH = new Set(key.coverage && key.coverage.headings);
  const tierOf = (wid, hid) => { const row = key.cells[hid]; const c = row && row[wid]; return c ? c[0] : 'N'; };

  const scheduled = []; // { date, board, file, batch }
  const months = Array.isArray(index.months) ? index.months : [];
  for (const month of months) {
    const file = `${month}.json`;
    let mf;
    try { mf = readJson(path.join(boardsDir, file)); } catch (e) { fail(file, `unreadable (${e.message})`); continue; }
    if (mf.schema !== 1) fail(file, 'schema is not 1');
    if (mf.month !== month) fail(file, `month field ${mf.month} differs from the file name`);
    for (const [date, board] of Object.entries(mf.days || {})) {
      if (date.slice(0, 7) !== month) fail(file, `${date} is not in ${month}`);
      scheduled.push({ date, board, file });
    }
  }
  let reserve = { boards: [] };
  try { reserve = readJson(path.join(boardsDir, 'reserve.json')); } catch (e) { fail('reserve.json', `unreadable (${e.message})`); }
  const reserveBoards = (reserve.boards || []).map((board) => ({ id: board.id, board }));
  const all = [...scheduled.map((s) => ({ where: s.date, board: s.board })), ...reserveBoards.map((r) => ({ where: `reserve ${r.id}`, board: r.board }))];
  if (!scheduled.length) fail('index.json', 'no scheduled boards');

  // ---- item 1: schema
  const strings = []; // every shipped string, for item 9
  for (const { where, board: b } of all) {
    if (!b || typeof b !== 'object') { fail(where, 'not an object'); continue; }
    if (!Array.isArray(b.words) || b.words.length !== 10) { fail(where, 'needs 10 words (two sections of 5)'); continue; }
    if (!Array.isArray(b.headings) || b.headings.length !== 10) { fail(where, 'needs 10 headings (two sections of 5)'); continue; }
    const wids = b.words.map((w) => w.id), hids = b.headings.map((h) => h.id);
    if (new Set(wids).size !== 10 || new Set(b.words.map((w) => String(w.text).toLowerCase())).size !== 10) fail(where, 'a word repeats');
    if (new Set(hids).size !== 10 || new Set(b.headings.map((h) => String(h.label).toLowerCase())).size !== 10) fail(where, 'a heading repeats');
    for (const w of b.words) {
      const kw = key.words[w.id];
      if (!kw || !covW.has(w.id)) { fail(where, `word ${w.id} is not in the key snapshot`); continue; }
      if (w.text !== kw.text) fail(where, `word ${w.id} text "${w.text}" differs from the key ("${kw.text}")`);
      if (w.article !== kw.article) fail(where, `word ${w.id} article differs from the key`);
      strings.push(w.text);
    }
    for (const h of b.headings) {
      const kh = key.headings[h.id];
      if (!kh || !covH.has(h.id)) { fail(where, `heading ${h.id} is not in the key snapshot`); continue; }
      if (h.label !== kh.label) fail(where, `heading ${h.id} label differs from the key`);
      if (h.family !== kh.family) fail(where, `heading ${h.id} family differs from the key`);
      strings.push(h.label, h.spoken);
      if (typeof h.negative === 'string') strings.push(h.negative); else if (h.negative) strings.push(h.negative.has, h.negative.not);
    }
    if (!Array.isArray(b.cells)) fail(where, 'cells missing');
    else for (const c of b.cells) {
      if (!Array.isArray(c) || c.length < 3 || !(c[0] >= 0 && c[0] < 10) || !(c[1] >= 0 && c[1] < 10) || !TIERS.includes(c[2]) || c[2] === 'N') { fail(where, `malformed cell ${JSON.stringify(c)}`); continue; }
      const sense = c[3];
      if (sense != null) { const kw = key.words[wids[c[0]]]; if (!kw || !kw.senses || !kw.senses[sense]) fail(where, `cell ${wids[c[0]]} x ${hids[c[1]]}: sense ${sense} is not in the key`); }
      if (c[4] != null) strings.push(c[4]);
    }
    const perm = (a) => Array.isArray(a) && a.length === 10 && new Set(a).size === 10 && a.every((x) => Number.isInteger(x) && x >= 0 && x < 10);
    if (!perm(b.answer)) fail(where, 'answer is not a permutation of the 10 headings');
    if (!perm(b.proofOrder)) fail(where, 'proofOrder does not list every word once');
  }
  if (mode === 'schema') return { failures, notes, counts: { scheduled: scheduled.length, reserve: reserveBoards.length } };

  const boardOk = (b) => b && Array.isArray(b.words) && b.words.length === 10 && Array.isArray(b.headings) && b.headings.length === 10 && Array.isArray(b.answer) && b.answer.length === 10;

  // ---- item 2: dates
  const launch = index.launch;
  const L0 = dayNumber(launch);
  if (!Number.isFinite(L0)) fail('index.json', `launch ${launch} is not a date`);
  else if (weekdayOf(launch) !== 0) fail('index.json', `launch ${launch} is not a Monday`);
  scheduled.sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
  scheduled.forEach((s, i) => {
    const dn = dayNumber(s.date);
    if (!Number.isFinite(dn)) { fail(s.date, 'not a valid date'); return; }
    if (dn !== L0 + i) fail(s.date, `schedule is not contiguous from launch (expected ${isoFromDay(L0 + i)})`);
    if (s.board.date !== s.date) fail(s.date, `board.date ${s.board.date} differs from its key`);
    if (s.board.number !== dn - L0 + 1) fail(s.date, `board number ${s.board.number} should be ${dn - L0 + 1} (from the date)`);
  });
  if (scheduled.length && index.last !== scheduled[scheduled.length - 1].date) fail('index.json', `last ${index.last} differs from the last scheduled date`);
  if (scheduled.length && index.first !== scheduled[0].date) fail('index.json', `first ${index.first} differs from the first scheduled date`);
  for (const r of reserveBoards) if (r.board.date != null || r.board.number != null) fail(`reserve ${r.id}`, 'a reserve board must not carry a date or number');
  if ((reserve.boards || []).length !== (index.reserve && index.reserve.count)) fail('index.json', 'reserve count differs from reserve.json');

  // ---- items 3, 4, 5: key, uniqueness, grammar (per board)
  const hashOf = (b) => sha256(JSON.stringify({
    answer: b.answer,
    cells: b.cells.map((c) => [c[0], c[1], c[2]]).sort(cmpPair),
    headings: b.headings.map((h) => h.label),
    words: b.words.map((w) => w.text),
  }));
  const textOf = (b) => sha256(JSON.stringify({
    articles: b.words.map((w) => w.article),
    cells: b.cells.map((c) => [c[0], c[1], c[3] == null ? null : c[3], c[4] == null ? null : c[4]]).sort(cmpPair),
    negatives: b.headings.map((h) => h.negative),
    negWhy: b.negWhy || {},
    spoken: b.headings.map((h) => h.spoken),
  })).slice(0, 12);
  const derived = new Map(); // board -> facts for the calendar
  for (const { where, board: b } of all) {
    if (!boardOk(b)) continue;
    const W = b.words.map((w) => w.id), H = b.headings.map((h) => h.id);
    if (!W.every((w) => key.words[w]) || !H.every((h) => key.headings[h])) continue;
    const fam = H.map((h) => key.headings[h].family);
    // item 3: the board's cells equal the key's rows
    const T = W.map((w) => H.map((h) => tierOf(w, h)));
    const shipped = W.map(() => H.map(() => 'N'));
    for (const c of b.cells) shipped[c[0]][c[1]] = c[2];
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (shipped[i][j] !== T[i][j]) fail(where, `cell ${W[i]} x ${H[j]} is ${shipped[i][j]} on the board but ${T[i][j]} in the key`);
    for (const c of b.cells) {
      const k = key.cells[H[c[1]]] && key.cells[H[c[1]]][W[c[0]]];
      if (k && ((k[1] == null ? null : k[1]) !== (c[3] == null ? null : c[3]) || (k[2] == null ? null : k[2]) !== (c[4] == null ? null : c[4]))) fail(where, `cell ${W[c[0]]} x ${H[c[1]]}: sense or text differs from the key`);
    }
    if (T.some((r) => r.includes('A'))) fail(where, 'R1: an arguable (A) cell is on the board');
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (T[i][j] === 'S' || T[i][j] === 'O') {
      const k = key.cells[H[j]][W[i]];
      const words = k && k[2] ? String(k[2]).trim().split(/\s+/).length : 0;
      if (!words || words > 6) fail(where, `R11: ${W[i]} x ${H[j]} (${T[i][j]}) needs a gloss of 6 words or fewer`);
    }
    for (const h of b.headings) {
      const neg = h.negative;
      const ok = (typeof neg === 'string' && neg.trim()) || (neg && typeof neg === 'object' && neg.has && neg.not);
      if (!ok) fail(where, `R11: heading ${h.id} has no negative predicate`);
    }
    // editorial rules (README "Board rules"): E1 no word named by a heading on its board; E2 no two headings that
    // share a base predicate (the same negative, or the same first half of one)
    const content = (label) => String(label).toLowerCase().split(/[^a-z]+/).filter((x) => x && !['a', 'an', 'the', 'is', 'isn', 't', 'can', 'has', 'no', 'not', 'of', 'in', 'to', 'you', 'someone', 'and', 'or', 's'].includes(x));
    for (const w of b.words) for (const h of b.headings) {
      const x = String(w.text).toLowerCase();
      if (content(h.label).some((k) => k === x || k === x + 's' || k === x + 'es' || x === k + 's')) fail(where, `E1: heading "${h.label}" names the word ${w.text}`);
    }
    const firstHalf = (h) => String(typeof h.negative === 'string' ? h.negative : (h.negative && h.negative.has) || '').toLowerCase().trim();
    for (let j = 0; j < 10; j++) for (let k = j + 1; k < 10; k++) {
      const p = b.headings[j], q = b.headings[k];
      if (p.family === 'computed' || q.family === 'computed') continue;
      if (firstHalf(p) && firstHalf(p) === firstHalf(q)) fail(where, `E2: "${p.label}" and "${q.label}" share a base predicate`);
    }
    // compound headings: every confident no names the half it fails, as the key snapshot records it
    const nw = b.negWhy || {};
    for (const k of Object.keys(nw)) if (!(b.headings[k] && typeof b.headings[k].negative === 'object')) fail(where, `negWhy names heading ${k}, which is not compound`);
    b.headings.forEach((h, j) => {
      if (!(h.negative && typeof h.negative === 'object')) return;
      for (let i = 0; i < 10; i++) {
        const half = nw[j] && nw[j][i];
        if (T[i][j] !== 'N') { if (half !== undefined) fail(where, `negWhy: ${W[i]} x ${H[j]} is ${T[i][j]}, not a confident no`); continue; }
        const want = key.negWhy && key.negWhy[H[j]] && key.negWhy[H[j]][W[i]] === 'not' ? 'not' : 'has';
        if (half !== want) fail(where, `negWhy: ${W[i]} x ${H[j]} should fail the '${want}' half (has ${JSON.stringify(half)})`);
      }
    });
    for (const w of b.words) if (!['a', 'an', ''].includes(w.article)) fail(where, `R11: word ${w.id} has no article`);
    // item 4: uniqueness, three ways
    const strict = T.map((r) => r.map((t) => !!STRICT_YES[t]));
    const generous = T.map((r) => r.map((t) => !!GENEROUS_YES[t]));
    const bs = countByBacktracking(strict), bg = countByBacktracking(generous);
    const rs = exactPermanent(strict), rg = exactPermanent(generous);
    if (bs.count !== 1) fail(where, `R2: ${bs.count} arrangements over L+S+O (backtracking)`);
    if (rs !== 1) fail(where, `R2: Ryser count ${rs} over L+S+O`);
    if (bg.count !== 1) fail(where, `R3: ${bg.count} arrangements over L+S+O+n (backtracking)`);
    if (rg !== 1) fail(where, `R3: Ryser count ${rg} over L+S+O+n`);
    if (bs.count === 1) {
      if (bs.found.some((h, i) => h !== b.answer[i])) fail(where, 'the published answer is not the one arrangement');
    }
    b.answer.forEach((h, i) => { if (!FAIR[T[i][h]]) fail(where, `R4: answer pair ${W[i]} x ${H[h]} is ${T[i][h]}, not L or S`); });
    // the certificate: for every answer pair, every other word that fits its heading comes earlier
    const pos = new Map(b.proofOrder.map((w, i) => [w, i]));
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (j !== i && strict[j][b.answer[i]] && !(pos.get(j) < pos.get(i))) fail(where, `certificate broken: ${W[j]} fits ${H[b.answer[i]]} but comes after ${W[i]}`);
    const bf = b.bruteForce;
    if (!bf || bf.orders !== 3628800 || bf.strict !== 1 || bf.generous !== 1) fail(where, `no brute-force record of 3,628,800 orders with 1 and 1 (${JSON.stringify(bf)})`);
    if (b.hash !== hashOf(b)) fail(where, 'board hash does not match its content');
    if (b.textVersion !== textOf(b)) fail(where, 'textVersion does not match its text');
    // item 5: grammar
    const s1 = [];
    const cur = [];
    const go = (i, used) => { if (i === 5) { s1.push(cur.slice()); return; } for (let s = 0; s < 5; s++) if (!(used & (1 << s)) && FAIR[T[i][s]]) { cur[i] = s; go(i + 1, used | (1 << s)); } };
    go(0, 0);
    if (!s1.length) fail(where, 'R5: section 1 has no honest (L+S) filling');
    else {
      const weight = (x) => x.reduce((a, s, i) => a + (T[i][s] === 'L' && fam[s] !== 'computed' ? 2 : 1), 0);
      const top = Math.max(...s1.map(weight));
      const moves = s1.filter((x) => weight(x) === top).map((x) => x.filter((s, i) => s !== b.answer[i]).length);
      if (Math.min(...moves) < 2) fail(where, 'R6: a most-literal section-1 filling needs fewer than 2 moves');
      const rec = b.stats && b.stats.literalMoves;
      if (!Array.isArray(rec) || rec.length !== moves.length || rec.some((m, i) => m !== moves[i])) fail(where, `recorded literal moves ${JSON.stringify(rec)} differ from ${JSON.stringify(moves)}`);
      if (b.stats && b.stats.s1Fillings !== s1.length) fail(where, `recorded section-1 fillings ${b.stats.s1Fillings} differ from ${s1.length}`);
    }
    const deg = strict.map((r) => r.filter(Boolean).length);
    const takers = H.map((_, j) => strict.filter((r) => r[j]).length);
    const mean = deg.reduce((a, x) => a + x, 0) / 10;
    if (deg.some((d) => d < 1 || d > 4)) fail(where, `R7: word degrees ${deg.join(' ')}`);
    if (takers.some((t) => t > 4)) fail(where, `R7: heading takers ${takers.join(' ')}`);
    if (mean < 1.9 - 1e-9 || mean > 2.6 + 1e-9) fail(where, `R7: mean degree ${mean}`);
    const nComp = fam.filter((f) => f === 'computed').length, nJoke = fam.filter((f) => f === 'joke').length, nVerb = fam.filter((f) => f === 'verb').length;
    if (nComp > CAPS.maxComputed) fail(where, 'R8: more than one computed heading');
    if (nJoke > CAPS.maxJokes) fail(where, 'more than two joke headings');
    if (nVerb > CAPS.maxVerbs) fail(where, 'more than one verb heading');
    // the recorded forced-move path really is forced, and lands on the answer
    if (Array.isArray(b.path)) {
      const wl = new Set(W.keys()), hl = new Set(H.keys());
      for (const round of b.path) {
        for (const [w, h, by] of round) {
          const open = [...hl].filter((x) => strict[w][x]);
          const tk = [...wl].filter((x) => strict[x][h]);
          const forced = by === 'word' ? open.length === 1 && open[0] === h : tk.length === 1 && tk[0] === w;
          if (!forced) fail(where, `path step ${W[w]} -> ${H[h]} (${by}) is not forced`);
          if (b.answer[w] !== h) fail(where, `path step ${W[w]} -> ${H[h]} contradicts the answer`);
        }
        for (const [w, h] of round) { wl.delete(w); hl.delete(h); }
      }
      if (wl.size) fail(where, 'the forced-move path does not place every word');
    } else fail(where, 'path missing');
    // hints: the nudge is an S answer pair; exclusive pin sentences only where every other word is N
    const sAnswer = [];
    for (let i = 0; i < 10; i++) if (T[i][b.answer[i]] === 'S') sAnswer.push(i);
    if (sAnswer.length ? !sAnswer.includes(b.nudge) : b.nudge !== null) fail(where, 'nudge must name an S answer pair (or be null when there is none)');
    if (!Array.isArray(b.exclusive) || b.exclusive.length !== 10) fail(where, 'exclusive flags missing');
    else for (let j = 0; j < 10; j++) {
      const owner = b.answer.indexOf(j);
      const excl = W.every((_, i) => i === owner || T[i][j] === 'N');
      if (!!b.exclusive[j] !== excl) fail(where, `exclusive flag for ${H[j]} should be ${excl}`);
    }
    // facts the calendar needs
    const hasLitElsewhere = (i) => H.some((h, j) => j !== b.answer[i] && T[i][j] === 'L' && fam[j] !== 'computed');
    const aha = sAnswer.filter(hasLitElsewhere).length;
    const cj = fam.indexOf('computed');
    const leftover = cj >= 0 && H.some((_, j) => j !== cj && strict[b.answer.indexOf(cj)][j]);
    derived.set(b, {
      W, H, fam, aha, open: s1.length >= 2, r6ok: true, maxTakers: Math.max(...takers),
      sPairs: sAnswer.filter(hasLitElsewhere).map((i) => `${W[i]}:${(key.cells[H[b.answer[i]]][W[i]][1]) || '*'}`),
      jokePairs: b.answer.map((h, i) => (fam[h] === 'joke' ? `${H[h]}>${W[i]}` : null)).filter(Boolean),
      computed: cj >= 0 ? H[cj] : null, leftover, verb: nVerb > 0, closed: H.some((h) => key.headings[h].closedSet),
    });
    // full mode: every one of 10! orders under both graphs
    if (mode === 'full') {
      const fs1 = bruteForce(strict), fg = bruteForce(generous);
      if (fs1.visited !== 3628800 || fg.visited !== 3628800) fail(where, 'brute force did not visit 3,628,800 orders');
      if (fs1.count !== 1 || fg.count !== 1) fail(where, `brute force: ${fs1.count} strict and ${fg.count} generous arrangements`);
      if (bf && (bf.strict !== fs1.count || bf.generous !== fg.count)) fail(where, 'brute-force record differs from a fresh run');
    }
  }
  // computed headings: recompute every vocabulary cell from the rule and its misreadings
  for (const [hid, h] of Object.entries(key.headings)) {
    if (h.family !== 'computed') continue;
    const rule = COMPUTED[h.rule];
    if (!rule) { fail('key', `computed heading ${hid} has unknown rule ${h.rule}`); continue; }
    for (const wid of key.coverage.words) {
      const text = key.words[wid].text;
      const want = rule.yes(text) ? 'L' : rule.misread.some((m) => m(text)) ? 'n' : 'N';
      const got = tierOf(wid, hid);
      if (got !== want) fail('key', `computed heading ${hid} on ${text}: key says ${got}, rule says ${want}`);
    }
  }

  // ---- item 6: fits (R10)
  let widths = null;
  try { widths = makeWidths(readJson(path.join(HERE, 'fit', 'advance-tables.json')).tables, readJson(path.join(HERE, 'fit', 'layout.json'))); } catch (e) { fail('fit', `tables unreadable (${e.message})`); }
  if (widths) for (const { where, board: b } of all) {
    if (!boardOk(b)) continue;
    for (const h of b.headings) if (!widths.labelOk(h.label)) fail(where, `R10: label "${h.label}" does not fit its lines`);
    for (const w of b.words) if (!widths.wordOk(w.text)) fail(where, `R10: word "${w.text}" does not fit its well or tray cell`);
  }

  // ---- item 7: calendar
  const nDays = scheduled.length;
  const run = [...scheduled.map((s) => s.board), ...reserveBoards.map((r) => r.board)]; // reserve continues the run
  const facts = run.map((b) => derived.get(b));
  const bandOk = (b, f, band) => {
    const p = b.players;
    if (!p || !p.literal || !p.noaha || !f) return false;
    const L4 = p.literal.w4, N1 = p.noaha.w1, N4 = p.noaha.w4;
    if (band === 'mon') return N1 >= 0.9 && L4 >= 0.9 && f.aha <= 1;
    if (band === 'tue') return f.open && L4 >= 0.9 && f.aha >= 1 && f.aha <= 2;
    if (band === 'wed') return f.open && L4 >= 0.6 && L4 < 0.9 && f.aha >= 1 && f.aha <= 2;
    if (band === 'fri') return f.open && L4 <= 0.6 && N4 <= 0.9 && f.aha >= 2 && f.aha <= 3;
    return false;
  };
  run.forEach((b, d) => {
    const f = facts[d];
    if (!f) return;
    const where = d < nDays ? scheduled[d].date : `reserve ${reserveBoards[d - nDays].id}`;
    let want;
    if (d >= nDays) want = CAPS.reserveBands;
    else if (d < CAPS.firstFortnight) want = [d % 7 === 0 ? 'mon' : 'tue'];
    else want = [WEEKDAY_BANDS[weekdayOf(scheduled[d].date)]];
    if (!want.some((band) => bandOk(b, f, band))) fail(where, `does not meet the ${want.join('/')} band (players ${JSON.stringify(b.players && { lit4: b.players.literal.w4, noaha1: b.players.noaha.w1, noaha4: b.players.noaha.w4 })}, aha ${f.aha}, open ${f.open})`);
    if (d < nDays && b.band !== want[0]) fail(where, `band label ${b.band} should be ${want[0]}`);
    if (d < nDays && !!b.harder !== (weekdayOf(scheduled[d].date) === 4 && bandOk(b, f, 'fri'))) fail(where, '"harder" must appear exactly on Fridays that meet the Friday band');
  });
  const last = new Map(), uses = new Map();
  const gapFail = (k, d, gap, what) => { const prev = last.get(k); if (prev !== undefined && d - prev < gap) fail(d < nDays ? scheduled[d].date : `reserve ${reserveBoards[d - nDays].id}`, `${what} repeats after ${d - prev} days (minimum ${gap})`); last.set(k, d); };
  facts.forEach((f, d) => {
    if (!f) return;
    for (const w of f.W) {
      gapFail(`w|${w}`, d, key.words[w].engine ? CAPS.engineGap : CAPS.wordGap, `word ${w}`);
      const u = (uses.get(w) || []).filter((e) => d - e < 365); u.push(d); uses.set(w, u);
      if (u.length > CAPS.wordMaxIn365) fail(d < nDays ? scheduled[d].date : 'reserve', `word ${w} used ${u.length} times in 365 days`);
    }
    for (const p of f.sPairs) gapFail(`s|${p}`, d, CAPS.ahaGap, `aha ${p}`);
    for (const p of f.jokePairs) gapFail(`j|${p}`, d, CAPS.jokePairGap, `joke pair ${p}`);
    f.H.forEach((h, j) => {
      const fm = f.fam[j];
      if (fm === 'computed') gapFail(`c|${h}`, d, CAPS.computedSameGap, `computed heading ${h}`);
      else if (CAPS.spacing[fm]) gapFail(`h|${h}`, d, CAPS.spacing[fm], `${fm} heading ${h}`);
    });
  });
  for (let wk = 0; wk * 7 < run.length; wk++) {
    const days = facts.slice(wk * 7, wk * 7 + 7).filter(Boolean);
    const count = (p) => days.filter((f) => (p === 'computed' ? !!f.computed : f[p])).length;
    for (const [p, cap] of Object.entries(CAPS.weekly)) if (count(p) > cap) fail(`week ${wk + 1}`, `${count(p)} boards with ${p} (cap ${cap})`);
  }
  for (let d = 1; d < facts.length; d++) if (facts[d] && facts[d - 1] && facts[d].computed && facts[d - 1].computed) fail(d < nDays ? scheduled[d].date : 'reserve', 'computed headings on two days running');
  // the joke-heading taker rule: every joke heading used has 3+ fair takers in the vocabulary
  const jokeUsed = new Set(); facts.forEach((f) => f && f.H.forEach((h, j) => f.fam[j] === 'joke' && jokeUsed.add(h)));
  for (const h of jokeUsed) {
    const n = key.coverage.words.filter((w) => FAIR[tierOf(w, h)]).length;
    if (n < CAPS.jokeTakers) fail('key', `joke heading ${h} has ${n} fair takers in the vocabulary (needs ${CAPS.jokeTakers})`);
  }
  // no reserve board duplicates a scheduled board
  const schedHashes = new Set(scheduled.map((s) => s.board.hash));
  if (schedHashes.size !== scheduled.length) fail('schedule', 'two scheduled days share a board');
  for (const r of reserveBoards) if (schedHashes.has(r.board.hash)) fail(`reserve ${r.id}`, 'duplicates a scheduled board');

  // ---- item 8: frozen days (clock-free)
  let ledger = null;
  try { ledger = readJson(path.join(boardsDir, 'ledger.json')); } catch (e) { fail('ledger.json', `unreadable (${e.message})`); }
  if (ledger) {
    if (!!ledger.pilot !== !!index.pilot) fail('ledger.json', 'pilot flag differs from index.json');
    for (const s of scheduled) {
      const h = ledger.days && ledger.days[s.date];
      if (!h) fail(s.date, 'no ledger entry');
      else if (h !== s.board.hash) fail(s.date, 'board differs from its ledger entry (a published day changed)');
    }
    for (const date of Object.keys(ledger.days || {})) if (!scheduled.some((s) => s.date === date)) fail(date, 'ledger entry has no board (a published day was removed)');
    for (const r of reserveBoards) {
      const e = ledger.reserve && ledger.reserve[r.id];
      if (!e) fail(`reserve ${r.id}`, 'no ledger entry');
      else if (e !== r.board.hash) fail(`reserve ${r.id}`, 'differs from its ledger entry (the reserve is append-only)');
    }
    for (const id of Object.keys(ledger.reserve || {})) if (!reserveBoards.some((r) => r.id === id)) fail(`reserve ${id}`, 'ledger entry has no board (the reserve is append-only)');
  }
  const batches = new Map((index.batches || []).map((b) => [b.id, b]));
  for (const s of scheduled) {
    const batch = batches.get(s.board.batch);
    if (!batch) { fail(s.date, `unknown batch ${s.board.batch}`); continue; }
    if (dayNumber(s.date) < dayNumber(batch.createdOn) + 2) fail(s.date, `scheduled earlier than its batch's createdOn (${batch.createdOn}) + 2 days`);
  }
  let prevAdded = -Infinity;
  for (const r of reserveBoards) {
    const batch = batches.get(r.board.batch);
    if (!batch) { fail(`reserve ${r.id}`, `unknown batch ${r.board.batch}`); continue; }
    if (r.board.addedOn !== batch.createdOn) fail(`reserve ${r.id}`, 'addedOn must equal its batch createdOn');
    if (dayNumber(r.board.addedOn) < prevAdded) fail(`reserve ${r.id}`, 'reserve entries must be in addedOn order (append-only)');
    prevAdded = dayNumber(r.board.addedOn);
  }
  // errata (7.9): { schema, entries: { date: { alternates: [{ Word: Heading } x10], note } } }. Each alternate is a
  // full arrangement of that date's board, by text, other than the answer; the date is a scheduled day or a day
  // served from the reserve (picked as the client picks it: fnv1a32(date) mod the boards added 2+ days before).
  try {
    const er = readJson(path.join(boardsDir, 'errata.json'));
    if (er.schema !== 1) fail('errata.json', 'schema is not 1');
    const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
    for (const [date, entry] of Object.entries(er.entries || {})) {
      const dn = dayNumber(date);
      if (!Number.isFinite(dn) || dn < dayNumber(launch)) { fail('errata.json', `${date} is not a board date`); continue; }
      const s = scheduled.find((x) => x.date === date);
      let board = s && s.board;
      if (!board) {
        const live = (reserve.boards || []).filter((r) => dayNumber(r.addedOn) <= dn - 2);
        board = live.length ? live[fnv(date) % live.length] : null;
      }
      if (!board) { fail('errata.json', `${date} has no board`); continue; }
      if (!entry || !Array.isArray(entry.alternates) || !entry.alternates.length || typeof entry.note !== 'string' || !entry.note.trim()) { fail('errata.json', `${date}: needs alternates and a note`); continue; }
      const texts = board.words.map((w) => w.text), labels = board.headings.map((h) => h.label);
      for (const alt of entry.alternates) {
        const keys = alt && typeof alt === 'object' ? Object.keys(alt) : [];
        const ok = keys.length === 10 && texts.every((t) => keys.includes(t)) && new Set(keys.map((k) => alt[k])).size === 10 && keys.every((k) => labels.includes(alt[k]));
        if (!ok) { fail('errata.json', `${date}: an alternate must place each of the 10 words under its own heading, by text`); continue; }
        if (texts.every((t, i) => alt[t] === labels[board.answer[i]])) fail('errata.json', `${date}: an alternate repeats the answer`);
      }
    }
  } catch (e) { fail('errata.json', `unreadable (${e.message})`); }

  // ---- item 9: text
  const pictographic = /\p{Extended_Pictographic}|️/u;
  for (const s of strings) {
    if (typeof s !== 'string') continue;
    if (pictographic.test(s)) fail('text', `emoji in "${s}"`);
    if (s.includes('—')) fail('text', `em dash in "${s}"`);
  }
  const blockedBy = loadBlocklist();
  if (blockedBy) { for (const s of strings) if (typeof s === 'string' && blockedBy(s)) fail('text', `blocklisted: "${s}"`); }
  else notes.push('blocklist: functions/api/renames.ts not reachable from this checkout; relying on the key\'s recorded blocklist pass');
  if (!blockedBy && !(key.blocklist && key.blocklist.checked)) fail('key', 'no blocklist pass recorded');

  // ---- release
  if (index.pilot) notes.push('PILOT DATA: model-in-the-loop judgments, not for launch');
  if (release) {
    if (index.pilot || key.pilot) fail('release', 'pilot data cannot be released');
    for (const h of Object.values(key.headings)) if (h.status !== 'approved' && run.some((b) => b && b.headings && b.headings.some((x) => x.label === h.label))) fail('release', `heading "${h.label}" is not approved`);
  }
  return { failures, notes, counts: { scheduled: scheduled.length, reserve: reserveBoards.length } };
}

function loadBlocklist() {
  const src = path.join(GAME, '..', '..', 'functions', 'api', 'renames.ts');
  if (!fs.existsSync(src)) return null;
  let ts;
  try { ts = require('typescript'); } catch { return null; }
  const out = ts.transpileModule(fs.readFileSync(src, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const vm = require('node:vm');
  const ctx = { exports: {}, Response: globalThis.Response, Request: globalThis.Request, URL, crypto: globalThis.crypto };
  vm.runInNewContext(out, ctx);
  return typeof ctx.exports.isBlocked === 'function' ? ctx.exports.isBlocked : null;
}

module.exports = { verify };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const mode = args.includes('--schema') ? 'schema' : args.includes('--full') ? 'full' : 'normal';
  const t0 = Date.now();
  const res = verify({ mode, release: args.includes('--release'), boardsDir: opt('--boards'), keyPath: opt('--key') });
  const secs = ((Date.now() - t0) / 1000).toFixed(2);
  for (const n of res.notes) if (!args.includes('--quiet')) console.log(`note: ${n}`);
  if (res.failures.length) {
    for (const f of res.failures.slice(0, 200)) console.log(`FAIL ${f}`);
    console.log(`Match Five Daily ${mode} check: ${res.failures.length} failure(s) in ${secs} s`);
    process.exit(1);
  }
  console.log(`Match Five Daily ${mode} check: ${res.counts.scheduled} scheduled + ${res.counts.reserve} reserve boards pass in ${secs} s`);
}
