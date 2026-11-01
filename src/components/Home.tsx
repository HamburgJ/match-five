import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import FallingWords from './FallingWords';
import { logMatchFiveCrossClick, logMatchFiveStart } from '../utils/analytics';
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
    logMatchFiveStart('home', lastUnlockedLevelId);
    navigate(`/play/${lastUnlockedLevelId}`);
  };

  return (
    <div className="home-container">
      <FallingWords />
      <div className="hero-section">
        <h1 className="title">Match Five</h1>
        <div className="subtitle">
          <p className="word-line">
            Put each word under a heading it belongs to. Words fit more than one heading, and every new batch makes you rethink the last.
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

        {/* Plain same-origin link on purpose: it exits the CRA app back into
            the parent site (HashRouter never sees it). */}
        <p className="home-footer-link">
          <a
            href="/word-games/"
            onClick={() => logMatchFiveCrossClick('/word-games/')}
          >
            more word games at burgerfun.ca
          </a>
        </p>
      </div>
    </div>
  );
};

export default Home;
