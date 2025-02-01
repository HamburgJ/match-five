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
  isUnlocked: boolean;
}

export interface Level {
  id: string;
  name: string;
  sections: Section[];
  inventory: Word[];
  solutions: string[];
}

export interface GameState {
  levels: Level[];
  currentLevel: string | null;
  hints: HintDictionary;
  inventory: Word[];
  tutorials: {
    mainTutorialCompleted: boolean;
    sectionTutorialCompleted: boolean;
    hintTutorialCompleted: boolean;
  };
  levelProgress: {
    [levelId: string]: {
      solutions: string[];
      sections: {
        [sectionId: string]: {
          isUnlocked: boolean;
          slots: {
            [slotId: string]: {
              currentWord: Word | null;
            };
          };
          availableWords: Word[];
        };
      };
      inventory: Word[];
    };
  };
}

// Raw data interfaces (before transformation)
export type RawSlot = string;

export interface RawSection {
  name?: string;
  slots: RawSlot[];
  words: string[];
}

export interface RawLevel {
  name?: string;
  sections: RawSection[];
}

export interface RawGameData {
  levels: {
    name?: string;
    sections: {
      name?: string;
      words: Word[];
      slots: string[];
    }[];
  }[];
  hints: HintDictionary;
  wordEmojis: {
    [key: string]: string;
  };
}

export interface GameProgress {
  levels: {
    [levelId: string]: {
      solutions: string[];
      sections: {
        [sectionId: string]: {
          slots: {
            [slotId: string]: {
              currentWord: Word | null;
            }
          };
          availableWords: Word[];
          isUnlocked: boolean;
        }
      };
      inventory: Word[];
    }
  };
  tutorials: {
    mainTutorialCompleted: boolean;
    sectionTutorialCompleted: boolean;
    hintTutorialCompleted: boolean;
  }
} 