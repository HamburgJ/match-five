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

const disabled = loadAnalytics();
disabled.analytics.initGA();
disabled.analytics.logPageView('/other/');
disabled.analytics.logGameEvent('test');
disabled.analytics.logMatchFiveStart('home');
disabled.analytics.logMatchFiveLevelSolved(1, true);
disabled.analytics.logMatchFiveRetry(1);

assert.deepEqual(
  Object.fromEntries(Object.entries(disabled.calls).map(([name, calls]) => [name, calls.length])),
  { event: 0, initialize: 0, send: 0 },
  'analytics must remain inert when no measurement ID is configured'
);

console.log('Verified one environment-gated Match Five page view and no duplicate bootstrap.');
