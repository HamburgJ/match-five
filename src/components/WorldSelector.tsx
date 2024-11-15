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
    expandedLevels: Set<string>;
  };
}

const WorldSelector: React.FC = () => {
  const dispatch = useDispatch();
  const worlds = useSelector((state: RootState) => state.game.worlds);
  const currentWorld = useSelector((state: RootState) => state.game.currentWorld);
  const currentLevel = useSelector((state: RootState) => state.game.currentLevel);
  const [expandedStates, setExpandedStates] = useState<ExpandedState>({});

  useEffect(() => {
    if (worlds.length > 0 && Object.keys(expandedStates).length === 0) {
      const firstWorld = worlds[0];
      dispatch(setCurrentWorld(firstWorld.id));
      
      const initialStates: ExpandedState = {
        [firstWorld.id]: {
          isExpanded: true,
          expandedLevels: new Set()
        }
      };
      
      setExpandedStates(initialStates);
    }
  }, [worlds, dispatch]);

  const toggleWorld = (worldId: string) => {
    dispatch(setCurrentWorld(worldId));
    setExpandedStates(prev => ({
      ...prev,
      [worldId]: {
        ...prev[worldId],
        isExpanded: !prev[worldId]?.isExpanded,
        expandedLevels: prev[worldId]?.expandedLevels || new Set()
      }
    }));
  };

  const toggleLevel = (worldId: string, levelId: string) => {
    dispatch(setCurrentLevel(levelId));
    setExpandedStates(prev => {
      const worldState = prev[worldId] || { isExpanded: true, expandedLevels: new Set() };
      const newExpandedLevels = new Set(worldState.expandedLevels);
      
      if (newExpandedLevels.has(levelId)) {
        newExpandedLevels.delete(levelId);
      } else {
        newExpandedLevels.add(levelId);
      }

      return {
        ...prev,
        [worldId]: {
          ...worldState,
          expandedLevels: newExpandedLevels
        }
      };
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
                      toggleLevel(world.id, level.id);
                    }
                  }}
                  className={`level-card ${isLevelCurrentlyComplete(level) ? 'completed' : ''} ${!level.isUnlocked ? 'locked' : ''}`}
                >
                  <Card.Body>
                    <Card.Title>{level.name || `Level ${level.id}`}</Card.Title>
                  </Card.Body>
                </Card>

                {level.isUnlocked && expandedStates[world.id]?.expandedLevels.has(level.id) && (
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