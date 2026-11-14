// review/build-review.mjs - Josh's review pack for the pilot (dossier v2 9.5): exactly what he must do, with time
// estimates. Writes <out>/JOSH-REVIEW.md and <out>/review.html (a self-contained form: one-key rulings, saved in his
// browser, exported with one Copy button). review/apply-review.mjs writes his exported decisions back into content/.
//   node scripts/daily/review/build-review.mjs [--out D:/Github/match-five-daily-design/review]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { missLines, secondLives, pinLine } from '../lib/misslines.mjs';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const GAME = join(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', 'D:/Github/match-five-daily-design/review');
const key = JSON.parse(readFileSync(join(HERE, 'data', 'key.json'), 'utf8'));
const H = JSON.parse(readFileSync(join(HERE, 'content', 'headings.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(HERE, 'content', 'golden-set.json'), 'utf8'));
const BOARDS = join(GAME, 'public', 'daily', 'boards');
const index = JSON.parse(readFileSync(join(BOARDS, 'index.json'), 'utf8'));
const scheduled = index.months.flatMap((m) => Object.values(JSON.parse(readFileSync(join(BOARDS, `${m}.json`), 'utf8')).days));
const fair = (h) => Object.entries(key.cells[h] || {}).filter(([, c]) => c[0] === 'L' || c[0] === 'S');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// ---------- task 2: joke headings
const jokes = H.jokes.map((h) => {
  const f = fair(h.id);
  return { id: h.id, label: h.label, status: h.status || 'draft', note: h.note || '', fair: f.length, takers: f.slice(0, 8).map(([w, c]) => key.words[w].text + (c[0] === 'S' && c[2] ? ` (${c[2]})` : '')), usable: (h.status || 'draft') === 'draft' && f.length >= 3 && key.headings[h.id] };
});
// ---------- task 3: the verb heading's word list
const VIOLENT = new Set(['club', 'hammer', 'nail', 'punch', 'mug', 'slug', 'sock', 'belt', 'box', 'clock', 'elbow', 'bean', 'birch', 'knife', 'spear', 'stone', 'knee', 'whip', 'saw', 'plug', 'lash', 'ram', 'wind', 'rock', 'pound', 'skunk', 'shell', 'paddle', 'cat']);
const verbRow = key.cells['you-can-someone'] || {};
const verbs = Object.entries(verbRow).filter(([, c]) => c[0] === 'L' || c[0] === 'S').map(([w, c]) => ({ word: w, text: key.words[w].text, tier: c[0], gloss: c[2] || `to ${key.words[w].text.toLowerCase()} someone`, violent: VIOLENT.has(w) }))
  .sort((a, b) => a.text.localeCompare(b.text));
// ---------- task 4: ten sample boards: 2 Monday, 3 Tue/Sun, 3 midweek, 2 Friday
const pick = (band, n) => scheduled.filter((b) => b.band === band).sort((a, b) => (b.stats.sPairs - a.stats.sPairs) || a.number - b.number).slice(0, n);
const samples = [...pick('mon', 2), ...pick('tue', 3), ...pick('wed', 3), ...pick('fri', 2)].sort((a, b) => a.number - b.number);
// the most literal wrong arrangement a player could check first: most L pairs, then most S pairs
function literalGuess(b) {
  const T = Array.from({ length: 10 }, () => Array(10).fill('N'));
  for (const c of b.cells) T[c[0]][c[1]] = c[2];
  const sc = (t) => (t === 'L' ? 3 : t === 'S' ? 2 : t === 'O' ? 1 : 0);
  let best = null, bestScore = -1;
  const cur = [], used = new Array(10).fill(false);
  const go = (i, s) => {
    if (s + (10 - i) * 3 <= bestScore) return;
    if (i === 10) { if (cur.some((h, w) => h !== b.answer[w]) && s > bestScore) { bestScore = s; best = cur.slice(); } return; }
    const order = [...Array(10).keys()].sort((x, y) => sc(T[i][y]) - sc(T[i][x]));
    for (const h of order) if (!used[h]) { used[h] = true; cur[i] = h; go(i + 1, s + sc(T[i][h])); used[h] = false; }
  };
  go(0, 0);
  return best;
}
const boardCards = samples.map((b) => {
  const guess = literalGuess(b);
  const right = [0, 1].map((half) => guess.filter((h, w) => h === b.answer[w] && (half === 0 ? h < 5 : h >= 5)).length);
  const total = right[0] + right[1];
  const share = total === 10 ? `Match Five Daily #${b.number}\nSolved on check 1 of 4.\nhttps://burgerfun.ca/match-five/daily/${b.date}/` : `Match Five Daily #${b.number}\nSolved on check 2 of 4. Right per check: ${total}, 10\nhttps://burgerfun.ca/match-five/daily/${b.date}/`;
  const nudge = b.nudge === null ? null : `One of today's words has a second life: ${b.words[b.nudge].text}.`;
  // section 1 as most players fill it: the most literal honest filling of the top five
  const T = Array.from({ length: 10 }, () => Array(10).fill('N'));
  for (const c of b.cells) T[c[0]][c[1]] = c[2];
  let s1 = null, s1w = -1;
  const perm = (arr, k = 0) => { if (k === 5) { const ok = arr.every((h, w) => T[w][h] === 'L' || T[w][h] === 'S'); const wt = arr.reduce((a, h, w) => a + (T[w][h] === 'L' && b.headings[h].family !== 'computed' ? 2 : 1), 0); if (ok && wt > s1w) { s1w = wt; s1 = arr.slice(); } return; } for (let i = k; i < 5; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; } };
  perm([0, 1, 2, 3, 4]);
  return { b, guess, right, share, nudge, pin: pinLine(b, []), lives: secondLives(b), misses: missLines(b, guess), s1 };
});

const CAT = { 'second-sense': 'a second sense', joke: 'a joke heading', obscure: 'true but obscure?', arguable: 'arguable', 'soft-no': 'a soft no', person: 'a person sense', regional: 'a regional sense', brand: 'a brand reading', list: 'a list anchor', colour: 'a colour name', recall: 'found by the recall pass', obvious: 'obvious (a control)' };
const catName = (c) => CAT[c] || c;
const goldenCount = golden.cells.length, jokesToReview = jokes.filter((j) => j.status === 'draft' || j.status === 'r10');
const MIN = { golden: Math.round(goldenCount * 15 / 60), jokes: Math.round(jokesToReview.length * 1.2), verbs: Math.round(verbs.length * 8 / 60), boards: 10, approvals: 3 };
const total = Object.values(MIN).reduce((a, b) => a + b, 0);

// ---------- markdown
const md = [];
md.push('# Match Five Daily: your review of the pilot', '');
md.push(`Built ${new Date().toISOString().slice(0, 10)} from key \`${key.version}\`. **Everything here is pilot data.** Every tier was judged by the M1 lane (Claude, a model in the loop) standing in for the dossier 7.3 judge, conservatively: anything a reasonable player could argue is A (never on a board) or n (soft no). Nothing has been reviewed by you, and no paid API was called.`, '');
md.push('Open **review.html** (next to this file) in a browser: it is the same list as a form. Your choices save in the browser as you go; **Copy my decisions** puts them on the clipboard as one block, and `node scripts/daily/review/apply-review.mjs <file>` writes them into the content files.', '');
md.push('## What you need to do', '', '| # | Task | Items | Estimated time |', '|---|---|---|---|');
md.push(`| 1 | Rule on the golden set: y (a fair yes), n (no), a (arguable), o (true but obscure) | ${goldenCount} cells | about ${MIN.golden} min |`);
md.push(`| 2 | Joke headings: keep, cut, or rewrite (type the new label) | ${jokesToReview.length} drafts | about ${MIN.jokes} min |`);
md.push(`| 3 | Verb heading "You can ___ someone": keep or cut each word (decision 9.14, the tone call) | ${verbs.length} words | about ${MIN.verbs} min |`);
md.push(`| 4 | Ten sample boards, as players see them: ok, or flag with a note | 10 boards | about ${MIN.boards} min |`);
md.push(`| 5 | Two yes/no approvals (below) | 2 | about ${MIN.approvals} min |`);
md.push(`| | **Total** | | **about ${Math.round(total / 5) * 5} min** |`, '');
md.push('Cutting a verb for tone keeps it true in the key (a player can still argue "you can club someone"), so it becomes O: counted for uniqueness, never the answer. Cutting a joke heading removes it from the pool.', '');
md.push('### 5. Approvals needed before the next step', '');
md.push('- **Download Open English WordNet** (CC BY 4.0) to replace the local Princeton WordNet 3.0 copy used as the pilot\'s recall aid. File: a release from github.com/globalwordnet/english-wordnet in the classic WordNet database format, which the reader (`scripts/daily/wordnet/wn.mjs`) parses; I have not checked the size of the current release. Reply yes or no.');
md.push('- **Run the judge** (dossier 7.3) once you have ruled on the golden set: `npm run daily:judge -- --live --vendor clef --scope golden --budget-usd 1`, then `node scripts/daily/judge/fit.mjs <the run file it names>` (fits the thresholds to your rulings and stops everything if the judge misses more than 15% of the obvious cells), then `--scope all --budget-usd 3`; the plan estimates about $2.59 on Clef-flash for a full pass and $1.21 for the Jev cross-check. Reply yes or no, and the spend cap you want.', '');
md.push('### After this (not now)', '', 'Once the judge has run, the rest of dossier 9.5: approving glosses and negative predicates (about 1 h), the judge and recall triage queue (about 1.5 h), and the 120 launch boards at 45-60 s each (1.5-2 h).', '');
md.push('### For information: calls I made in the pilot (no action unless you disagree)', '');
md.push('- **Two editorial board rules** found by my cold-solve pass over all 120 pilot boards, now in the generator and the independent test: **E1**, no word is named by a heading on its own board ("Screen" under "Has a screen", "Coin" under "Coin"); **E2**, no two headings share a base predicate ("Has a trunk" beside "Has a trunk, no branches", where every taker of one fits the other).');
md.push('- **Regional senses** that one side of the Atlantic lacks are O (true, counted, never the answer): Stone the weight, Squash the drink, Tube, Patience, Rocket the salad, Catapult the slingshot. The car pairs the dossier accepts (Boot, Bonnet beside Trunk, Hood) and Trainer the shoe stay S.');
md.push('- **Phrasal verbs** ("to doll someone up", "to cart someone off", "to whisk someone away") are soft noes (n) for "You can ___ someone": some would say yes, so no answer depends on them.');
md.push('- **Heading pools** must be about 30% larger than the 7.2 estimates to meet the 7.6 spacing caps: the pilot has 65 anchors, 61 usable properties and 60 usable jokes, which sustains about 1.3 jokes per board. Two jokes per board would need about 100 jokes with 3 or more fair takers each.', '');
md.push('## 1. Golden set', '', 'Grouped by why each cell is hard. `pilot` is my judgment, for comparison only: rule what you believe.', '');
const byCat = {};
for (const c of golden.cells) (byCat[c.category] ||= []).push(c);
for (const [cat, cells] of Object.entries(byCat)) {
  md.push(`### ${catName(cat)} (${cells.length})`, '', '| Word | Heading | Pilot | Pilot note | Your ruling |', '|---|---|---|---|---|');
  for (const c of cells) md.push(`| ${c.wordText} | ${c.label} | ${c.pilot} | ${c.pilotText ? c.pilotText.replace(/\|/g, '/') : ''} | ${c.ruling || ''} |`);
  md.push('');
}
md.push('## 2. Joke headings', '', 'Fair takers are vocabulary words that fit as L or S. A joke needs 3 or more (7.2) and must fit two lines on a 360 px phone (R10). Drafts marked R10 need a rewrite that keeps one reading.', '', '| Heading | Status | Fair takers | Examples | Note |', '|---|---|---|---|---|');
for (const j of jokes) md.push(`| ${j.label} | ${j.status === 'draft' ? (j.fair >= 3 ? 'draft' : 'draft, under 3 takers') : j.status} | ${j.fair} | ${j.takers.join(', ')} | ${j.note.replace(/\|/g, '/')} |`);
md.push('', '## 3. Verb heading word list', '', 'Words that can be the answer to "You can ___ someone" (L or S). Marked words are the violent ones decision 9.14 is about.', '', '| Word | Tier | As a verb | Violent |', '|---|---|---|---|');
for (const v of verbs) md.push(`| ${v.text} | ${v.tier} | ${v.gloss} | ${v.violent ? 'yes' : ''} |`);
md.push('', '## 4. Ten sample boards', '', 'Each shows the top five with its words, the bottom five that arrives, the answer, the second lives on the card, the hint lines, the most literal wrong first check with its reveal, and the share text.', '');
for (const { b, guess, right, share, nudge, pin, lives, misses } of boardCards) {
  md.push(`### #${b.number} · ${pretty(b.date)} · ${b.band}${b.harder ? ' · harder' : ''}`, '');
  md.push(`Top five: **${b.headings.slice(0, 5).map((h) => h.label).join(' · ')}**  `, `Words: ${b.words.slice(0, 5).map((w) => w.text).join(', ')}  `);
  md.push(`Bottom five: **${b.headings.slice(5).map((h) => h.label).join(' · ')}**  `, `More words: ${b.words.slice(5).map((w) => w.text).join(', ')}`, '');
  md.push(`Answer: ${b.answer.map((h, w) => `${b.words[w].text} under ${b.headings[h].label}`).join('; ')}.`, '');
  md.push(`Second lives: ${lives.length ? lives.map((l) => `${l.word} (${l.heading}: ${l.gloss})`).join('; ') : 'none'}.  `, `Simulated players: literal player solves within 4 checks in ${Math.round(b.players.literal.w4 * 100)}%; no-aha player on check 1 in ${Math.round(b.players.noaha.w1 * 100)}%, within 4 in ${Math.round(b.players.noaha.w4 * 100)}%.  `);
  md.push(`Hints: ${nudge || '(no nudge: no second life in the answer)'} / ${pin}`, '');
  md.push(`A literal first check (${right[0]} + ${right[1]} = ${right[0] + right[1]} right) would reveal:`, '', ...misses.map((m) => `- ${m}`), '', '```', share, '```', '');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'JOSH-REVIEW.md'), md.join('\n') + '\n');

// ---------- html
const data = { builtOn: new Date().toISOString().slice(0, 10), keyVersion: key.version, minutes: MIN, golden: golden.cells.map((c) => ({ id: `${c.word}|${c.heading}`, word: c.wordText, label: c.label, category: catName(c.category), pilot: c.pilot, note: c.pilotText })), jokes, verbs, boards: boardCards.map(({ b, right, share, nudge, pin, lives, misses, s1 }) => ({ date: b.date, number: b.number, day: pretty(b.date), band: b.band, harder: b.harder, words: b.words.map((w) => w.text), headings: b.headings.map((h) => h.label), answer: b.answer, s1, lives, players: b.players, nudge, pin, misses, right, share, shot: existsSync(join(OUT, 'shots', `${b.date}.png`)) ? `shots/${b.date}.png` : null })) };
// the dates the screenshot script captures in the daily UI (D:/Github/reengage-tools/lanes/m5-m1/shots.mjs --samples)
writeFileSync(join(OUT, 'samples.json'), `${JSON.stringify(samples.map((b) => b.date))}\n`);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Match Five review</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
<style>
:root { --bg: #ffffff; --ink: #1a1a1a; --soft: #5f5f5f; --card: #f5f5f5; --edge: #8a8a8a; --tile: #2d2d2d; --navy: #1a237e; --line: #e2e2e2; --pick: #e8eaf6; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #121212; --ink: #ececec; --soft: #a8a8a8; --card: #1f1f1f; --edge: #6d6d6d; --tile: #3a3a3a; --navy: #9fa8da; --line: #2c2c2c; --pick: #262a4a; } }
:root[data-theme="dark"] { --bg: #121212; --ink: #ececec; --soft: #a8a8a8; --card: #1f1f1f; --edge: #6d6d6d; --tile: #3a3a3a; --navy: #9fa8da; --line: #2c2c2c; --pick: #262a4a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 15px/1.45 Roboto, system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 96px; }
h1, h2, h3 { font-family: Outfit, system-ui, sans-serif; font-weight: 700; line-height: 1.2; }
h1 { font-size: 28px; margin: 0 0 8px; } h2 { font-size: 21px; margin: 40px 0 8px; } h3 { font-size: 16px; margin: 20px 0 6px; }
p, li { color: var(--ink); } .soft { color: var(--soft); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 500; color: var(--soft); font-size: 13px; }
.tasks td:last-child { white-space: nowrap; }
.rule button, .choice button { font: 500 13px Roboto, sans-serif; min-width: 34px; height: 30px; margin: 0 2px 2px 0; border: 1px solid var(--edge); background: var(--bg); color: var(--ink); border-radius: 6px; cursor: pointer; }
.rule button[aria-pressed="true"], .choice button[aria-pressed="true"] { background: var(--navy); color: var(--bg); border-color: var(--navy); }
tr.done { background: var(--pick); }
input[type=text] { font: 400 14px Roboto, sans-serif; width: 100%; padding: 4px 6px; border: 1px solid var(--edge); border-radius: 6px; background: var(--bg); color: var(--ink); }
.bar { position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--line); padding: 10px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; }
.bar button { font: 600 15px Outfit, sans-serif; background: var(--navy); color: var(--bg); border: 0; border-radius: 8px; height: 44px; padding: 0 18px; cursor: pointer; }
.boards { display: grid; gap: 28px; }
.board { border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.phones { display: flex; gap: 16px; flex-wrap: wrap; }
.phone { width: 360px; max-width: 100%; border: 1px solid var(--edge); border-radius: 18px; padding: 10px 16px 14px; background: var(--bg); }
.phone header { text-align: center; font: 600 16px Outfit, sans-serif; margin: 4px 0 8px; } .phone header small { display: block; font: 400 13px Roboto, sans-serif; color: var(--soft); }
.sec { font: 500 13px/20px Roboto, sans-serif; color: var(--soft); }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px; }
.card { border: 1px solid var(--edge); border-radius: 8px; background: var(--card); padding: 4px; min-height: 80px; display: flex; flex-direction: column; }
.card .lab { font: 600 15px/16px Outfit, sans-serif; text-align: center; min-height: 32px; overflow-wrap: anywhere; }
.card .well { margin-top: auto; height: 36px; border: 1px dashed var(--edge); border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.card.ph { border-style: dashed; background: transparent; }
.tile { font: 500 17px/30px Roboto, sans-serif; background: var(--tile); color: #fff; border-radius: 5px; padding: 0 6px; white-space: nowrap; }
.tray { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; border-top: 1px solid var(--line); padding-top: 8px; }
.tray span { font: 500 17px/44px Roboto, sans-serif; background: var(--tile); color: #fff; border-radius: 6px; text-align: center; overflow: hidden; white-space: nowrap; }
.tray span.empty { background: transparent; border: 1px dashed var(--edge); }
figure.shot { margin: 0; } figure.shot img { width: 360px; max-width: 100%; border: 1px solid var(--line); border-radius: 18px; display: block; } figcaption { font-size: 13px; margin-top: 6px; max-width: 360px; }
pre { background: var(--card); padding: 10px; border-radius: 8px; white-space: pre-wrap; font: 400 13px/1.5 ui-monospace, monospace; }
.tag { display: inline-block; font: 500 12px Roboto, sans-serif; border: 1px solid var(--edge); border-radius: 10px; padding: 0 8px; color: var(--soft); }
@media (max-width: 600px) { th:nth-child(4), td:nth-child(4) { display: none; } }
</style></head>
<body><main>
<h1>Match Five Daily: your review of the pilot</h1>
<p class="soft">Key ${esc(key.version)}, built ${esc(data.builtOn)}. Everything here is <strong>pilot data</strong>: every tier was judged by the M1 lane (Claude, a model in the loop) standing in for the judge, conservatively. Nothing has been reviewed by you, and no paid API was called.</p>
<table class="tasks"><thead><tr><th>#</th><th>Task</th><th>Items</th><th>Time</th></tr></thead><tbody>
<tr><td>1</td><td>Golden set: y, n, a or o on each cell (keys y n a o work on the focused row)</td><td>${goldenCount}</td><td>about ${MIN.golden} min</td></tr>
<tr><td>2</td><td>Joke headings: keep, cut, or rewrite</td><td>${jokesToReview.length}</td><td>about ${MIN.jokes} min</td></tr>
<tr><td>3</td><td>Verb heading word list: keep or cut</td><td>${verbs.length}</td><td>about ${MIN.verbs} min</td></tr>
<tr><td>4</td><td>Ten sample boards: ok or flag</td><td>10</td><td>about ${MIN.boards} min</td></tr>
<tr><td>5</td><td>Two approvals: the Open English WordNet download, and the judge run with its spend cap (see JOSH-REVIEW.md)</td><td>2</td><td>about ${MIN.approvals} min</td></tr>
</tbody></table>
<p class="soft">Your choices save in this browser as you go. When you are done, press <strong>Copy my decisions</strong> and save the text to a file; <code>node scripts/daily/review/apply-review.mjs &lt;file&gt;</code> writes them into the content files.</p>
<h2>1. Golden set</h2><p class="soft">y = a fair yes; n = no; a = arguable (a reasonable player could say either); o = true but obscure. "Pilot" is my judgment, for comparison.</p>
<table id="golden"><thead><tr><th>Word</th><th>Heading</th><th>Why it is here</th><th>Pilot</th><th>Your ruling</th></tr></thead><tbody></tbody></table>
<h2>2. Joke headings</h2><p class="soft">A joke needs three or more fair takers and must fit two lines on a 360 px phone. Rewrite: type the new label.</p>
<table id="jokes"><thead><tr><th>Heading</th><th>Fair takers</th><th>Examples</th><th>Note</th><th>Decision</th></tr></thead><tbody></tbody></table>
<h2>3. Verb heading: "You can ___ someone"</h2><p class="soft">Cutting a word keeps it true in the key but never the answer. Violent words are tagged.</p>
<table id="verbs"><thead><tr><th>Word</th><th>As a verb</th><th>Tier</th><th>Tone</th><th>Decision</th></tr></thead><tbody></tbody></table>
<h2>4. Ten sample boards</h2><p class="soft">Left: the board at load, captured from the daily UI where it renders. Right: a sketch of the moment the bottom five arrive. Below each: the answer, the second lives, the hints, what a literal wrong first check would reveal, and the share text.</p>
<div class="boards" id="boards"></div>
</main>
<div class="bar"><span id="progress" class="soft"></span><button id="copy" type="button">Copy my decisions</button></div>
<script>
const DATA = ${JSON.stringify(data)};
const KEY = 'm5-review-' + DATA.keyVersion;
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { state = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} progress(); };
const el = (t, a = {}, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) e.append(k); return e; };
function choiceRow(group, id, options, onPick) {
  const wrap = el('div', { class: group === 'golden' ? 'rule' : 'choice', role: 'group' });
  for (const o of options) {
    const b = el('button', { type: 'button', 'aria-pressed': String((state[group] || {})[id]?.v === o || (state[group] || {})[id] === o), onclick: () => { state[group] = state[group] || {}; const cur = state[group][id]; state[group][id] = group === 'jokes' ? { v: o, label: cur?.label || '' } : o; [...wrap.children].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick && onPick(o); save(); } }, o);
    wrap.append(b);
  }
  return wrap;
}
const gb = document.querySelector('#golden tbody');
for (const c of DATA.golden) {
  const tr = el('tr', { tabindex: '0' }, el('td', {}, c.word), el('td', {}, c.label), el('td', {}, c.category), el('td', {}, c.pilot + (c.note ? ' (' + c.note + ')' : '')), el('td', {}, choiceRow('golden', c.id, ['y', 'n', 'a', 'o'], () => tr.classList.add('done'))));
  if ((state.golden || {})[c.id]) tr.classList.add('done');
  tr.addEventListener('keydown', (e) => { if (['y', 'n', 'a', 'o'].includes(e.key)) { const btn = [...tr.querySelectorAll('button')].find((b) => b.textContent === e.key); btn.click(); const next = tr.nextElementSibling; if (next) next.focus(); e.preventDefault(); } });
  gb.append(tr);
}
const jb = document.querySelector('#jokes tbody');
for (const j of DATA.jokes.filter((x) => x.status === 'draft' || x.status === 'r10')) {
  const input = el('input', { type: 'text', placeholder: 'new label', value: (state.jokes || {})[j.id]?.label || '' });
  input.addEventListener('input', () => { state.jokes = state.jokes || {}; state.jokes[j.id] = { v: 'rewrite', label: input.value }; save(); });
  jb.append(el('tr', {}, el('td', {}, j.label), el('td', {}, String(j.fair) + (j.fair < 3 ? ' (under 3)' : '')), el('td', {}, j.takers.join(', ')), el('td', {}, j.note || (j.status === 'r10' ? 'too long for two lines' : '')), el('td', {}, choiceRow('jokes', j.id, ['keep', 'cut', 'rewrite']), input)));
}
const vb = document.querySelector('#verbs tbody');
for (const v of DATA.verbs) vb.append(el('tr', {}, el('td', {}, v.text), el('td', {}, v.gloss), el('td', {}, v.tier), el('td', {}, v.violent ? el('span', { class: 'tag' }, 'violent') : ''), el('td', {}, choiceRow('verbs', v.word, ['keep', 'cut']))));
const bd = document.getElementById('boards');
for (const b of DATA.boards) {
  const card = (label, word) => el('div', { class: 'card' }, el('div', { class: 'lab' }, label), el('div', { class: 'well' }, word ? el('span', { class: 'tile' }, word) : ''));
  const ph = () => el('div', { class: 'card ph' });
  const tray = (words) => el('div', { class: 'tray' }, ...words.map((w) => el('span', { class: w ? '' : 'empty' }, w || '')));
  const head = () => el('header', {}, 'Match Five Daily', el('small', {}, '#' + b.number + ' \\u00b7 ' + b.day + (b.harder ? ' \\u00b7 harder' : '')));
  const first = el('div', { class: 'phone' }, head(), el('div', { class: 'sec' }, 'Top five'), el('div', { class: 'grid' }, ...b.headings.slice(0, 5).map((h) => card(h))), el('div', { class: 'sec' }, 'Bottom five'), el('div', { class: 'grid' }, ...[0, 1, 2, 3, 4].map(ph)), tray([...b.words.slice(0, 5)].sort().slice(0, 5)));
  const real = b.shot ? el('figure', { class: 'shot' }, el('img', { src: b.shot, alt: 'Board #' + b.number + ' at load in the daily UI' }), el('figcaption', { class: 'soft' }, 'The daily UI (lane M2) at load, with this pilot board, 390 px phone')) : null;
  const placed = b.s1 ? b.headings.slice(0, 5).map((h, j) => b.words[b.s1.indexOf(j)]) : [];
  const second = el('div', { class: 'phone' }, head(), el('div', { class: 'sec' }, 'Top five \\u00b7 full, not checked'), el('div', { class: 'grid' }, ...b.headings.slice(0, 5).map((h, j) => card(h, placed[j]))), el('div', { class: 'sec' }, 'Bottom five'), el('div', { class: 'grid' }, ...b.headings.slice(5).map((h) => card(h))), tray([...b.words.slice(5)].sort()));
  const answer = el('p', {}, el('strong', {}, 'Answer: '), b.answer.map((h, w) => b.words[w] + ' under ' + b.headings[h]).join('; ') + '.');
  const lives = el('p', {}, el('strong', {}, 'Second lives: '), b.lives.length ? b.lives.map((l) => l.word + ' (' + l.heading + ': ' + l.gloss + ')').join('; ') : 'none');
  const sim = el('p', { class: 'soft' }, 'Band ' + b.band + '. Literal player solves within 4 checks in ' + Math.round(b.players.literal.w4 * 100) + '%; no-aha player on check 1 in ' + Math.round(b.players.noaha.w1 * 100) + '%, within 4 in ' + Math.round(b.players.noaha.w4 * 100) + '%.');
  const hints = el('p', {}, el('strong', {}, 'Hints: '), (b.nudge || 'no nudge (no second life in the answer)') + ' / ' + b.pin);
  const miss = el('div', {}, el('p', {}, el('strong', {}, 'A literal first check (' + b.right[0] + ' + ' + b.right[1] + ' = ' + (b.right[0] + b.right[1]) + ' right) would reveal:')), el('ul', {}, ...b.misses.map((m) => el('li', {}, m))));
  const note = el('input', { type: 'text', placeholder: 'note, if you flag it', value: (state.boardNotes || {})[b.date] || '' });
  note.addEventListener('input', () => { state.boardNotes = state.boardNotes || {}; state.boardNotes[b.date] = note.value; save(); });
  bd.append(el('section', { class: 'board' }, el('h3', {}, '#' + b.number + ' \\u00b7 ' + b.day + ' \\u00b7 ' + b.band), el('div', { class: 'phones' }, real || first, el('figure', { class: 'shot' }, second, el('figcaption', { class: 'soft' }, 'Sketch: the bottom five arrive, with the top five filled the most literal way'))), answer, lives, sim, hints, miss, el('pre', {}, b.share), choiceRow('boards', b.date, ['ok', 'flag']), note));
}
function progress() {
  const g = Object.keys(state.golden || {}).length, j = Object.keys(state.jokes || {}).length, v = Object.keys(state.verbs || {}).length, b = Object.keys(state.boards || {}).length;
  document.getElementById('progress').textContent = 'Golden ' + g + '/' + DATA.golden.length + ' \\u00b7 jokes ' + j + '/' + DATA.jokes.filter((x) => x.status === 'draft' || x.status === 'r10').length + ' \\u00b7 verbs ' + v + '/' + DATA.verbs.length + ' \\u00b7 boards ' + b + '/10';
}
progress();
document.getElementById('copy').addEventListener('click', async () => {
  const text = JSON.stringify({ keyVersion: DATA.keyVersion, exportedAt: new Date().toISOString(), ...state }, null, 1);
  try { await navigator.clipboard.writeText(text); document.getElementById('copy').textContent = 'Copied'; }
  catch (e) { const ta = el('textarea', { style: 'width:100%;height:200px' }); ta.value = text; document.querySelector('main').append(ta); ta.select(); document.getElementById('copy').textContent = 'Select and copy the text below'; }
});
</script></body></html>`;
writeFileSync(join(OUT, 'review.html'), html);
console.log(`wrote ${join(OUT, 'JOSH-REVIEW.md')} and review.html: golden ${goldenCount}, jokes ${jokesToReview.length}, verbs ${verbs.length}, boards ${boardCards.length}; about ${total} min in all`);
