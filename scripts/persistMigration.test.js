// The classic game's save: the v1 -> v2 move, and how a save meets shipped data.
// Runs src/store/persistence.ts in Node (transpiled here) against levels built
// from src/data/gameData.json the way gameSlice.ts builds them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/store/persistence.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'persistence.ts',
}).outputText;
const sandboxModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: sandboxModule,
  exports: sandboxModule.exports,
  require(request) {
    throw new Error(`persistence.ts must stay dependency-free; it required ${request}`);
  },
}, { filename: 'persistence.js' });
// Round-trip through JSON: values made inside the sandbox have that realm's
// prototypes, which strict deep-equality would treat as different.
const plain = value => JSON.parse(JSON.stringify(value));
const { legacyToCurrent, migrateLegacyProgress, reconcileLevels, reconcileProgress, PERSIST_VERSION } = sandboxModule.exports;

const storageConstants = fs.readFileSync(path.join(root, 'src/constants/storage.ts'), 'utf8');
const NEW_KEY = `persist:${storageConstants.match(/GAME_PROGRESS_KEY = '([^']+)'/)[1]}`;
const OLD_KEY = storageConstants.match(/LEGACY_GAME_PROGRESS_STORAGE_KEY = '([^']+)'/)[1];
assert.equal(OLD_KEY, 'persist:match_five_progress', 'the v1 key is what players have saved today');
assert.notEqual(NEW_KEY, OLD_KEY, 'the v2 key must differ from the v1 key');

const storeSource = fs.readFileSync(path.join(root, 'src/store/store.ts'), 'utf8');
assert.match(storeSource, /blacklist:\s*\[\s*'hints'\s*\]/, 'store.ts must never save clue lists');
assert.match(storeSource, /stateReconciler:[^\n]*reconcileProgress/, 'store.ts must rehydrate through reconcileProgress');
assert.match(storeSource, /migrateLegacyProgress\(/, 'store.ts must move a v1 save before rehydrating');

// Shipped state, built from gameData.json exactly as gameSlice.ts does.
const gameData = JSON.parse(fs.readFileSync(path.join(root, 'src/data/gameData.json'), 'utf8'));
function shippedLevels() {
  return gameData.levels.map((level, l) => ({
    id: `level_${l + 1}`,
    name: level.name ?? `Level ${l + 1}`,
    inventory: level.sections[0].words.map(word => ({ ...word })),
    solutions: [],
    sections: level.sections.map((section, s) => ({
      id: `section_${l + 1}_${s + 1}`,
      name: section.name ?? `Section ${s + 1}`,
      slots: section.slots.map((hintId, k) => ({ id: `slot_${l + 1}_${s + 1}_${k + 1}`, hintId, currentWord: null })),
      availableWords: s === 0 ? [] : section.words.map(word => ({ ...word })),
      isUnlocked: s === 0,
    })),
  }));
}
function shippedState() {
  return {
    levels: shippedLevels(),
    currentLevel: null,
    hints: gameData.hints,
    inventory: [],
    tutorials: { mainTutorialCompleted: false, sectionTutorialCompleted: false, hintTutorialCompleted: false },
    levelProgress: {},
  };
}

// A v1 save the way redux-persist wrote it: each slice key a JSON string.
function v1Blob(state) {
  const blob = {};
  for (const [key, value] of Object.entries(state)) blob[key] = JSON.stringify(value);
  blob._persist = JSON.stringify({ version: -1, rehydrated: true });
  return JSON.stringify(blob);
}

// A player midway through level 1 on the old data, with one level finished,
// and the stored clue lists edited (U1's stale-data test: Apple no longer a Fruit).
function legacyPlayerState() {
  const state = shippedState();
  const level1 = state.levels[0];
  const [apple] = level1.inventory.splice(0, 1);
  level1.sections[0].slots[0].currentWord = apple;
  state.hints = JSON.parse(JSON.stringify(state.hints));
  state.hints.Fruit.accepts = state.hints.Fruit.accepts.filter(word => word !== 'Apple');
  state.hints['2 Digit'].accepts = state.hints['2 Digit'].accepts.filter(word => word !== '10');
  state.levelProgress = {
    level_1: { solutions: [], sections: { section_1_1: { isUnlocked: true, slots: {}, availableWords: [] } }, inventory: [] },
    level_2: { solutions: ['Dog,Penguin,Bear,Fish,Snake'], sections: { section_2_1: { isUnlocked: true, slots: {}, availableWords: [] } }, inventory: [] },
    level_3: { solutions: [], sections: {}, inventory: [] },
  };
  state.tutorials = { mainTutorialCompleted: true, sectionTutorialCompleted: false, hintTutorialCompleted: true };
  return state;
}

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); this.failWrites = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { if (this.failWrites) throw new Error('QuotaExceededError'); this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

// ---------------------------------------------------------------------------
// 1. Moving a v1 save keeps finished levels and tutorials, drops clue lists
//    and levels.
// ---------------------------------------------------------------------------
{
  const storage = new MemoryStorage({ [OLD_KEY]: v1Blob(legacyPlayerState()), 'burgerverse:v1': '{"tickets":3}' });
  assert.equal(migrateLegacyProgress(storage, NEW_KEY, OLD_KEY), 'migrated');
  assert.equal(storage.getItem(OLD_KEY), null, 'the v1 save is removed once moved');
  assert.equal(storage.getItem('burgerverse:v1'), '{"tickets":3}', 'other games\' saves on the shared origin are untouched');
  const saved = JSON.parse(storage.getItem(NEW_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ['_persist', 'levelProgress', 'tutorials'], 'only player state moves; no hints, no levels');
  assert.deepEqual(JSON.parse(saved._persist), { version: PERSIST_VERSION, rehydrated: true });
  assert.deepEqual(JSON.parse(saved.tutorials), { mainTutorialCompleted: true, sectionTutorialCompleted: false, hintTutorialCompleted: true });
  assert.deepEqual(
    JSON.parse(saved.levelProgress),
    { level_2: { solutions: ['Dog,Penguin,Bear,Fish,Snake'], sections: {}, inventory: [] } },
    'a finished level stays finished; board snapshots and unfinished entries go'
  );
  assert.equal(migrateLegacyProgress(storage, NEW_KEY, OLD_KEY), 'none', 'a second load has nothing to move');

  // What the game then loads: shipped clues, shipped levels, the player's record.
  const loaded = plain(reconcileProgress({
    tutorials: JSON.parse(saved.tutorials),
    levelProgress: JSON.parse(saved.levelProgress),
  }, shippedState()));
  assert.ok(loaded.hints.Fruit.accepts.includes('Apple'), 'the shipped Fruit list wins over the edited stored one');
  assert.ok(loaded.hints['2 Digit'].accepts.includes('10'), 'a corrected clue list reaches a returning player');
  assert.deepEqual(loaded.levels, plain(shippedLevels()), 'levels start from the shipped data');
  assert.equal(loaded.levelProgress.level_2.solutions.length, 1, 'level 2 still counts as finished, so level 3 stays unlocked');
}

// A v2 save that already exists wins; the stale v1 save is still cleared.
{
  const storage = new MemoryStorage({ [OLD_KEY]: v1Blob(legacyPlayerState()), [NEW_KEY]: 'v2 save' });
  assert.equal(migrateLegacyProgress(storage, NEW_KEY, OLD_KEY), 'discarded');
  assert.equal(storage.getItem(NEW_KEY), 'v2 save');
  assert.equal(storage.getItem(OLD_KEY), null);
}
// An unreadable v1 save is dropped, not carried over.
{
  const storage = new MemoryStorage({ [OLD_KEY]: '{not json' });
  assert.equal(migrateLegacyProgress(storage, NEW_KEY, OLD_KEY), 'discarded');
  assert.equal(storage.getItem(NEW_KEY), null);
  assert.equal(storage.getItem(OLD_KEY), null);
  assert.equal(legacyToCurrent('[1,2]'), null);
}
// A full or blocked storage leaves the v1 save for the next visit.
{
  const storage = new MemoryStorage({ [OLD_KEY]: v1Blob(legacyPlayerState()) });
  storage.failWrites = true;
  assert.equal(migrateLegacyProgress(storage, NEW_KEY, OLD_KEY), 'failed');
  assert.notEqual(storage.getItem(OLD_KEY), null, 'nothing is lost when the write fails');
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() {}, removeItem() {} };
  assert.equal(migrateLegacyProgress(blocked, NEW_KEY, OLD_KEY), 'failed');
}
// A v1 save with odd or missing parts still yields a clean v2 save.
{
  const odd = JSON.stringify({ levelProgress: '{"level_1":{"solutions":["x",4,null]},"evil":{"solutions":["y"]},"level_9":7}', tutorials: 'not json' });
  const moved = JSON.parse(legacyToCurrent(odd));
  assert.deepEqual(JSON.parse(moved.levelProgress), { level_1: { solutions: ['x'], sections: {}, inventory: [] } });
  assert.deepEqual(JSON.parse(moved.tutorials), { mainTutorialCompleted: false, sectionTutorialCompleted: false, hintTutorialCompleted: false });
}

// ---------------------------------------------------------------------------
// 2. A v2 save is laid over the shipped levels: placements come back, clue
//    labels and words never do.
// ---------------------------------------------------------------------------
{
  // Play level 1 section 1 into place and unlock section 2, as the reducer would.
  const saved = shippedLevels();
  const level1 = saved[0];
  level1.sections[0].slots.forEach((slot, k) => { slot.currentWord = level1.inventory[k]; });
  level1.inventory = [];
  level1.sections[1].isUnlocked = true;
  level1.inventory.push(...level1.sections[1].availableWords);
  level1.sections[1].availableWords = [];
  // Move the second section's first word onto the board.
  level1.sections[1].slots[0].currentWord = level1.inventory.shift();
  level1.solutions = [];
  // The save also carries stale definitions that must not survive.
  level1.sections[0].slots[0].hintId = 'Vegetable';
  level1.sections[1].slots[4].hintId = 'Some old clue';

  const restored = plain(reconcileLevels(shippedLevels(), JSON.parse(JSON.stringify(saved))));
  const r1 = restored[0];
  assert.deepEqual(r1.sections.map(s => s.isUnlocked), [true, true]);
  assert.deepEqual(r1.sections[0].slots.map(s => s.currentWord && s.currentWord.text), ['Apple', 'Broccoli', 'Strawberry', 'Rose', 'Tree']);
  assert.equal(r1.sections[1].slots[0].currentWord.text, 'Tomato');
  assert.deepEqual(r1.inventory.map(w => w.text), ['Orange', 'Banana', 'Blueberry', 'Daisy'], 'the tray keeps its saved order');
  assert.equal(r1.sections[0].slots[0].hintId, 'Fruit', 'slot clues always come from the shipped level');
  assert.equal(r1.sections[1].slots[4].hintId, 'Green');
  assert.deepEqual(restored.slice(1), plain(shippedLevels().slice(1)), 'levels with no save stay as shipped');
}

// Corrupt or hostile saves never lose or double a tile, and never show a
// locked section's words.
function checkLevelInvariant(level, shipped, label) {
  const onBoard = level.sections.flatMap(s => s.slots.map(slot => slot.currentWord).filter(Boolean));
  const inTray = level.inventory;
  const seen = [...onBoard, ...inTray].map(w => w.id);
  assert.equal(new Set(seen).size, seen.length, `${label}: a tile appears twice`);
  let open = true;
  level.sections.forEach((section, s) => {
    open = open && section.isUnlocked;
    assert.equal(section.isUnlocked, open, `${label}: sections must unlock in order`);
    const shippedSection = shipped.sections[s];
    const words = s === 0 ? shipped.inventory : shippedSection.availableWords;
    assert.deepEqual(section.slots.map(slot => slot.hintId), shippedSection.slots.map(slot => slot.hintId), `${label}: clue labels changed`);
    if (section.isUnlocked) {
      assert.equal(section.availableWords.length, 0, `${label}: an unlocked section keeps no waiting words`);
      for (const word of words) {
        assert.equal(seen.filter(id => id === word.id).length, 1, `${label}: ${word.text} must be on the board or in the tray exactly once`);
      }
    } else {
      assert.deepEqual(section.availableWords.map(w => w.id), shippedSection.availableWords.map(w => w.id), `${label}: a locked section's words wait`);
      assert.ok(section.slots.every(slot => slot.currentWord === null), `${label}: a locked section has no placements`);
      for (const word of words) assert.ok(!seen.includes(word.id), `${label}: a locked word leaked out`);
    }
  });
}

let seed = 20261008;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = list => list[Math.floor(random() * list.length)];
const allWords = shippedLevels().flatMap(level => [...level.inventory, ...level.sections.flatMap(s => s.availableWords)]);
for (let trial = 0; trial < 400; trial++) {
  const saved = shippedLevels();
  for (const level of saved) {
    for (const section of level.sections) {
      if (random() < 0.6) section.isUnlocked = random() < 0.7;
      for (const slot of section.slots) {
        const roll = random();
        if (roll < 0.35) slot.currentWord = { ...pick(allWords) };
        else if (roll < 0.4) slot.currentWord = { id: pick(allWords).id, text: 'Not the text' };
        else if (roll < 0.45) slot.currentWord = 'garbage';
      }
    }
    if (random() < 0.3) level.inventory = [];
    if (random() < 0.3) level.inventory = [...level.inventory, { ...pick(allWords) }, { ...pick(allWords) }, 7, null];
    if (random() < 0.1) level.sections = 'garbage';
  }
  const restored = plain(reconcileLevels(shippedLevels(), random() < 0.05 ? 'garbage' : JSON.parse(JSON.stringify(saved))));
  const shipped = shippedLevels();
  restored.forEach((level, l) => checkLevelInvariant(level, shipped[l], `trial ${trial} level ${l + 1}`));
}

// Whole-state reconciliation ignores anything that is not player state.
{
  const shipped = shippedState();
  assert.deepEqual(plain(reconcileProgress(undefined, shipped)), plain(shipped));
  assert.deepEqual(plain(reconcileProgress('garbage', shipped)), plain(shipped));
  const loaded = plain(reconcileProgress({ hints: { Fruit: { accepts: [] } }, tutorials: { mainTutorialCompleted: 'yes' }, levelProgress: { nope: {} } }, shipped));
  assert.deepEqual(loaded.hints, plain(shipped.hints), 'stored clue lists are ignored');
  assert.equal(loaded.tutorials.mainTutorialCompleted, false);
  assert.deepEqual(loaded.levelProgress, {});
}

console.log('Verified the v1 -> v2 save move (clue lists and levels dropped, finished levels kept) and 400 randomized saves reconciled without losing or doubling a tile.');
