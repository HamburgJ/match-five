import React, { useState } from 'react';
import { emWidth, fitStyle } from '../utils/fitText';

// A word tile is the word and nothing else. Tiles used to carry an emoji, and
// the emoji picked one meaning of words whose second meaning is the puzzle
// (Kiwi drawn as the fruit when the answer is the bird). The look lives in
// App.css (.mf-tile) so it can respond to the width it is given.

interface WordTileProps {
  word: string;
  /** A tile in running text or an example: not draggable, no grab cursor. */
  disableHover?: boolean;
  className?: string;
  selected?: boolean;
  /** Shrink to fit a narrow slot column instead of breaking the word (utils/fitText.ts). */
  fit?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const WordTile: React.FC<WordTileProps> = ({
  word,
  disableHover = false,
  className = 'word-tile',
  selected = false,
  fit = false,
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

  const classes = [
    'mf-tile',
    className,
    disableHover ? 'mf-tile-static' : '',
    isDragging ? 'dragging' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      draggable={!disableHover}
      onDragStart={disableHover ? undefined : handleDragStart}
      onDragEnd={disableHover ? undefined : handleDragEnd}
      onClick={onClick}
      style={fit ? fitStyle(emWidth(word, 'word')) : undefined}
    >
      {word}
    </div>
  );
};

export default WordTile;
