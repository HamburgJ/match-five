import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GameState, Word } from './types';
import { initialGameState } from './initialState';

const gameSlice = createSlice({
  name: 'game',
  initialState: initialGameState,
  reducers: {
    setCurrentWorld: (state, action: PayloadAction<string | null>) => {
      state.currentWorld = action.payload;
      state.currentLevel = null;
    },
    setCurrentLevel: (state, action: PayloadAction<string | null>) => {
      state.currentLevel = action.payload;
    },
    addToInventory: (state, action: PayloadAction<{
      worldId: string,
      levelId: string,
      word: Word,
      sourceWorldId?: string,
      sourceLevelId?: string
    }>) => {
      const { worldId, levelId, word, sourceWorldId, sourceLevelId } = action.payload;
      const world = state.worlds.find(w => w.id === worldId);
      const level = world?.levels.find(l => l.id === levelId);
      
      if (level) {
        // Clean up source location if provided
        if (sourceWorldId && sourceLevelId) {
          const sourceWorld = state.worlds.find(w => w.id === sourceWorldId);
          const sourceLevel = sourceWorld?.levels.find(l => l.id === sourceLevelId);
          if (sourceLevel) {
            // Clean up from slots
            sourceLevel.slots.forEach(slot => {
              if (slot.currentWord?.id === word.id) {
                slot.currentWord = null;
              }
            });
            // Clean up from available words
            sourceLevel.availableWords = sourceLevel.availableWords.filter(w => w.id !== word.id);
          }
        }

        // Remove word from available words
        level.availableWords = level.availableWords.filter(w => w.id !== word.id);
        // Add to inventory if not already there
        if (!state.inventory.some(w => w.id === word.id)) {
          state.inventory.push(word);
        }
      }
    },
    removeFromInventory: (state, action: PayloadAction<string>) => {
      state.inventory = state.inventory.filter(word => word.id !== action.payload);
    },
    placeWord: (state, action: PayloadAction<{
      worldId: string,
      levelId: string,
      slotId: string,
      word: Word,
      sourceWorldId?: string,
      sourceLevelId?: string
    }>) => {
      const { worldId, levelId, slotId, word, sourceWorldId, sourceLevelId } = action.payload;
      
      const world = state.worlds.find(w => w.id === worldId);
      const level = world?.levels.find(l => l.id === levelId);
      
      if (!level) return;
      
      // Clean up source location
      if (sourceWorldId && sourceLevelId) {
        const sourceWorld = state.worlds.find(w => w.id === sourceWorldId);
        const sourceLevel = sourceWorld?.levels.find(l => l.id === sourceLevelId);
        if (sourceLevel) {
          // Clean up from slots
          sourceLevel.slots.forEach(slot => {
            if (slot.currentWord?.id === word.id) {
              slot.currentWord = null;
            }
          });
          // Clean up from available words
          sourceLevel.availableWords = sourceLevel.availableWords.filter(w => w.id !== word.id);
        }
      }
      
      // Remove from available words if it's there
      level.availableWords = level.availableWords.filter(w => w.id !== word.id);
      
      // Remove from inventory if it's there
      state.inventory = state.inventory.filter(w => w.id !== word.id);
      
      // Remove from any slot in the target level
      level.slots.forEach(slot => {
        if (slot.currentWord?.id === word.id) {
          slot.currentWord = null;
        }
      });

      // Place word in new location
      if (slotId === 'inventory') {
        if (!state.inventory.some(w => w.id === word.id)) {
          state.inventory.push(word);
        }
      } else {
        const slot = level.slots.find(s => s.id === slotId);
        if (slot) {
          if (slot.currentWord) {
            state.inventory.push(slot.currentWord);
          }
          slot.currentWord = word;
        }
      }
    },
    checkSolution: (state) => {
      const world = state.worlds.find(w => w.id === state.currentWorld);
      const level = world?.levels.find(l => l.id === state.currentLevel);
      
      if (!level || !world) return;
      
      const levelIndex = world.levels.findIndex(l => l.id === level.id);
      
      // Check if current level is completed
      const isCurrentLevelComplete = level.slots.every(slot => 
        slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
      );

      if (isCurrentLevelComplete) {
        // Mark current level as completed
        level.isCompleted = true;
        
        // Check if all previous levels are completed
        const allPreviousLevelsCompleted = world.levels
          .slice(0, levelIndex + 1)
          .every(level => 
            level.slots.every(slot => 
              slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
            )
          );

        if (allPreviousLevelsCompleted) {
          // Unlock next level if exists
          if (levelIndex >= 0 && levelIndex < world.levels.length - 1) {
            world.levels[levelIndex + 1].isUnlocked = true;
          }
          
          // Check if all levels in world are completed
          const allLevelsCompleted = world.levels.every(l => 
            l.slots.every(slot => 
              slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
            )
          );

          if (allLevelsCompleted) {
            world.isCompleted = true;
            
            // Find and unlock next world if exists
            const worldIndex = state.worlds.findIndex(w => w.id === world.id);
            if (worldIndex >= 0 && worldIndex < state.worlds.length - 1) {
              state.worlds[worldIndex + 1].isUnlocked = true;
            }
          }

          // Save progress to localStorage
          const gameState = {
            completedLevels: world.levels
              .filter(l => l.isCompleted)
              .map(l => ({ worldId: world.id, levelId: l.id })),
            unlockedLevels: world.levels
              .filter(l => l.isUnlocked)
              .map(l => ({ worldId: world.id, levelId: l.id }))
          };
          localStorage.setItem('gameProgress', JSON.stringify(gameState));
        }
      }
    },
    goBack: (state) => {
      if (state.currentLevel) {
        state.currentLevel = null;
      } else if (state.currentWorld) {
        state.currentWorld = null;
      }
    },
    loadSavedProgress: (state) => {
      const savedProgress = localStorage.getItem('gameProgress');
      if (savedProgress) {
        const { completedLevels, unlockedLevels } = JSON.parse(savedProgress);
        
        // Restore completed and unlocked states
        completedLevels.forEach(({ worldId, levelId }: { worldId: string, levelId: string }) => {
          const world = state.worlds.find(w => w.id === worldId);
          const level = world?.levels.find(l => l.id === levelId);
          if (level) {
            level.isCompleted = true;
          }
        });

        unlockedLevels.forEach(({ worldId, levelId }: { worldId: string, levelId: string }) => {
          const world = state.worlds.find(w => w.id === worldId);
          const level = world?.levels.find(l => l.id === levelId);
          if (level) {
            level.isUnlocked = true;
          }
        });
      }
    },
  }
});

export const { 
  setCurrentWorld, 
  setCurrentLevel, 
  addToInventory, 
  removeFromInventory,
  placeWord,
  checkSolution,
  goBack,
  loadSavedProgress,
} = gameSlice.actions;

export default gameSlice.reducer; 