import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { loggingMiddleware } from './gameSlice';
import { persistStore, persistReducer, PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { GameState } from './types';
import {
    GAME_PROGRESS_KEY,
    GAME_PROGRESS_STORAGE_KEY,
    LEGACY_GAME_PROGRESS_STORAGE_KEY
} from '../constants/storage';
import { migrateLegacyProgress, PERSIST_VERSION, reconcileProgress } from './persistence';

// Move a v1 save to the v2 key before redux-persist reads it. Reaching
// localStorage can itself throw (blocked storage); then there is nothing to move.
try {
    migrateLegacyProgress(window.localStorage, GAME_PROGRESS_STORAGE_KEY, LEGACY_GAME_PROGRESS_STORAGE_KEY);
} catch {
    // No storage: the game runs without saving, as before.
}

const persistConfig: PersistConfig<GameState> = {
    key: GAME_PROGRESS_KEY,
    version: PERSIST_VERSION,
    storage,
    // Clue lists are shipped data, never player state, so they are never saved.
    blacklist: ['hints'],
    // Only what the player did comes back from a save, laid over the shipped
    // clues and levels (persistence.ts).
    stateReconciler: (inbound, _original, reduced) => reconcileProgress(inbound, reduced),
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
