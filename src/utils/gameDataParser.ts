import { GameState, RawGameData, Level, Section, Slot, Word } from '../store/types';
import gameData from '../data/gameData.json';

// Helper function to safely add a word to inventory
function safeAddToInventory(inventory: Word[], word: Word): void {
  if (!inventory.some(w => w.id === word.id)) {
    inventory.push(word);
  }
}

function generateLevelId(levelIndex: number): string {
  return `level_${levelIndex + 1}`;
}

function generateSectionId(levelIndex: number, sectionIndex: number): string {
  return `section_${levelIndex + 1}_${sectionIndex + 1}`;
}

function generateSlotId(levelIndex: number, sectionIndex: number, slotIndex: number): string {
  return `slot_${levelIndex + 1}_${sectionIndex + 1}_${slotIndex + 1}`;
}

export function parseGameData(): GameState {
  const rawData = gameData as unknown as RawGameData;
  
  return {
    levels: rawData.levels.map((level, levelIndex) => {
      // Ensure name is always a string
      const levelName = level.name ?? `Level ${levelIndex + 1}`;
      const levelInventory: Word[] = [];
      
      return {
        id: generateLevelId(levelIndex),
        name: levelName,
        sections: level.sections.map((section, sectionIndex) => {
          // Ensure section name is always a string
          const sectionName = section.name ?? `Section ${sectionIndex + 1}`;
          const isFirstSection = levelIndex === 0 && sectionIndex === 0;
          
          if (isFirstSection) {
            // Add first section words to inventory
            section.words.forEach(word => {
              safeAddToInventory(levelInventory, { ...word });
            });
            
            return {
              id: generateSectionId(levelIndex, sectionIndex),
              name: sectionName,
              slots: section.slots.map((hintId, slotIndex) => ({
                id: generateSlotId(levelIndex, sectionIndex, slotIndex),
                hintId,
                currentWord: null
              })),
              availableWords: [], // Empty since words are in inventory
              isUnlocked: true
            };
          }
          
          return {
            id: generateSectionId(levelIndex, sectionIndex),
            name: sectionName,
            slots: section.slots.map((hintId, slotIndex) => ({
              id: generateSlotId(levelIndex, sectionIndex, slotIndex),
              hintId,
              currentWord: null
            })),
            availableWords: section.words,
            isUnlocked: false
          };
        }),
        inventory: levelInventory,
        solutions: []
      };
    }),
    currentLevel: null,
    inventory: [],
    hints: rawData.hints,
    tutorials: {
      mainTutorialCompleted: false,
      sectionTutorialCompleted: false,
      hintTutorialCompleted: false
    },
    levelProgress: {}
  };
} 