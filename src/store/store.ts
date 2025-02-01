import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { loggingMiddleware } from './gameSlice';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { GameProgress, Section, Level, HintDictionary } from './types';
import { GAME_PROGRESS_KEY } from '../constants/storage';

// Helper to check if a section has all correct words
const areSectionWordsCorrect = (section: Section, hints: HintDictionary): boolean => {
    return section.slots.every(slot => {
        const hint = hints[slot.hintId];
        return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
    });
};

// Update the level state with saved progress
const updateLevelWithProgress = (level: Level, levelProgress: GameProgress['levels'][string], hints: HintDictionary) => {
    return {
        ...level,
        inventory: levelProgress?.inventory || [],
        sections: level.sections.map((section, index) => {
            const sectionProgress = levelProgress?.sections[section.id];
            
            // If no progress exists, only first section should be unlocked
            if (!levelProgress || !sectionProgress) {
                return {
                    ...section,
                    isUnlocked: index === 0,
                    slots: section.slots.map(slot => ({
                        ...slot,
                        currentWord: null
                    }))
                };
            }

            return {
                ...section,
                isUnlocked: sectionProgress.isUnlocked,
                availableWords: sectionProgress.availableWords || section.availableWords,
                slots: section.slots.map(slot => ({
                    ...slot,
                    currentWord: sectionProgress.slots[slot.id]?.currentWord || null
                }))
            };
        })
    };
};

// Load saved game state
const loadSavedGameState = () => {
    try {
        const saved = localStorage.getItem(GAME_PROGRESS_KEY);
        console.log(`[STORE] Loading saved game state, exists: ${!!saved}`);
        if (!saved) return undefined;

        const progress: GameProgress = JSON.parse(saved);
        const initialState = gameReducer(undefined, { type: 'INIT' });
        
        console.log(`[STORE] Initial state before applying saved progress:`, 
            initialState.levels.map(level => ({
                levelId: level.id,
                sections: level.sections.map((s, i) => `Section ${i + 1}: ${s.isUnlocked}`)
            }))
        );
        
        const state = {
            game: {
                ...initialState,
                levels: initialState.levels.map(level => {
                    const levelProgress = progress.levels[level.id];
                    console.log(`[STORE] Processing level ${level.id}, has progress: ${!!levelProgress}`);
                    if (!levelProgress) return level;
                    const updatedLevel = updateLevelWithProgress(level, levelProgress, initialState.hints);
                    console.log(`[STORE] Updated level ${level.id} sections:`,
                        updatedLevel.sections.map((s, i) => `Section ${i + 1}: ${s.isUnlocked}`));
                    return updatedLevel;
                })
            }
        };
        
        console.log(`[STORE] Final state after loading:`, 
            state.game.levels.map(level => ({
                levelId: level.id,
                sections: level.sections.map((s, i) => `Section ${i + 1}: ${s.isUnlocked}`)
            }))
        );
        
        return state;
    } catch (error) {
        console.error('[STORE] Failed to load saved game state:', error);
        return undefined;
    }
};

const persistConfig = {
    key: GAME_PROGRESS_KEY,
    storage,
    blacklist: [] // Add any state properties you don't want to persist
};

const persistedReducer = persistReducer(persistConfig, gameReducer);

export const store = configureStore({
    reducer: {
        game: persistedReducer
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
            }
        }).concat(loggingMiddleware)
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch; 