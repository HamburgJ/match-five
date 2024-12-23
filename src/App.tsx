import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import Navbar from './components/Navbar';
import Home from './components/Home';
import LevelSelector from './components/LevelSelector';
import GameBoard from './components/GameBoard';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function App() {
  return (
    <Provider store={store}>
      <HashRouter>
        <div className="app">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/levels" element={<LevelSelector />} />
            <Route path="/play/:levelId" element={<GameBoard />} />
          </Routes>
        </div>
      </HashRouter>
    </Provider>
  );
}

export default App;
