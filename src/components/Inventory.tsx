import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Container, Row, Col } from 'react-bootstrap';
import { RootState } from '../store/store';
import { Word } from '../store/types';
import { placeWord } from '../store/gameSlice';

const Inventory: React.FC = () => {
  const dispatch = useDispatch();
  const inventory = useSelector((state: RootState) => state.game.inventory);
  const currentWorld = useSelector((state: RootState) => state.game.currentWorld);
  const currentLevel = useSelector((state: RootState) => state.game.currentLevel);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, word: Word) => {
    e.dataTransfer.setData('word', JSON.stringify(word));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    console.log('drop in inventory', currentWorld, currentLevel);
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.remove('drag-over');
    
    try {
      if (currentWorld && currentLevel) {
        const word = JSON.parse(e.dataTransfer.getData('word')) as Word;
        if (word) {
          dispatch(placeWord({ 
            worldId: currentWorld, 
            levelId: currentLevel, 
            slotId: 'inventory', 
            word 
          }));
        }
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  return (
    <Container 
      className="mt-4 inventory-container"
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('drag-over');
      }}
      onDrop={handleDrop}
    >
      <h3>Inventory</h3>
      <div 
        className="inventory-words"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {inventory.map(word => (
          <div 
            key={word.id}
            className="word-tile"
            draggable
            onDragStart={(e) => handleDragStart(e, word)}
          >
            {word.text}
          </div>
        ))}
      </div>
    </Container>
  );
};

export default Inventory; 