import { configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { GAME_PROGRESS_KEY } from '../constants/storage';
import gameReducer from './gameSlice';

const persistedReducer = persistReducer(
  {
    key: GAME_PROGRESS_KEY,
    storage,
  },
  gameReducer,
);

export const store = configureStore({
  reducer: { game: persistedReducer },
  middleware: getDefaultMiddleware => getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: ['persist/FLUSH', 'persist/REHYDRATE', 'persist/PAUSE', 'persist/PERSIST', 'persist/PURGE', 'persist/REGISTER'],
    },
  }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
