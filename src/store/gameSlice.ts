import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import gameData from '../data/gameData.json';
import { Word, GameState, Section, Level, Slot, RawGameData } from './types';

function generateLevelId(levelIndex: number): string {
  return `level_${levelIndex + 1}`;
}

function generateSectionId(levelIndex: number, sectionIndex: number): string {
  return `section_${levelIndex + 1}_${sectionIndex + 1}`;
}

function generateSlotId(levelIndex: number, sectionIndex: number, slotIndex: number): string {
  return `slot_${levelIndex + 1}_${sectionIndex + 1}_${slotIndex + 1}`;
}

// Helper function to safely add a word to inventory
function safeAddToInventory(inventory: Word[], word: Word): void {
  if (!inventory.some(w => w.id === word.id)) {
    inventory.push(word);
  }
}

function transformGameData(data: RawGameData): Level[] {
  return data.levels.map((level, levelIndex) => {
    const levelInventory: Word[] = [];
    
    const sections = level.sections.map((section, sectionIndex) => {
      const isFirstSection = sectionIndex === 0;
      
      // Use pre-generated word IDs from gameData
      const sectionWords = section.words;
      
      if (isFirstSection) {
        // Add words to inventory for first section
        sectionWords.forEach(word => {
          safeAddToInventory(levelInventory, { ...word });
        });
        // First section's words start in inventory, not availableWords
        return {
          id: generateSectionId(levelIndex, sectionIndex),
          name: section.name ?? `Section ${sectionIndex + 1}`,
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
        name: section.name ?? `Section ${sectionIndex + 1}`,
        slots: section.slots.map((hintId, slotIndex) => ({
          id: generateSlotId(levelIndex, sectionIndex, slotIndex),
          hintId,
          currentWord: null
        })),
        availableWords: sectionWords,
        isUnlocked: false
      };
    });

    return {
      id: generateLevelId(levelIndex),
      name: level.name ?? `Level ${levelIndex + 1}`,
      sections,
      inventory: levelInventory,
      solutions: []
    };
  });
}

const initialState: GameState = {
  levels: transformGameData(gameData as unknown as RawGameData),
  currentLevel: null,
  hints: gameData.hints,
  inventory: [],
  tutorials: {
    mainTutorialCompleted: false,
    sectionTutorialCompleted: false,
    hintTutorialCompleted: false
  },
  levelProgress: {}
};

function checkLevelCompletion(level: Level, state: GameState): { isComplete: boolean; solution: string | null } {
  // First check if all sections are unlocked
  const allSectionsUnlocked = level.sections.every(section => section.isUnlocked);
  if (!allSectionsUnlocked) {
    console.log(`[Level Check] Level not complete - not all sections unlocked`);
    return { isComplete: false, solution: null };
  }

  // Then check if all sections have correct words
  const allSectionsCorrect = level.sections.every(section =>
    section.slots.every(slot => {
      const hint = state.hints[slot.hintId];
      return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
    })
  );
  
  if (allSectionsCorrect) {
    // Create solution string from current arrangement
    const solution = level.sections
      .flatMap(section => section.slots)
      .map(slot => slot.currentWord?.text)
      .join(',');
    
    console.log(`[Level Check] Level complete - all sections unlocked and correct`);
    return { isComplete: true, solution };
  }
  
  console.log(`[Level Check] Level not complete - some sections have incorrect words`);
  return { isComplete: false, solution: null };
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setCurrentLevel: (state, action: PayloadAction<string>) => {
      state.currentLevel = action.payload;
    },
    setCurrentSection: (state, action: PayloadAction<{
      levelId: string;
      sectionId: string;
      isUnlocked: boolean;
      wordsToAdd?: Word[];
    }>) => {
      const { levelId, sectionId, isUnlocked, wordsToAdd } = action.payload;
      
      const level = state.levels.find(l => l.id === levelId);
      if (!level) return;
      
      const section = level.sections.find(s => s.id === sectionId);
      if (!section) return;
      
      section.isUnlocked = isUnlocked;

      // Only add words to inventory if they haven't been added before
      if (wordsToAdd && !state.levelProgress[levelId]?.sections[sectionId]?.isUnlocked) {
        level.inventory.push(...wordsToAdd);
        section.availableWords = [];
      }

      // Update level progress
      if (!state.levelProgress[levelId]) {
        state.levelProgress[levelId] = {
          solutions: [],
          sections: {},
          inventory: level.inventory
        };
      }
      
      state.levelProgress[levelId].sections[sectionId] = {
        isUnlocked,
        slots: {},
        availableWords: []  // Always empty since words are moved to inventory
      };
    },
    saveSolution: (state, action: PayloadAction<{
      levelId: string;
      solution: string;
    }>) => {
      const { levelId, solution } = action.payload;
      if (!state.levelProgress[levelId]) {
        state.levelProgress[levelId] = {
          solutions: [],
          sections: {},
          inventory: []
        };
      }
      if (!state.levelProgress[levelId].solutions.includes(solution)) {
        state.levelProgress[levelId].solutions.push(solution);
      }
    },
    completeTutorial: (state, action: PayloadAction<{
      type: 'main' | 'section' | 'hint';
    }>) => {
      const { type } = action.payload;
      switch (type) {
        case 'main':
          state.tutorials.mainTutorialCompleted = true;
          break;
        case 'section':
          state.tutorials.sectionTutorialCompleted = true;
          break;
        case 'hint':
          state.tutorials.hintTutorialCompleted = true;
          break;
      }
    },
    placeWord: (state, action: PayloadAction<{
      levelId: string;
      sectionId: string;
      slotId: string;
      word: Word;
      sourceLevelId: string;
      sourceSectionId: string;
    }>) => {
      const { levelId, sectionId, slotId, word, sourceLevelId, sourceSectionId } = action.payload;
      
      const level = state.levels.find(l => l.id === levelId);
      if (!level) return;

      // Helper function to check if all words in a section are correct
      const areSectionWordsCorrect = (section: Section): boolean => {
        return section.slots.every(slot => {
          const hint = state.hints[slot.hintId];
          return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
        });
      };

      // Helper function to check if we have a new solution
      const checkForNewSolution = (level: Level): boolean => {
        // Check if all sections have correct words
        const allSectionsCorrect = level.sections.every(areSectionWordsCorrect);
        
        if (allSectionsCorrect) {
          // Create solution string from current arrangement
          const solution = level.sections
            .flatMap(section => section.slots)
            .map(slot => slot.currentWord?.text)
            .join(',');
          
          // Check if this is a new solution
          if (!level.solutions.includes(solution)) {
            level.solutions.push(solution);
            
            // Unlock next level's first section if it exists
            const levelIndex = state.levels.findIndex(l => l.id === levelId);
            if (levelIndex < state.levels.length - 1) {
              state.levels[levelIndex + 1].sections[0].isUnlocked = true;
            }
            return true;
          }
        }
        return false;
      };

      // Handle destination placement
      const section = level.sections.find(s => s.id === sectionId);
      if (!section) return;

      if (slotId === 'inventory') {
        // Only check for duplicates if we're moving from inventory to inventory
        const isInventoryToInventory = !sourceSectionId && level.inventory.some(w => w.id === word.id);
        if (!isInventoryToInventory) {
          safeAddToInventory(level.inventory, word);
        }
        
        // Remove from source if it was in available words or a slot
        if (sourceSectionId) {
          const sourceSection = level.sections.find(s => s.id === sourceSectionId);
          if (sourceSection) {
            // Remove from available words if it was there
            sourceSection.availableWords = sourceSection.availableWords.filter(w => w.id !== word.id);
            
            // Remove from slot if it was in a slot
            const sourceSlot = sourceSection.slots.find(s => s.currentWord?.id === word.id);
            if (sourceSlot) {
              sourceSlot.currentWord = null;
            }
          }
        }
      } else {
        const targetSlot = section.slots.find(s => s.id === slotId);
        if (!targetSlot) return;

        if (sourceSectionId) {
          const sourceSection = level.sections.find(s => s.id === sourceSectionId);
          if (sourceSection) {
            const sourceSlot = sourceSection.slots.find(s => s.currentWord?.id === word.id);
            if (sourceSlot && sourceSlot.currentWord) {
              if (targetSlot.currentWord) {
                const tempWord = targetSlot.currentWord;
                targetSlot.currentWord = sourceSlot.currentWord;
                sourceSlot.currentWord = tempWord;
              } else {
                targetSlot.currentWord = sourceSlot.currentWord;
                sourceSlot.currentWord = null;
              }
            }
          }
        } else {
          const currentWord = targetSlot.currentWord;
          if (currentWord) {
            safeAddToInventory(level.inventory, currentWord);
          }
          targetSlot.currentWord = word;
          
          // Remove word from inventory or available words
          let indexToRemove = level.inventory.findIndex(w => w.id === word.id);
          if (indexToRemove !== -1) {
            level.inventory.splice(indexToRemove, 1);
          } else {
            indexToRemove = state.inventory.findIndex(w => w.id === word.id);
            if (indexToRemove !== -1) {
              state.inventory.splice(indexToRemove, 1);
            } else {
              // Remove from available words in all sections
              level.sections.forEach(s => {
                s.availableWords = s.availableWords.filter(w => w.id !== word.id);
              });
            }
          }
        }
      }

      // After word placement, check if this unlocks the next section
      const sectionIndex = level.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex < level.sections.length - 1) {
        // Get the index of the first unlocked section that has an invalid word
        const firstInvalidSectionIndex = level.sections.findIndex(section => {
          if (!section.isUnlocked) return false;
          
          // Check if all slots have valid words
          return !section.slots.every(slot => {
            const hint = state.hints[slot.hintId];
            return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
          });
        });

        // If we found an invalid section before our current section, don't unlock next
        if (firstInvalidSectionIndex !== -1 && firstInvalidSectionIndex <= sectionIndex) {
          return;
        }

        // Check all unlocked sections up to current section
        const allPreviousSectionsValid = level.sections
          .slice(0, sectionIndex + 1)  // Check ALL sections up to current one
          .every(section => {
            // 1. All slots must have words
            const allSlotsHaveWords = section.slots.every(slot => slot.currentWord !== null);
            if (!allSlotsHaveWords) return false;

            // 2. All words must be valid matches for their slots
            return section.slots.every(slot => {
              const hint = state.hints[slot.hintId];
              return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
            });
          });

        console.log(`[Section Unlock Check] Validating sections 0 to ${sectionIndex}:`, {
          levelId,
          sectionId,
          allPreviousSectionsValid,
          sectionsState: level.sections.slice(0, sectionIndex + 1).map((s, i) => ({
            sectionIndex: i,
            isComplete: s.slots.every(slot => {
              const hint = state.hints[slot.hintId];
              return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
            })
          }))
        });
        
        if (allPreviousSectionsValid) {
          const nextSection = level.sections[sectionIndex + 1];
          if (nextSection && !nextSection.isUnlocked) {
            const levelNum = parseInt(levelId.split('_')[1]) - 1;
            const originalWords = gameData.levels[levelNum].sections[sectionIndex + 1].words;
            
            nextSection.isUnlocked = true;
            console.log(`[Section Unlock] Level ${levelId}, Section ${nextSection.id} unlocked`);
            console.log(`[Section Unlock] Current level state:`, {
              levelId,
              currentSectionId: sectionId,
              nextSectionId: nextSection.id,
              allPreviousSectionsValid,
              levelProgress: state.levelProgress[levelId]
            });
            
            // Safely add each word to inventory
            originalWords.forEach(word => {
              safeAddToInventory(level.inventory, word);
            });
            nextSection.availableWords = [];
          }
        }
      }

      // Update level progress
      if (!state.levelProgress[levelId]) {
        state.levelProgress[levelId] = {
          solutions: [],
          sections: {},
          inventory: []
        };
      }
      
      state.levelProgress[levelId].sections[sectionId] = {
        isUnlocked: section.isUnlocked,
        slots: section.slots.reduce((acc, slot) => ({
          ...acc,
          [slot.id]: { currentWord: slot.currentWord }
        }), {}),
        availableWords: []  // Always empty since words are moved to inventory
      };
      
      state.levelProgress[levelId].inventory = level.inventory;
    },
    checkSectionUnlocks: (state, action: PayloadAction<{
      levelId: string;
    }>) => {
      const { levelId } = action.payload;
      const level = state.levels.find(l => l.id === levelId);
      if (!level) return;

      // Check each section except the last one
      level.sections.forEach((section, sectionIndex) => {
        if (sectionIndex === level.sections.length - 1) return;

        // Check all sections up to current one must be complete
        const allPreviousSectionsValid = level.sections
          .slice(0, sectionIndex + 1)
          .every(section => {
            // 1. All slots must have words
            const allSlotsHaveWords = section.slots.every(slot => slot.currentWord !== null);
            if (!allSlotsHaveWords) return false;

            // 2. All words must be valid matches for their slots
            return section.slots.every(slot => {
              const hint = state.hints[slot.hintId];
              return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
            });
          });

        console.log(`[Section Unlock Check] Validating sections 0 to ${sectionIndex}:`, {
          levelId,
          sectionIndex,
          allPreviousSectionsValid,
          sectionsState: level.sections.slice(0, sectionIndex + 1).map((s, i) => ({
            sectionIndex: i,
            id: s.id,
            isComplete: s.slots.every(slot => {
              const hint = state.hints[slot.hintId];
              return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
            })
          }))
        });

        if (allPreviousSectionsValid) {
          const nextSection = level.sections[sectionIndex + 1];
          if (nextSection && !nextSection.isUnlocked) {
            const levelNum = parseInt(levelId.split('_')[1]) - 1;
            const originalWords = gameData.levels[levelNum].sections[sectionIndex + 1].words;
            
            nextSection.isUnlocked = true;
            console.log(`[Section Unlock] Level ${levelId}, Section ${nextSection.id} unlocked`);
            
            // Safely add each word to inventory
            originalWords.forEach(word => {
              safeAddToInventory(level.inventory, word);
            });
            nextSection.availableWords = [];

            // Update level progress
            if (!state.levelProgress[levelId]) {
              state.levelProgress[levelId] = {
                solutions: [],
                sections: {},
                inventory: []
              };
            }
            
            state.levelProgress[levelId].sections[nextSection.id] = {
              isUnlocked: true,
              slots: {},
              availableWords: []
            };
          }
        }
      });

      // Check for level completion
      const { isComplete: levelIsComplete, solution: levelSolution } = checkLevelCompletion(level, state);
      if (levelIsComplete && levelSolution) {
        console.log(`[Level Complete] Solution found for level ${levelId}:`, levelSolution);
        
        // Always add the current solution to track current state
        level.solutions = [levelSolution];
        
        // Update level progress to maintain unique solutions
        if (!state.levelProgress[levelId]) {
          state.levelProgress[levelId] = {
            solutions: [],
            sections: {},
            inventory: []
          };
        }
        if (!state.levelProgress[levelId].solutions.includes(levelSolution)) {
          state.levelProgress[levelId].solutions.push(levelSolution);
        }
      } else {
        // Clear solutions when level is not complete
        level.solutions = [];
      }
    },
    resetLevel: (state, action: PayloadAction<{
      levelId: string;
    }>) => {
      const { levelId } = action.payload;
      const level = state.levels.find(l => l.id === levelId);
      if (!level) return;

      // Get the level index to access original data
      const levelIndex = parseInt(levelId.split('_')[1]) - 1;
      const originalLevelData = gameData.levels[levelIndex];

      // Reset inventory to original first section words
      level.inventory = originalLevelData.sections[0].words.map(word => ({ ...word }));

      // Reset sections
      level.sections = level.sections.map((section, sectionIndex) => {
        const isFirstSection = sectionIndex === 0;
        const originalSectionData = originalLevelData.sections[sectionIndex];

        return {
          ...section,
          isUnlocked: isFirstSection, // Only first section starts unlocked
          slots: section.slots.map(slot => ({
            ...slot,
            currentWord: null // Clear all words
          })),
          // First section's words are in inventory, others have their original words
          availableWords: isFirstSection ? [] : originalSectionData.words.map(word => ({ ...word }))
        };
      });

      // Update level progress to maintain completion status but reset current state
      if (state.levelProgress[levelId]) {
        state.levelProgress[levelId] = {
          ...state.levelProgress[levelId],
          sections: {}, // Clear current section progress
          inventory: level.inventory // Reset to initial inventory
        };
        // Note: We keep the solutions array intact to maintain completion status
      }
    }
  }
});

// Create a separate logging middleware
export const loggingMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);
  const state = store.getState().game;
  
  if (!action.type.includes('@@redux/INIT') && !action.type.includes('persist')) {
    console.log(`[STATE CHANGE] Action: ${action.type}`);
    state.levels.forEach((level: Level, levelIndex: number) => {
      console.log(`Level ${levelIndex + 1} sections unlock state:`, 
        level.sections.map((s, i) => `Section ${i + 1}: ${s.isUnlocked}`));
    });
  }
  
  return result;
};

export const { 
  setCurrentLevel, 
  setCurrentSection, 
  placeWord,
  saveSolution,
  completeTutorial,
  checkSectionUnlocks,
  resetLevel
} = gameSlice.actions;

export default gameSlice.reducer; 