import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Row, Col, Collapse } from 'react-bootstrap';
import { RootState } from '../store/store';
import GameBoard from './GameBoard';
import { Level } from '../store/types';
import { setCurrentWorld, setCurrentLevel } from '../store/gameSlice';

interface ExpandedState {
  [key: string]: {
    isExpanded: boolean;
    levels: {
      [key: string]: boolean;
    };
  };
}

const WorldSelector: React.FC = () => {
  const dispatch = useDispatch();
  const worlds = useSelector((state: RootState) => state.game.worlds);
  const currentWorld = useSelector((state: RootState) => state.game.currentWorld);
  const currentLevel = useSelector((state: RootState) => state.game.currentLevel);
  const [expandedStates, setExpandedStates] = useState<ExpandedState>({});

  console.log('Current worlds:', worlds);
  console.log('Current expandedStates:', expandedStates);

  useEffect(() => {
    console.log('useEffect triggered, worlds length:', worlds.length);
    console.log('expandedStates empty?:', Object.keys(expandedStates).length === 0);

    if (worlds.length > 0 && Object.keys(expandedStates).length === 0) {
      const firstWorld = worlds[0];
      dispatch(setCurrentWorld(firstWorld.id));
      
      const initialStates: ExpandedState = {
        [firstWorld.id]: {
          isExpanded: true,
          levels: firstWorld.levels.reduce((acc, level: Level) => ({
            ...acc,
            [level.id]: false
          }), {})
        }
      };
      
      console.log('Setting initial states:', initialStates);
      setExpandedStates(initialStates);
    }
  }, [worlds, dispatch]);

  const toggleWorld = (worldId: string) => {
    console.log('toggleWorld called with:', worldId);
    console.log('Current expanded state for world:', expandedStates[worldId]);
    
    dispatch(setCurrentWorld(worldId));
    setExpandedStates(prev => {
      const newState = {
        ...prev,
        [worldId]: {
          ...prev[worldId],
          isExpanded: !prev[worldId]?.isExpanded,
          levels: prev[worldId]?.levels || {}
        }
      };
      console.log('New expanded state:', newState);
      return newState;
    });
  };

  const isLevelCurrentlyComplete = (level: Level) => {
    return level.slots.every(slot => 
      slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
    );
  };

  const renderWorld = (world: any) => {
    return (
      <div key={world.id} className="world-section">
        <Card 
          onClick={() => {
            if (world.isUnlocked) {
              toggleWorld(world.id);
            }
          }}
          className={`world-card ${world.levels.every(isLevelCurrentlyComplete) ? 'completed' : ''}`}
        >
          <Card.Body>
            <Card.Title>{world.name || `World ${world.id}`}</Card.Title>
            <div className="progress-indicator">
              {world.levels.filter(isLevelCurrentlyComplete).length} / {world.levels.length}
            </div>
          </Card.Body>
        </Card>

        <Collapse in={Boolean(expandedStates[world.id]?.isExpanded)}>
          <div className="level-section">
            {world.levels.map((level: Level) => (
              <div key={level.id}>
                <Card 
                  onClick={() => {
                    if (level.isUnlocked) {
                      dispatch(setCurrentLevel(level.id));
                    }
                  }}
                  className={`level-card ${isLevelCurrentlyComplete(level) ? 'completed' : ''} ${!level.isUnlocked ? 'locked' : ''}`}
                >
                  <Card.Body>
                    <Card.Title>{level.name || `Level ${level.id}`}</Card.Title>
                  </Card.Body>
                </Card>

                {level.isUnlocked && level.id === currentLevel && (
                  <div className="game-board-section">
                    <GameBoard worldId={world.id} levelId={level.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Collapse>
      </div>
    );
  };

  return (
    <div className="worlds-container">
      {worlds.map(renderWorld)}
    </div>
  );
};

export default WorldSelector; 