import React, { createContext, useContext, useState } from 'react';
import { World, Level, Word } from '../types/game';

interface GameContextType {
  worlds: World[];
  currentWorld: string | null;
  currentLevel: string | null;
  setCurrentWorld: (id: string | null) => void;
  setCurrentLevel: (id: string | null) => void;
  checkSolution: (levelId: string, words: Word[]) => boolean;
  unlockNextLevel: (currentLevelId: string) => void;
  goBack: () => void;
}

const initialWorlds: World[] = [
  {
    id: 'world1',
    isUnlocked: true,
    isCompleted: false,
    levels: [
      {
        id: 'level1',
        isUnlocked: true,
        isCompleted: false,
        words: [
          { id: 'w1', text: 'Sky', isCorrect: false },
          { id: 'w2', text: 'Earth', isCorrect: false },
          { id: 'w3', text: 'Fire', isCorrect: false },
          { id: 'w4', text: 'Water', isCorrect: false },
          { id: 'w5', text: 'Wind', isCorrect: false },
        ],
        solutions: ['Sky', 'Earth', 'Fire', 'Water', 'Wind']
      },
      {
        id: 'level2',
        isUnlocked: false,
        isCompleted: false,
        words: [
          { id: 'w6', text: 'Sun', isCorrect: false },
          { id: 'w7', text: 'Moon', isCorrect: false },
          { id: 'w8', text: 'Star', isCorrect: false },
          { id: 'w9', text: 'Cloud', isCorrect: false },
          { id: 'w10', text: 'Rain', isCorrect: false },
        ],
        solutions: ['Sun', 'Moon', 'Star', 'Cloud', 'Rain']
      }
    ]
  }
];

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [worlds, setWorlds] = useState<World[]>(initialWorlds);
  const [currentWorld, setCurrentWorld] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);

  const checkSolution = (levelId: string, words: Word[]): boolean => {
    const world = worlds.find(w => w.levels.some(l => l.id === levelId));
    const level = world?.levels.find(l => l.id === levelId);

    if (!level) return false;

    const wordTexts = words.map(w => w.text);
    return JSON.stringify(wordTexts) === JSON.stringify(level.solutions);
  };

  const unlockNextLevel = (currentLevelId: string) => {
    setWorlds(prevWorlds => {
      return prevWorlds.map(world => {
        const levelIndex = world.levels.findIndex(l => l.id === currentLevelId);
        if (levelIndex === -1) return world;

        const newLevels = [...world.levels];
        if (levelIndex + 1 < newLevels.length) {
          newLevels[levelIndex + 1].isUnlocked = true;
        }
        return { ...world, levels: newLevels };
      });
    });
  };

  const goBack = () => {
    if (currentLevel) {
      setCurrentLevel(null);
    } else if (currentWorld) {
      setCurrentWorld(null);
    }
  };

  return (
    <GameContext.Provider value={{
      worlds,
      currentWorld,
      currentLevel,
      setCurrentWorld,
      setCurrentLevel,
      checkSolution,
      unlockNextLevel,
      goBack
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
}; 