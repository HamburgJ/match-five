const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Read the raw game data
const rawGameDataPath = path.join(__dirname, '../src/data/rawGameData.json');
const outputPath = path.join(__dirname, '../src/data/gameData.json');

function generateGameData() {
  // Read the raw game data
  const rawData = JSON.parse(fs.readFileSync(rawGameDataPath, 'utf-8'));

  // Process the data and add UUIDs
  const processedData = {
    ...rawData,
    levels: rawData.levels.map(level => ({
      ...level,
      sections: level.sections.map(section => ({
        ...section,
        // Convert string[] to Word[]
        words: section.words.map(wordText => ({
          id: uuidv4(),
          text: wordText
        }))
      }))
    }))
  };

  // Write the processed data
  fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
  console.log('Generated game data with UUIDs at:', outputPath);
}

generateGameData(); 