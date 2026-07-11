import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rawGameDataPath = resolve(scriptDirectory, '../src/data/rawGameData.json');
const outputPath = resolve(scriptDirectory, '../src/data/gameData.json');

const stableWordId = (levelIndex, sectionIndex, wordIndex, text) => {
  const identity = `${levelIndex}:${sectionIndex}:${wordIndex}:${text}`;
  return `word_${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
};

export const buildGameData = (rawData, existingData) => ({
  ...rawData,
  levels: rawData.levels.map((level, levelIndex) => ({
    ...level,
    sections: level.sections.map((section, sectionIndex) => ({
      ...section,
      words: section.words.map((wordText, wordIndex) => {
        const existingWord = existingData?.levels?.[levelIndex]?.sections?.[sectionIndex]?.words?.[wordIndex];
        const preservedId = existingWord?.text === wordText && typeof existingWord.id === 'string'
          ? existingWord.id
          : null;
        return {
          id: preservedId ?? stableWordId(levelIndex, sectionIndex, wordIndex, wordText),
          text: wordText,
        };
      }),
    })),
  })),
});

export const generateGameData = () => {
  const rawData = JSON.parse(readFileSync(rawGameDataPath, 'utf8'));
  const existingData = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf8'))
    : undefined;
  const processedData = buildGameData(rawData, existingData);
  writeFileSync(outputPath, `${JSON.stringify(processedData, null, 2)}\n`);
  console.log(`Generated deterministic game data at ${outputPath}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  generateGameData();
}
