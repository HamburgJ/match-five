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
      word: Word
    }>) => {
      const { worldId, levelId, word } = action.payload;
      const world = state.worlds.find(w => w.id === worldId);
      const level = world?.levels.find(l => l.id === levelId);
      
      if (level) {
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
      word: Word
    }>) => {
      const { worldId, levelId, slotId, word } = action.payload;
      
      const world = state.worlds.find(w => w.id === worldId);
      const level = world?.levels.find(l => l.id === levelId);
      
      if (!level) return;
      
      // Remove from available words if it's there
      level.availableWords = level.availableWords.filter(w => w.id !== word.id);
      
      // Remove from inventory if it's there
      state.inventory = state.inventory.filter(w => w.id !== word.id);
      
      // Remove from any slot if it's there
      level.slots.forEach(slot => {
        if (slot.currentWord?.id === word.id) {
          slot.currentWord = null;
        }
      });

      // Place word in new location
      if (slotId === 'inventory') {
        // Add to inventory if not already there
        if (!state.inventory.some(w => w.id === word.id)) {
          state.inventory.push(word);
        }
      } else {
        const slot = level.slots.find(s => s.id === slotId);
        if (slot) {
          // If there's a word in the target slot, move it to inventory
          if (slot.currentWord) {
            state.inventory.push(slot.currentWord);
          }
          slot.currentWord = word;
        }
      }
    },
    unlockNextLevel: (state, action: PayloadAction<{worldId: string, levelId: string}>) => {
      const { worldId, levelId } = action.payload;
      const world = state.worlds.find(w => w.id === worldId);
      if (world) {
        const currentLevel = world.levels.find(l => l.id === levelId);
        if (currentLevel) {
          currentLevel.isCompleted = true;
          
          const levelIndex = world.levels.findIndex(l => l.id === levelId);
          if (levelIndex >= 0 && levelIndex < world.levels.length - 1) {
            world.levels[levelIndex + 1].isUnlocked = true;
          }
          
          // Check if all levels in world are completed
          const allLevelsCompleted = world.levels.every(l => l.isCompleted);
          if (allLevelsCompleted) {
            world.isCompleted = true;
            
            // Find and unlock next world if exists
            const worldIndex = state.worlds.findIndex(w => w.id === worldId);
            if (worldIndex >= 0 && worldIndex < state.worlds.length - 1) {
              state.worlds[worldIndex + 1].isUnlocked = true;
            }
          }
        }
      }
    },
    checkSolution: (state) => {
      const world = state.worlds.find(w => w.id === state.currentWorld);
      const level = world?.levels.find(l => l.id === state.currentLevel);
      
      if (!level || !world) return;
      
      const allCorrect = level.slots.every(slot => 
        slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
      );
      
      // Update completion status
      level.isCompleted = allCorrect;
      
      // Don't modify unlock status if level was previously completed
      if (allCorrect) {
        const levelIndex = world.levels.findIndex(l => l.id === level.id);
        if (levelIndex >= 0 && levelIndex < world.levels.length - 1) {
          world.levels[levelIndex + 1].isUnlocked = true;
        }
        
        // Check if all levels in world are completed
        const allLevelsCompleted = world.levels.every(l => l.isCompleted);
        if (allLevelsCompleted) {
          world.isCompleted = true;
          
          // Find and unlock next world if exists
          const worldIndex = state.worlds.findIndex(w => w.id === world.id);
          if (worldIndex >= 0 && worldIndex < state.worlds.length - 1) {
            state.worlds[worldIndex + 1].isUnlocked = true;
          }
        } else {
          world.isCompleted = false;
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
  unlockNextLevel,
  checkSolution,
  goBack,
  loadSavedProgress,
} = gameSlice.actions;

export default gameSlice.reducer; 