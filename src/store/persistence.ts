// What the classic game saves, and how a save meets the shipped data.
//
// The v1 save (`persist:match_five_progress`) held the whole game slice,
// including every clue list and every level definition, and redux-persist let
// the saved copies replace the shipped ones on load. So a fixed clue list never
// reached a returning player: their browser kept the old one forever.
//
// v2 fixes that in three places:
// - migrateLegacyProgress moves a v1 save to the v2 key once, keeping only
//   what the player did (finished levels and tutorials seen) and dropping the
//   stored clue lists and levels;
// - the store never writes clue lists again (store.ts blacklists `hints`);
// - reconcileProgress, run on every load, takes only player state from a save
//   (unlocked sections, placed words, the tray, finished levels) and lays it
//   over the shipped clues and levels, so a later data fix needs no new key.
//
// Pure functions with no browser globals, so scripts/persistMigration.test.js
// can run them in Node.

import type { GameState, Level, Section, Slot, Word } from './types';

/** Written into the `_persist` record of every v2 save. */
export const PERSIST_VERSION = 2;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type LevelProgress = GameState['levelProgress'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWord = (value: unknown): value is Word =>
  isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string';

const LEVEL_ID = /^level_[0-9]+$/;

function readTutorials(value: unknown): GameState['tutorials'] {
  const saved = isRecord(value) ? value : {};
  return {
    mainTutorialCompleted: saved.mainTutorialCompleted === true,
    sectionTutorialCompleted: saved.sectionTutorialCompleted === true,
    hintTutorialCompleted: saved.hintTutorialCompleted === true,
  };
}

function readSolutions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * A v1 save, as redux-persist stored it (an object of JSON strings), turned into
 * a v2 save that keeps finished levels and tutorials and nothing else. Returns
 * null when the v1 save can't be read at all.
 */
export function legacyToCurrent(legacy: string): string | null {
  let outer: unknown;
  try {
    outer = JSON.parse(legacy);
  } catch {
    return null;
  }
  if (!isRecord(outer)) return null;
  const record = outer;
  const read = (key: string): unknown => {
    const value = record[key];
    if (typeof value !== 'string') return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };

  const levelProgress: LevelProgress = {};
  const savedProgress = read('levelProgress');
  if (isRecord(savedProgress)) {
    for (const [levelId, entry] of Object.entries(savedProgress)) {
      if (!LEVEL_ID.test(levelId) || !isRecord(entry)) continue;
      const solutions = readSolutions(entry.solutions);
      // A finished level stays finished (Level Select reads `solutions`). The
      // board snapshots beside it belong to the dropped levels and go too.
      if (solutions.length > 0) levelProgress[levelId] = { solutions, sections: {}, inventory: [] };
    }
  }

  return JSON.stringify({
    tutorials: JSON.stringify(readTutorials(read('tutorials'))),
    levelProgress: JSON.stringify(levelProgress),
    _persist: JSON.stringify({ version: PERSIST_VERSION, rehydrated: true }),
  });
}

export type MigrationResult = 'none' | 'migrated' | 'discarded' | 'failed';

/**
 * Move a v1 save to the v2 key, once. A v2 save that already exists always
 * wins. The v1 key is removed only after the v2 save is safely written, so a
 * full or blocked storage leaves it for the next visit.
 */
export function migrateLegacyProgress(
  storage: KeyValueStorage,
  storageKey: string,
  legacyKey: string
): MigrationResult {
  try {
    const legacy = storage.getItem(legacyKey);
    if (legacy === null) return 'none';
    let result: MigrationResult = 'discarded';
    if (storage.getItem(storageKey) === null) {
      const current = legacyToCurrent(legacy);
      if (current !== null) {
        storage.setItem(storageKey, current);
        result = 'migrated';
      }
    }
    storage.removeItem(legacyKey);
    return result;
  } catch {
    return 'failed';
  }
}

/**
 * The shipped level with the player's saved state laid over it. Only state a
 * player can create is taken from the save, and only when it is still
 * consistent with the shipped level:
 * - sections unlock in order, and a saved unlock is kept as a prefix;
 * - a placed word must be one of this level's words (same id and text), from
 *   an unlocked section, placed once;
 * - every word of an unlocked section ends up exactly once, on the board or in
 *   the tray, so no tile is ever lost or doubled;
 * - slot clues and section words always come from the shipped level.
 */
export function reconcileLevels(shipped: Level[], saved: unknown): Level[] {
  const savedLevels = Array.isArray(saved) ? saved.filter(isRecord) : [];
  return shipped.map((level) => {
    const savedLevel = savedLevels.find((candidate) => candidate.id === level.id);
    if (!savedLevel) return level;

    // Where each of this level's words starts: section 1's words begin in the
    // tray (level.inventory); later sections' words wait in availableWords.
    const wordsById = new Map<string, Word>();
    const homeSection = new Map<string, number>();
    level.inventory.forEach((word) => {
      wordsById.set(word.id, word);
      homeSection.set(word.id, 0);
    });
    level.sections.forEach((section, index) =>
      section.availableWords.forEach((word) => {
        wordsById.set(word.id, word);
        homeSection.set(word.id, index);
      })
    );

    const savedSections = Array.isArray(savedLevel.sections) ? savedLevel.sections.filter(isRecord) : [];
    const savedSection = (section: Section) => savedSections.find((candidate) => candidate.id === section.id);
    const unlocked: boolean[] = [];
    level.sections.forEach((section, index) => {
      unlocked[index] = index === 0 || (unlocked[index - 1] && savedSection(section)?.isUnlocked === true);
    });

    const usable = (value: unknown): Word | null => {
      if (!isWord(value)) return null;
      const word = wordsById.get(value.id);
      if (!word || word.text !== value.text) return null;
      return unlocked[homeSection.get(word.id) ?? 0] ? word : null;
    };

    const onBoard = new Set<string>();
    const sections: Section[] = level.sections.map((section, index) => {
      const saved = savedSection(section);
      const savedSlots = saved && Array.isArray(saved.slots) ? saved.slots.filter(isRecord) : [];
      const slots: Slot[] = section.slots.map((slot) => {
        if (!unlocked[index]) return { ...slot, currentWord: null };
        const word = usable(savedSlots.find((candidate) => candidate.id === slot.id)?.currentWord);
        if (!word || onBoard.has(word.id)) return { ...slot, currentWord: null };
        onBoard.add(word.id);
        return { ...slot, currentWord: word };
      });
      return {
        ...section,
        isUnlocked: unlocked[index],
        availableWords: unlocked[index] ? [] : section.availableWords,
        slots,
      };
    });

    const inventory: Word[] = [];
    const inTray = new Set<string>();
    const toTray = (word: Word | null) => {
      if (!word || onBoard.has(word.id) || inTray.has(word.id)) return;
      inTray.add(word.id);
      inventory.push(word);
    };
    // The saved tray order first, then any unlocked word the save lost track of.
    (Array.isArray(savedLevel.inventory) ? savedLevel.inventory : []).forEach((word) => toTray(usable(word)));
    level.inventory.forEach(toTray);
    level.sections.forEach((section, index) => {
      if (unlocked[index]) section.availableWords.forEach(toTray);
    });

    return { ...level, sections, inventory, solutions: readSolutions(savedLevel.solutions) };
  });
}

function readLevelProgress(value: unknown, fallback: LevelProgress): LevelProgress {
  if (!isRecord(value)) return fallback;
  const progress: LevelProgress = {};
  for (const [levelId, entry] of Object.entries(value)) {
    if (!LEVEL_ID.test(levelId) || !isRecord(entry)) continue;
    progress[levelId] = {
      solutions: readSolutions(entry.solutions),
      sections: isRecord(entry.sections) ? (entry.sections as LevelProgress[string]['sections']) : {},
      inventory: Array.isArray(entry.inventory) ? entry.inventory.filter(isWord) : [],
    };
  }
  return progress;
}

/**
 * redux-persist's stateReconciler for the game slice: the saved player state
 * over the shipped data. Clue lists always come from the shipped data.
 */
export function reconcileProgress(inbound: unknown, shipped: GameState): GameState {
  if (!isRecord(inbound)) return shipped;
  return {
    ...shipped,
    hints: shipped.hints,
    levels: reconcileLevels(shipped.levels, inbound.levels),
    currentLevel: typeof inbound.currentLevel === 'string' ? inbound.currentLevel : shipped.currentLevel,
    tutorials: isRecord(inbound.tutorials) ? readTutorials(inbound.tutorials) : shipped.tutorials,
    levelProgress: readLevelProgress(inbound.levelProgress, shipped.levelProgress),
  };
}
