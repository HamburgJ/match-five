import { GameState, RawGameData, Level, Section, Slot, Word } from '../store/types';
import gameData from '../data/gameData.json';

function generateLevelId(levelIndex: number): string {
  return `level_${levelIndex + 1}`;
}

function generateSectionId(levelIndex: number, sectionIndex: number): string {
  return `section_${levelIndex + 1}_${sectionIndex + 1}`;
}

function generateSlotId(levelIndex: number, sectionIndex: number, slotIndex: number): string {
  return `slot_${levelIndex + 1}_${sectionIndex + 1}_${slotIndex + 1}`;
}

function generateWordId(levelIndex: number, sectionIndex: number, wordIndex: number): string {
  return `word_${levelIndex + 1}_${sectionIndex + 1}_${wordIndex + 1}`;
}

export function parseGameData(): GameState {
  const rawData = gameData as RawGameData;
  
  return {
    levels: rawData.levels.map((level, levelIndex) => ({
      id: generateLevelId(levelIndex),
      name: level.name,
      isComplete: false,
      sections: level.sections.map((section, sectionIndex) => ({
        id: generateSectionId(levelIndex, sectionIndex),
        name: section.name,
        isUnlocked: levelIndex === 0 && sectionIndex === 0, // First section of first level is unlocked by default
        isComplete: false,
        slots: section.slots.map((hintId, slotIndex) => ({
          id: generateSlotId(levelIndex, sectionIndex, slotIndex),
          hintId,
          currentWord: null
        })),
        availableWords: section.words.map((word, wordIndex) => ({
          id: generateWordId(levelIndex, sectionIndex, wordIndex),
          text: word
        }))
      })),
      inventory: []
    })),
    currentLevel: null,
    currentSection: null,
    inventory: [],
    hints: rawData.hints
  };
} 