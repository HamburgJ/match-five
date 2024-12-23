export interface Word {
  id: string;
  text: string;
}

export interface Hint {
  accepts: string[];
  emojis?: { [word: string]: string };
}

export interface HintDictionary {
  [key: string]: Hint;
}

export interface Slot {
  id: string;
  hintId: string;
  currentWord: Word | null;
}

export interface Section {
  id: string;
  name: string;
  slots: Slot[];
  availableWords: Word[];
  isComplete?: boolean;
  isUnlocked?: boolean;
}

export interface Level {
  id: string;
  name: string;
  sections: Section[];
  isComplete?: boolean;
  inventory: Word[];
}

export interface GameState {
  levels: Level[];
  currentLevel: string | null;
  currentSection: string | null;
  inventory: Word[];
  hints: HintDictionary;
}

// Raw data interfaces (before transformation)
export type RawSlot = string;

export interface RawSection {
  name: string;
  slots: RawSlot[];
  words: string[];
}

export interface RawLevel {
  name: string;
  sections: RawSection[];
}

export interface RawGameData {
  hints: HintDictionary;
  levels: RawLevel[];
  wordEmojis: { [word: string]: string };
} 