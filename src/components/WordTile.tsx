import React, { useState } from 'react';
import gameData from '../data/gameData.json';

interface WordTileProps {
  word: string;
  hint?: string;
  disableHover?: boolean;
  className?: string;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick?: () => void;
}

const WordTile: React.FC<WordTileProps> = ({ 
  word, 
  hint, 
  disableHover = false, 
  className = 'word-tile',
  onDragStart,
  onClick
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragging(true);
    if (onDragStart) onDragStart(e);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const emoji = gameData.wordEmojis[word];

  return (
    <div
      className={`${className} ${isDragging ? 'dragging' : ''}`}
      draggable={!disableHover}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.5rem',
        margin: '0 0.25rem',
        borderRadius: '0.25rem',
        background: 'var(--primary)',
        color: 'var(--on-primary)',
        fontSize: '0.95rem',
        boxShadow: 'var(--elevation-1)',
        verticalAlign: 'middle',
        gap: '0.25rem',
        cursor: disableHover ? 'default' : 'grab',
        userSelect: 'none',
      }}
    >
      {word}
      {emoji && (
        <span 
          className="word-emoji" 
          role="img" 
          aria-label={`${word} emoji`}
        >
          {emoji}
        </span>
      )}
    </div>
  );
};

export default WordTile; 