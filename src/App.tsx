import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import GameBoard from './components/GameBoard';
import Home from './components/Home';
import LevelSelector from './components/LevelSelector';
import Navbar from './components/Navbar';
import type { RootState } from './store/store';
import { logGameEvent, logPageView } from './utils/analytics';

const AnalyticsTracker = () => {
  const location = useLocation();
  const levelProgress = useSelector((state: RootState) => state.game.levelProgress);
  const playerStateLogged = useRef(false);

  useEffect(() => {
    logPageView(`${window.location.pathname}#${location.pathname}`);
  }, [location.pathname]);

  useEffect(() => {
    if (playerStateLogged.current) return;
    playerStateLogged.current = true;
    const completedLevels = Object.values(levelProgress)
      .filter(progress => progress.solutions.length > 0)
      .length;
    logGameEvent(completedLevels > 0 ? 'player_return' : 'player_new', { completed_levels: completedLevels });
  }, [levelProgress]);

  return null;
};

function App() {
  return (
    <HashRouter>
      <AnalyticsTracker />
      <div className="app">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/levels" element={<LevelSelector />} />
          <Route path="/play/:levelId" element={<GameBoard />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
