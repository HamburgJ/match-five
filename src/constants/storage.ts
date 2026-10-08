// redux-persist saves the classic game under `persist:${GAME_PROGRESS_KEY}`.
// v2 (2026-10): the v1 save copied every clue list and level, and those copies
// overrode the shipped data, so corrected clue lists never reached returning
// players. store/persistence.ts moves a v1 save over once and drops the copies.
export const GAME_PROGRESS_KEY = 'match_five_progress_v2';
export const GAME_PROGRESS_STORAGE_KEY = `persist:${GAME_PROGRESS_KEY}`;
export const LEGACY_GAME_PROGRESS_STORAGE_KEY = 'persist:match_five_progress';
export const DEVELOPER_MODE = false; // Set to false for production
