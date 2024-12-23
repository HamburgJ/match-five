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

function generateWordId(levelIndex: number, sectionIndex: number, wordIndex: number): string {
  return `word_${levelIndex + 1}_${sectionIndex + 1}_${wordIndex + 1}`;
}

function transformGameData(data: RawGameData): Level[] {
  return data.levels.map((level, levelIndex) => ({
    id: generateLevelId(levelIndex),
    name: level.name,
    sections: level.sections.map((section, sectionIndex) => ({
      id: generateSectionId(levelIndex, sectionIndex),
      name: section.name,
      slots: section.slots.map((hintId, slotIndex) => ({
        id: generateSlotId(levelIndex, sectionIndex, slotIndex),
        hintId,
        currentWord: null
      })),
      availableWords: section.words.map((word, wordIndex) => ({
        id: generateWordId(levelIndex, sectionIndex, wordIndex),
        text: word
      })),
      isComplete: false,
      // Only first section of first level is unlocked initially
      isUnlocked: levelIndex === 0 && sectionIndex === 0
    })),
    isComplete: false,
    inventory: []
  }));
}

const initialState: GameState = {
  levels: transformGameData(gameData as RawGameData),
  currentLevel: null,
  currentSection: null,
  hints: gameData.hints,
  inventory: []
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setCurrentLevel: (state, action: PayloadAction<string>) => {
      state.currentLevel = action.payload;
    },
    setCurrentSection: (state, action: PayloadAction<string>) => {
      state.currentSection = action.payload;
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
      
      // Remove from source location first
      const sourceLevel = state.levels.find(w => w.id === sourceLevelId);
      const sourceSection = sourceLevel?.sections.find(l => l.id === sourceSectionId);
      
      // Remove from level inventory if it was there
      if (sourceLevel) {
        sourceLevel.inventory = sourceLevel.inventory.filter(w => w.id !== word.id);
      }

      // Remove from source section if applicable
      if (sourceSection) {
        // Remove from slots if it was in a slot
        sourceSection.slots = sourceSection.slots.map(slot => ({
          ...slot,
          currentWord: slot.currentWord?.id === word.id ? null : slot.currentWord
        }));
        // Remove from available words if it was there
        sourceSection.availableWords = sourceSection.availableWords.filter(w => w.id !== word.id);
      }

      // Handle moving to inventory
      if (slotId === 'inventory') {
        const targetLevel = state.levels.find(w => w.id === levelId);
        if (targetLevel && !targetLevel.inventory.some(w => w.id === word.id)) {
          targetLevel.inventory.push(word);
        }
        return;
      }

      // Handle placing in slot
      const targetLevel = state.levels.find(w => w.id === levelId);
      const targetSection = targetLevel?.sections.find(l => l.id === sectionId);
      if (targetSection) {
        // Place in new slot
        targetSection.slots = targetSection.slots.map(slot => ({
          ...slot,
          currentWord: slot.id === slotId ? word : slot.currentWord
        }));
      }
    },
    addToInventory: (state, action: PayloadAction<{
      levelId: string;
      sectionId: string;
      word: Word;
      sourceLevelId: string;
      sourceSectionId: string;
    }>) => {
      const { word, sourceLevelId, sourceSectionId, levelId } = action.payload;
      
      // Add to target level's inventory if not already there
      const targetLevel = state.levels.find(w => w.id === levelId);
      if (targetLevel && !targetLevel.inventory.some(w => w.id === word.id)) {
        targetLevel.inventory.push(word);
      }
      
      // Remove from source section's available words
      const sourceLevel = state.levels.find(w => w.id === sourceLevelId);
      const sourceSection = sourceLevel?.sections.find(l => l.id === sourceSectionId);
      if (sourceSection) {
        sourceSection.availableWords = sourceSection.availableWords.filter(w => w.id !== word.id);
      }
    },
    removeFromInventory: (state, action: PayloadAction<{
      word: Word;
      targetLevelId: string;
      targetSectionId: string;
    }>) => {
      const { word, targetLevelId, targetSectionId } = action.payload;
      
      // Remove from level inventory
      const level = state.levels.find(w => w.id === targetLevelId);
      if (level) {
        level.inventory = level.inventory.filter(w => w.id !== word.id);
      }
      
      // Add back to target section's available words
      const targetSection = level?.sections.find(l => l.id === targetSectionId);
      if (targetSection && !targetSection.availableWords.some(w => w.id === word.id)) {
        targetSection.availableWords.push(word);
      }
    },
    checkSolution: (state) => {
      // Solution checking is now handled in the component
    },
    markSectionComplete: (state, action: PayloadAction<{
      levelId: string;
      sectionId: string;
    }>) => {
      const { levelId, sectionId } = action.payload;
      const level = state.levels.find(w => w.id === levelId);
      if (!level) return;
      
      const section = level.sections.find(l => l.id === sectionId);
      if (!section) return;

      section.isComplete = true;
      
      // Unlock next section in the same level if it exists
      const sectionIndex = level.sections.findIndex(l => l.id === sectionId);
      if (sectionIndex < level.sections.length - 1) {
        level.sections[sectionIndex + 1].isUnlocked = true;
      } else {
        // If this was the last section in the level
        level.isComplete = true;
        // Find and unlock first section of next level if it exists
        const levelIndex = state.levels.findIndex(w => w.id === levelId);
        if (levelIndex < state.levels.length - 1) {
          state.levels[levelIndex + 1].sections[0].isUnlocked = true;
        }
      }
    }
  }
});

export const { 
  setCurrentLevel, 
  setCurrentSection, 
  placeWord, 
  addToInventory,
  removeFromInventory,
  checkSolution,
  markSectionComplete 
} = gameSlice.actions;

export default gameSlice.reducer; 