const fs = require('fs');
const path = require('path');
const { v5: uuidv5 } = require('uuid');

// Read the raw game data
const rawGameDataPath = path.join(__dirname, '../src/data/rawGameData.json');
const outputPath = path.join(__dirname, '../src/data/gameData.json');

function stableWordId(levelIndex, sectionIndex, wordIndex, wordText) {
  return uuidv5(
    `burgerfun:match-five:word:${levelIndex + 1}:${sectionIndex + 1}:${wordIndex + 1}:${wordText}`,
    uuidv5.URL
  );
}

function processGameData(rawData) {
  return {
    ...rawData,
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
  fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
  console.log('Generated game data with stable UUIDs at:', outputPath);
  return processedData;
}

if (require.main === module) {
  generateGameData();
}

module.exports = { generateGameData, processGameData, stableWordId };
