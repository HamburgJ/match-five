export interface Word {
  id: string;
  text: string;
}

export interface Slot {
  id: string;
  acceptedWords: string[];
  currentWord: Word | null;
  hintWord: string;
}

export interface Level {
  id: string;
  name: string;
  isUnlocked: boolean;
  isCompleted: boolean;
  slots: Slot[];
  availableWords: Word[];
}

export interface World {
  id: string;
  name: string;
  isUnlocked: boolean;
  isCompleted: boolean;
  levels: Level[];
}

export interface GameState {
  worlds: World[];
  currentWorld: string | null;
  currentLevel: string | null;
  inventory: Word[];
} 