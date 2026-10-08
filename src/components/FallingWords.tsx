import React, { useEffect, useState, useRef } from 'react';
import gameData from '../data/gameData.json';
import { prefersReducedMotion } from '../utils/motion';

// The words that drift behind the home card are the game's own words: every
// word tile in the eight levels, without the number and letter tiles. Plain
// text on the same charcoal chip the board uses.
const DRIFT_WORDS: string[] = Array.from(new Set(
  gameData.levels.flatMap(level => level.sections.flatMap(section => section.words.map(word => word.text)))
)).filter(text => /^[A-Za-z]{2,}$/.test(text));

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

  const getRandomWord = () => DRIFT_WORDS[Math.floor(Math.random() * DRIFT_WORDS.length)];

  // Create a new falling word with random position and speed
  const createFallingWord = (id: number, isInitial: boolean = false): FallingWord => {
    return {
      id,
      text: getRandomWord(),
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

  // Animate words using delta time. Under reduced motion they stay where they
  // were scattered.
  useEffect(() => {
    if (prefersReducedMotion()) return;
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

  // Decoration only: screen readers skip the drifting words.
  return (
    <div aria-hidden="true" style={{
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
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            padding: '0.15rem 0.75rem',
            borderRadius: '0.25rem',
            fontSize: '0.8rem',
            boxShadow: 'var(--elevation-1)',
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 500,
            letterSpacing: '0.01em',
            display: 'inline-flex',
            alignItems: 'center',
            width: 'fit-content',
          }}
        >
          {word.text}
        </div>
      ))}
    </div>
  );
};

export default FallingWords; 