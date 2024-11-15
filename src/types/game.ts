export interface Word {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Level {
  id: string;
  words: Word[];
  solutions: string[];
  isUnlocked: boolean;
  isCompleted: boolean;
}

export interface World {
  id: string;
  levels: Level[];
  isUnlocked: boolean;
  isCompleted: boolean;
} 