const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Read the raw game data
const rawGameDataPath = path.join(__dirname, '../src/data/rawGameData.json');
const outputPath = path.join(__dirname, '../src/data/gameData.json');

interface RawGameData {
  levels: {
    name?: string;
    sections: {
      name?: string;
      words: string[];
      slots: string[];
    }[];
  }[];
  hints: {
    [key: string]: {
      accepts: string[];
    };
  };
  wordEmojis: {
    [key: string]: string;
  };
}

interface ProcessedGameData {
  levels: {
    name?: string;
    sections: {
      name?: string;
      words: {
        id: string;
        text: string;
      }[];
      slots: string[];
    }[];
  }[];
  hints: {
    [key: string]: {
      accepts: string[];
    };
  };
  wordEmojis: {
    [key: string]: string;
  };
}

function generateGameData() {
  // Read the raw game data
  const rawData = JSON.parse(fs.readFileSync(rawGameDataPath, 'utf-8')) as RawGameData;

  // Process the data and add UUIDs
  const processedData: ProcessedGameData = {
    ...rawData,
    levels: rawData.levels.map(level => ({
      ...level,
      sections: level.sections.map(section => ({
        ...section,
        words: section.words.map(word => ({
          id: uuidv4(),
          text: word
        }))
      }))
    }))
  };

  // Write the processed data
  fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
  console.log('Generated game data with UUIDs at:', outputPath);
}

generateGameData();

// Make this a module
export {}; 