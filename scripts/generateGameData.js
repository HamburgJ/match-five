const fs = require('fs');
const path = require('path');
const { v5: uuidv5 } = require('uuid');
const { ruleFor } = require('./clueRules');

// Read the raw game data
const rawGameDataPath = path.join(__dirname, '../src/data/rawGameData.json');
const outputPath = path.join(__dirname, '../src/data/gameData.json');

function stableWordId(levelIndex, sectionIndex, wordIndex, wordText) {
  return uuidv5(
    `burgerfun:match-five:word:${levelIndex + 1}:${sectionIndex + 1}:${wordIndex + 1}:${wordText}`,
    uuidv5.URL
  );
}

// Numbers in numeric order first, then everything else by code point, so a
// computed list reads naturally and never depends on the machine's locale.
function compareTiles(a, b) {
  const aNumber = /^[0-9]+$/.test(a);
  const bNumber = /^[0-9]+$/.test(b);
  if (aNumber && bNumber) return Number(a) - Number(b);
  if (aNumber !== bNumber) return aNumber ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Every distinct word a level can put on the board. A computed clue's list is
// complete over this set, so no word in the game can be wrongly rejected.
function gameVocabulary(rawData) {
  const words = new Set();
  rawData.levels.forEach(level => level.sections.forEach(section => section.words.forEach(word => words.add(word))));
  return [...words];
}

function processHints(rawData) {
  const vocabulary = gameVocabulary(rawData);
  const hints = {};
  for (const [label, hint] of Object.entries(rawData.hints)) {
    const rule = ruleFor(label);
    if (hint.computed === true) {
      if (!rule) throw new Error(`Clue "${label}" is marked computed but no rule in scripts/clueRules.js matches it`);
      if ('accepts' in hint) throw new Error(`Clue "${label}" is computed; remove its hand-typed accepts list`);
      hints[label] = { computed: true, accepts: vocabulary.filter(rule).sort(compareTiles) };
      continue;
    }
    if (rule) {
      throw new Error(`Clue "${label}" is mechanical; mark it "computed": true instead of typing its list`);
    }
    if (!Array.isArray(hint.accepts) || hint.accepts.some(word => typeof word !== 'string')) {
      throw new Error(`Clue "${label}" needs an accepts list of words`);
    }
    if (new Set(hint.accepts).size !== hint.accepts.length) {
      throw new Error(`Clue "${label}" lists a word twice`);
    }
    hints[label] = { accepts: [...hint.accepts] };
  }

  rawData.levels.forEach((level, levelIndex) => level.sections.forEach((section, sectionIndex) => {
    section.slots.forEach(label => {
      if (!hints[label]) {
        throw new Error(`Level ${levelIndex + 1} section ${sectionIndex + 1} uses unknown clue "${label}"`);
      }
    });
  }));
  return hints;
}

function processGameData(rawData) {
  return {
    hints: processHints(rawData),
    levels: rawData.levels.map((level, levelIndex) => ({
      ...level,
      sections: level.sections.map((section, sectionIndex) => ({
        ...section,
        // Stable IDs keep generated data and production asset hashes reproducible.
        words: section.words.map((wordText, wordIndex) => ({
          id: stableWordId(levelIndex, sectionIndex, wordIndex, wordText),
          text: wordText
        }))
      }))
    }))
  };
}

function generateGameData() {
  // Read the raw game data
  const rawData = JSON.parse(fs.readFileSync(rawGameDataPath, 'utf-8'));
  const processedData = processGameData(rawData);

  // Write the processed data
  fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2) + '\n');
  console.log('Generated game data with stable UUIDs and computed clue lists at:', outputPath);
  return processedData;
}

if (require.main === module) {
  generateGameData();
}

module.exports = { generateGameData, processGameData, stableWordId };
