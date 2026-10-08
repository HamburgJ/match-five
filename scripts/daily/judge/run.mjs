// judge/run.mjs - the membership judge (dossier v2 7.3), built to run later with one command and a spend cap.
// NOT RUN in the pilot: every tier in data/key.json was judged by the M1 lane (model in the loop).
//
//   node scripts/daily/judge/run.mjs                       plan: question and token counts, estimated cost; no network
//   node scripts/daily/judge/run.mjs --dry-run             also writes every request payload to work/judge/requests/
//   node scripts/daily/judge/run.mjs --mock                answers from the pilot key, offline, to test the whole chain
//   node scripts/daily/judge/run.mjs --live --vendor clef --budget-usd 3      the real run (needs Josh's go-ahead)
//        --vendor jev                                      the cross-check (needs JEV_API_KEY)
//        --scope golden|cells|readings|all                 golden = the 300-cell golden set first (the kill line)
//
// Live runs need, in the environment:
//   clef: CF_ACCOUNT_ID, CF_API_TOKEN (Workers AI), CLEF_WEIGHTS_SHA256 (the pinned open-weights hash, stored with every answer)
//   jev:  JEV_API_KEY; the model is pinned to jev-1.13.0
// The spend cap is enforced before each request from the estimated input tokens (4 characters a token, rounded up,
// plus the vendor's per-request overhead), and again from any usage the response reports. The run stops, keeping
// everything answered so far, the moment the next request would pass the cap.
// Kill line (REPORT.md, dossier 9.7): with --scope golden, if the judge disagrees with Josh's rulings on more than
// 15% of the obvious golden cells, the run stops and says so; no batch may be judged after a failed golden run.
// Every answer is stored with vendor, model id, weights hash, prompt version and date, outside public/ (U4).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildKey } from '../build-key.mjs';
import { plan, PROMPT_VERSION } from './questions.mjs';

const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const VENDORS = {
  clef: { model: '@cf/cloudflare/clef-flash', usdPerMTok: 0.09, maxQuestions: 64, overheadTokens: 40 },
  jev: { model: 'jev-1.13.0', usdPerMTok: 0.042, maxQuestions: 64, overheadTokens: 40 },
  mock: { model: 'mock-from-pilot-key', usdPerMTok: 0, maxQuestions: 64, overheadTokens: 0 },
};
const vendorName = has('mock') ? 'mock' : arg('vendor', 'clef');
const V = VENDORS[vendorName];
if (!V) throw new Error(`unknown vendor ${vendorName}`);
const live = has('live'), dry = has('dry-run');
const budget = Number(arg('budget-usd', 3));
const scope = arg('scope', 'all');

const { key, words, headingList, senseFact } = buildKey({});
const content = { words, headings: headingList };
const P = plan(key, content);
const tokens = (s) => Math.ceil(s.length / 4);

// batch: one request per state (sense or word), up to maxQuestions questions each
function batches(items) {
  const out = [];
  for (const it of items) {
    for (let i = 0; i < it.questions.length; i += V.maxQuestions) {
      const qs = it.questions.slice(i, i + V.maxQuestions);
      out.push({ state: it.state, ids: qs.map((_, k) => `${it.id}#${i + k}`), questions: qs });
    }
  }
  // merge batches that share a state, keeping one open batch per state
  const done = [], open = new Map();
  for (const b of out) {
    const cur = open.get(b.state);
    if (cur && cur.questions.length + b.questions.length <= V.maxQuestions) { cur.questions.push(...b.questions); cur.ids.push(...b.ids); continue; }
    if (cur) done.push(cur);
    open.set(b.state, { ...b, ids: [...b.ids], questions: [...b.questions] });
  }
  return [...done, ...open.values()];
}

let items;
if (scope === 'golden') {
  const goldenPath = join(HERE, 'content', 'golden-set.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')).cells;
  const want = new Set();
  for (const g of golden) for (const s of Object.keys(key.words[g.word].senses)) for (const p of g.predicates) want.add(`${s}|${p}`);
  items = [...P.cells.filter((c) => want.has(c.id)), ...P.readings.filter((r) => golden.some((g) => `${g.word}|${g.heading}` === r.id))];
} else items = scope === 'cells' ? P.cells : scope === 'readings' ? P.readings : [...P.cells, ...P.readings];
const B = batches(items);
const totalQ = B.reduce((a, b) => a + b.questions.length, 0);
const totalTok = B.reduce((a, b) => a + tokens(b.state) + b.questions.reduce((x, q) => x + tokens(q), 0) + V.overheadTokens, 0);
const estUsd = (totalTok / 1e6) * V.usdPerMTok;
console.log(`judge plan (${vendorName}, ${V.model}, prompt ${PROMPT_VERSION}, scope ${scope}): ${P.preds.length} predicates; ${items.length} cells; ${totalQ} questions in ${B.length} requests; about ${(totalTok / 1e6).toFixed(1)}M input tokens, about $${estUsd.toFixed(2)}`);
if (!live && !dry && !has('mock')) { console.log('plan only: nothing was sent. Add --dry-run to write payloads, --mock to test the chain offline, or --live (with Josh\'s approval) to spend.'); process.exit(0); }

const outDir = join(HERE, 'work', 'judge');
mkdirSync(join(outDir, 'requests'), { recursive: true });
const runId = `${new Date().toISOString().slice(0, 10)}-${vendorName}-${scope}`;
const rawDir = join(HERE, 'judgments', 'raw');
mkdirSync(rawDir, { recursive: true });
const rawPath = join(rawDir, `${runId}.jsonl`);

function payload(b) {
  const questions = Object.fromEntries(b.questions.map((q, i) => [`q${i}`, { type: 'noul', question: q }]));
  return vendorName === 'jev' ? { model: V.model, state: b.state, questions } : { state: b.state, questions };
}
async function send(b) {
  if (vendorName === 'mock') return mockAnswer(b);
  const body = JSON.stringify(payload(b));
  const url = vendorName === 'clef' ? `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${V.model}` : 'https://api.typesafe.ai/v1/systemone';
  const auth = vendorName === 'clef' ? process.env.CF_API_TOKEN : process.env.JEV_API_KEY;
  if (!auth || (vendorName === 'clef' && !process.env.CF_ACCOUNT_ID)) throw new Error('missing credentials in the environment');
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body });
  if (!res.ok) throw new Error(`${vendorName} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return parseAnswers(json, b.questions.length);
}
// tolerant reader: the answer for question qi is the first number found under a p_yes / probability / p / yes field
export function parseAnswers(json, n) {
  const root = json.result ?? json;
  const answers = root.answers ?? root.questions ?? root;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = answers[`q${i}`] ?? (Array.isArray(answers) ? answers[i] : undefined);
    const p = typeof a === 'number' ? a : a?.p_yes ?? a?.probability ?? a?.p ?? a?.yes ?? a?.value;
    if (typeof p !== 'number' || p < 0 || p > 1) throw new Error(`no probability for q${i} in ${JSON.stringify(a).slice(0, 120)}`);
    out.push(p);
  }
  return { p: out, usageTokens: root.usage?.input_tokens ?? root.usage?.prompt_tokens ?? null };
}
// mock vendor: probabilities derived from the pilot key, so apply.mjs and fit.mjs can be exercised offline
const MOCK_P = { L: 0.95, S: 0.72, O: 0.45, A: 0.5, n: 0.3, N: 0.05 };
function mockAnswer(b) {
  return { p: b.ids.map((id) => {
    const [cell, k] = id.split('#');
    if (!cell.split('|')[0].includes('.')) { // a reading cell: word|heading
      const [w, h] = cell.split('|');
      const t = key.cells[h]?.[w]?.[0] || 'N';
      return t === 'n' ? 0.4 : t === 'N' ? 0.05 : 0.6;
    }
    const [sid, pred] = cell.split('|');
    const w = words.find((x) => x.senses.some((s) => s.id === sid));
    const s = w.senses.find((x) => x.id === sid);
    const t = senseFact(s, pred).tier;
    return +k === 3 ? (t === 'L' ? 0.9 : t === 'S' ? 0.4 : t === 'O' ? 0.08 : 0.3) : MOCK_P[t];
  }), usageTokens: null };
}

let spent = 0, sent = 0;
const stamp = { vendor: vendorName, model: V.model, weightsSha256: vendorName === 'clef' ? process.env.CLEF_WEIGHTS_SHA256 || null : null, promptVersion: PROMPT_VERSION, date: new Date().toISOString() };
if (live && vendorName === 'clef' && !stamp.weightsSha256) throw new Error('set CLEF_WEIGHTS_SHA256 to the pinned open-weights hash before a live run');
for (const b of B) {
  const estTok = tokens(b.state) + b.questions.reduce((x, q) => x + tokens(q), 0) + V.overheadTokens;
  const cost = (estTok / 1e6) * V.usdPerMTok;
  if (dry) { writeFileSync(join(outDir, 'requests', `${String(sent).padStart(6, '0')}.json`), JSON.stringify(payload(b))); sent++; continue; }
  if (spent + cost > budget) { console.log(`spend cap reached: $${spent.toFixed(4)} spent, next request $${cost.toFixed(4)}, cap $${budget}; stopping`); break; }
  const r = await send(b);
  spent += r.usageTokens ? (r.usageTokens / 1e6) * V.usdPerMTok : cost;
  for (let i = 0; i < b.ids.length; i++) appendFileSync(rawPath, JSON.stringify({ id: b.ids[i], state: b.state, question: b.questions[i], p: r.p[i], ...stamp }) + '\n');
  sent++;
  if (sent % 500 === 0) console.log(`  ${sent}/${B.length} requests, $${spent.toFixed(3)}`);
}
console.log(dry ? `dry run: wrote ${sent} request payloads to ${join(outDir, 'requests')}` : `${sent} requests answered, about $${spent.toFixed(3)} spent; raw answers in ${rawPath}`);
if (scope === 'golden' && !dry) console.log('next: node scripts/daily/judge/fit.mjs ' + rawPath + '   (fits thresholds to the golden rulings and applies the kill line)');
else if (!dry) console.log('next: node scripts/daily/judge/apply.mjs ' + rawPath + '   (writes the triage queue against the pilot key)');
