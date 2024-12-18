import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { RootState } from '../store/store';
import { placeWord, addToInventory, checkSolution } from '../store/gameSlice';
import { Word, Slot } from '../store/types';

interface GameBoardProps {
  worldId: string;
  levelId: string;
}

const GameBoard: React.FC<GameBoardProps> = ({ worldId, levelId }) => {
  const dispatch = useDispatch();
  const level = useSelector((state: RootState) => {
    const world = state.game.worlds.find(w => w.id === worldId);
    return world?.levels.find(l => l.id === levelId);
  });

  useEffect(() => {
    if (level && level.slots.every(slot => 
      slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
    )) {
      dispatch(checkSolution());
    }
  }, [level?.slots, dispatch, worldId, levelId]);

  if (!level) return null;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, slotId: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const word = JSON.parse(e.dataTransfer.getData('word')) as Word;
    const sourceWorldId = e.dataTransfer.getData('sourceWorldId');
    const sourceLevelId = e.dataTransfer.getData('sourceLevelId');
    
    dispatch(placeWord({ 
      worldId, 
      levelId, 
      slotId, 
      word,
      sourceWorldId,
      sourceLevelId
    }));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, word: Word) => {
    e.dataTransfer.setData('word', JSON.stringify(word));
    e.dataTransfer.setData('sourceWorldId', worldId);
    e.dataTransfer.setData('sourceLevelId', levelId);
  };

  const handleWordClick = (word: Word, fromSlot: boolean = false) => {
    if (fromSlot) {
      dispatch(placeWord({ 
        worldId, 
        levelId, 
        slotId: 'inventory', 
        word,
        sourceWorldId: worldId,
        sourceLevelId: levelId 
      }));
    } else {
      dispatch(addToInventory({ 
        worldId, 
        levelId, 
        word,
        sourceWorldId: worldId,
        sourceLevelId: levelId
      }));
    }
  };

  const isWordAccepted = (word: Word, slot: Slot) => {
    return slot.acceptedWords.includes(word.text);
  };

  const isLevelComplete = () => {
    return level.slots.every(slot => 
      slot.currentWord && slot.acceptedWords.includes(slot.currentWord.text)
    );
  };

  return (
    <Container className="mt-3">
      {level.availableWords.length > 0 && (
        <Row className="mb-4">
          <Col>
            <div className="available-words">
              {level.availableWords.map((word: Word) => (
                <div 
                  key={word.id}
                  className="word-tile"
                  draggable
                  onDragStart={(e) => handleDragStart(e, word)}
                  onClick={() => handleWordClick(word)}
                >
                  {word.text}
                </div>
              ))}
            </div>
          </Col>
        </Row>
      )}
      
      <Row className="g-4">
        <Col>
          <div className="slot-container">
            {level.slots.map((slot) => (
              <div 
                key={slot.id}
                className={`slot-card ${slot.currentWord && isWordAccepted(slot.currentWord, slot) ? 'correct' : ''} 
                           ${slot.currentWord && !isWordAccepted(slot.currentWord, slot) ? 'incorrect' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drag-over');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drag-over');
                }}
                onDrop={(e) => handleDrop(e, slot.id)}
              >
                <div className="hint-word">{slot.hintWord}</div>
                <div className="word-container">
                  {slot.currentWord ? (
                    <div 
                      className="word-tile"
                      draggable
                      onDragStart={(e) => handleDragStart(e, slot.currentWord!)}
                      onClick={() => handleWordClick(slot.currentWord!, true)}
                    >
                      {slot.currentWord.text}
                    </div>
                  ) : (
                    <div className="empty-slot-text">Drop word here</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default GameBoard; 