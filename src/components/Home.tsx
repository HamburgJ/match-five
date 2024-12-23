import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import FallingWords from './FallingWords';
import WordTile from './WordTile';
import '../styles/Home.css';

interface LevelCompletion {
  isComplete: boolean;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const levels = useSelector((state: RootState) => state.game.levels);

  const findLastUnlockedLevel = () => {
    // Go through levels in reverse to find the last unlocked one
    for (let i = levels.length - 1; i >= 0; i--) {
      const levelId = `level_${i + 1}`;
      // A level is accessible if it's the first level or if the previous level is complete
      if (i === 0 || isLevelComplete(`level_${i}`)) {
        return levelId;
      }
    }
    // If no level is found (shouldn't happen), return the first level
    return 'level_1';
  };

  const isLevelComplete = (levelId: string): boolean => {
    const saved = localStorage.getItem(`level_completion_${levelId}`);
    if (!saved) return false;
    const completion = JSON.parse(saved);
    return completion.isComplete;
  };

  const handlePlayClick = () => {
    const lastUnlockedLevelId = findLastUnlockedLevel();
    navigate(`/play/${lastUnlockedLevelId}`);
  };

  return (
    <div className="home-container">
      <FallingWords />
      <div className="hero-section">
        <h1 className="title">Match Five</h1>
        <div className="subtitle">
          <p className="word-line">
            A <WordTile word="Puzzle Game" disableHover className="home-word-tile" /> where you match <WordTile word="Five" disableHover className="home-word-tile" /> words to their hints. When all your <WordTile word="Answers" disableHover className="home-word-tile" /> are <WordTile word="Right" disableHover className="home-word-tile" />, more words are revealed. Is your <WordTile word="Brain" disableHover className="home-word-tile" /> feeling <WordTile word="Smart" disableHover className="home-word-tile" /> today?
          </p>
        </div>
        
        <div className="cta-buttons">
          <button 
            className="play-button"
            onClick={handlePlayClick}
          >
            Play Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home; 