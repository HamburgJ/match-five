import React, { useEffect, useState, useRef } from 'react';
import gameData from '../data/gameData.json';

// Animation configuration constants
const ANIMATION_CONFIG = {
  NUM_WORDS: 20, // Number of words on screen
  WORD_SCALE: 1, // Size scale of the words (1 = normal size)
  WORD_OPACITY: 0.5, // Opacity of the words (0-1)
  MIN_SPEED: 50, // Minimum fall speed (pixels per second)
  MAX_SPEED: 150, // Maximum fall speed (pixels per second)
  MIN_DELAY: 0, // Minimum delay before word starts falling (ms)
  MAX_DELAY: 5000, // Maximum delay before word starts falling (ms)
  VERTICAL_OFFSET: -50, // Starting position above viewport
};

interface FallingWord {
  id: number;
  text: string;
  emoji: string;
  x: number;
  y: number;
  speed: number;
  delay: number;
}

const FallingWords: React.FC = () => {
  const [words, setWords] = useState<FallingWord[]>([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  // Get a random word and its emoji from the game data
  const getRandomWord = () => {
    const wordList = Object.entries(gameData.wordEmojis);
    const [text, emoji] = wordList[Math.floor(Math.random() * wordList.length)];
    return { text, emoji };
  };

  // Create a new falling word with random position and speed
  const createFallingWord = (id: number, isInitial: boolean = false): FallingWord => {
    const { text, emoji } = getRandomWord();
    return {
      id,
      text,
      emoji,
      x: Math.random() * dimensions.width,
      // If initial placement, distribute across screen height, otherwise start from top
      y: isInitial ? Math.random() * dimensions.height : ANIMATION_CONFIG.VERTICAL_OFFSET,
      speed: ANIMATION_CONFIG.MIN_SPEED + Math.random() * (ANIMATION_CONFIG.MAX_SPEED - ANIMATION_CONFIG.MIN_SPEED),
      // No delay for initial words, normal delay for new words
      delay: isInitial ? 0 : ANIMATION_CONFIG.MIN_DELAY + Math.random() * (ANIMATION_CONFIG.MAX_DELAY - ANIMATION_CONFIG.MIN_DELAY),
    };
  };

  // Update window dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      setDimensions({ width: newWidth, height: newHeight });
      
      // Redistribute words across new dimensions
      setWords(currentWords => 
        currentWords.map(word => ({
          ...word,
          x: (word.x / dimensions.width) * newWidth,
          y: word.y < 0 ? word.y : (word.y / dimensions.height) * newHeight
        }))
      );
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dimensions.width, dimensions.height]);

  // Initialize words
  useEffect(() => {
    const initialWords = Array.from(
      { length: ANIMATION_CONFIG.NUM_WORDS }, 
      (_, i) => createFallingWord(i, true)
    );
    setWords(initialWords);
    lastTimeRef.current = performance.now();
  }, []);

  // Animate words using delta time
  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;

      setWords(currentWords => {
        return currentWords.map(word => {
          // Don't start moving until delay is over
          if (word.delay > 0) {
            return { ...word, delay: word.delay - deltaTime };
          }

          // Calculate new position based on speed and delta time
          const pixelsPerFrame = (word.speed * deltaTime) / 1000;
          const newY = word.y + pixelsPerFrame;

          // Reset word if it goes off screen
          if (newY > dimensions.height) {
            return createFallingWord(word.id);
          }
          return { ...word, y: newY };
        });
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions.height]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 0,
      overflow: 'hidden',
    }}>
      {words.map(word => (
        <div
          key={`${word.id}-${word.text}`}
          className="home-word-tile"
          style={{
            position: 'absolute',
            left: word.x,
            top: word.y,
            opacity: ANIMATION_CONFIG.WORD_OPACITY,
            transform: `scale(${ANIMATION_CONFIG.WORD_SCALE})`,
            transition: 'none',
            willChange: 'transform',
          }}
        >
          {word.text}
          <span className="word-emoji" role="img" aria-label={`${word.text} emoji`}>
            {word.emoji}
          </span>
        </div>
      ))}
    </div>
  );
};

export default FallingWords; 