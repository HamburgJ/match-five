const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const publicIndex = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(__dirname, '../src/utils/analytics.ts'), 'utf8');
const appEntrySource = fs.readFileSync(path.join(__dirname, '../src/index.tsx'), 'utf8');

assert.doesNotMatch(
  publicIndex,
  /googletagmanager\.com\/gtag\/js|%REACT_APP_GA_ID%|\bdataLayer\b|\bgtag\s*\(/,
  'public/index.html must not bootstrap GA separately or emit unresolved environment placeholders'
);
assert.equal(
  (appEntrySource.match(/\binitGA\s*\(\s*\)\s*;/g) || []).length,
  1,
  'the application entry point must initialize analytics exactly once'
);

const compiledAnalytics = ts.transpileModule(analyticsSource, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: 'analytics.ts',
}).outputText;

function loadAnalytics(measurementId) {
  const calls = { event: [], initialize: [], send: [] };
  const reactGa = {
    event: (...args) => calls.event.push(args),
    initialize: (...args) => calls.initialize.push(args),
    send: (...args) => calls.send.push(args),
  };
  const module = { exports: {} };
  const env = { NODE_ENV: 'production' };
  if (measurementId) env.REACT_APP_GA_ID = measurementId;

  vm.runInNewContext(compiledAnalytics, {
    console,
    exports: module.exports,
    module,
    process: { env },
    require(request) {
      if (request === 'react-ga4') return { __esModule: true, default: reactGa };
      throw new Error(`Unexpected analytics dependency: ${request}`);
    },
    window: { location: { pathname: '/match-five/' } },
  }, { filename: 'analytics.js' });

  return { analytics: module.exports, calls };
}

const enabled = loadAnalytics('G-TEST123');
enabled.analytics.initGA();

assert.equal(enabled.calls.initialize.length, 1, 'analytics must initialize once');
assert.equal(enabled.calls.initialize[0][0], 'G-TEST123');
assert.equal(
  enabled.calls.initialize[0][1].gtagOptions.send_page_view,
  false,
  'ReactGA config must suppress its automatic page view'
);
assert.equal(enabled.calls.send.length, 1, 'analytics must send one explicit initial page view');
assert.equal(enabled.calls.send[0][0].hitType, 'pageview');
assert.equal(enabled.calls.event.length, 0, 'initialization must not emit a game event');

enabled.analytics.logMatchFiveShare('copy');
enabled.analytics.logMatchFiveShare('web_share');
enabled.analytics.logMatchFiveCrossClick('/word-games/');
// JSON round-trip: event params are created inside the vm sandbox, so their
// prototypes differ from this realm's and strict deep-equality would fail on
// otherwise identical objects.
assert.deepEqual(
  JSON.parse(JSON.stringify(enabled.calls.event)),
  [
    ['share', { game: 'match_five', method: 'copy' }],
    ['share', { game: 'match_five', method: 'web_share' }],
    ['cross_game_click', { game: 'match_five', dest: '/word-games/' }],
  ],
  'share and cross-game events must match the parent site taxonomy (game slug + method/dest params)'
);

// A build with no measurement id in the environment must NOT ship dark: the
// module falls back to burgerfun.ca's public GA4 id. Match Five, This Game,
// Tiny Worlds and ME3 reported nothing from 2026-09-03 to 2026-09-11 because
// the Pages build had no env var and the old code went inert.
const fallback = loadAnalytics();
fallback.analytics.initGA();
fallback.analytics.logMatchFiveStart('home');

assert.equal(fallback.calls.initialize.length, 1, 'a build with no env var must still initialize analytics');
assert.equal(
  fallback.calls.initialize[0][0],
  'G-3ZP8KNH2V1',
  'a build with no env var must fall back to the public burgerfun.ca measurement id'
);
assert.equal(fallback.calls.send.length, 1, 'the fallback build must send its initial page view');
assert.equal(fallback.calls.event.length, 1, 'the fallback build must emit game events');

console.log('Verified one Match Five page view, no duplicate bootstrap, and the no-env-var fallback id.');
