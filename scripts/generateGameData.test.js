const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { processGameData, stableWordId } = require('./generateGameData');

const rawPath = path.join(__dirname, '../src/data/rawGameData.json');
const generatedPath = path.join(__dirname, '../src/data/gameData.json');
const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const committedData = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
const first = processGameData(rawData);
const second = processGameData(rawData);

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

console.log(`Verified ${ids.length} deterministic, unique Match Five word IDs.`);
