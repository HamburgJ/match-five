import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { Row, Col, Modal, Button } from 'react-bootstrap';
import { RootState } from '../store/store';
import { placeWord, setCurrentSection, completeTutorial, checkSectionUnlocks, resetLevel } from '../store/gameSlice';
import { Word, Slot, Section } from '../store/types';
import TutorialOverlay from './TutorialOverlay';
import '../styles/GameBoard.css';
import WordTile from './WordTile';
import { logGameEvent } from '../utils/analytics';

interface SectionWithId extends Section {
  id: string;
}

interface TutorialStep {
  targetSelector: string;
  message: string;
  position: 'bottom' | 'top' | 'left';
}

const GameBoard: React.FC = () => {
  const { levelId = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [showLevelCompleteModal, setShowLevelCompleteModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHintTutorial, setShowHintTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const completionStateRef = useRef<Record<string, boolean>>({});
  
  // Get the current level and hints from Redux store
  const levelIndex = useMemo(() => parseInt(levelId.split('_')[1]) - 1, [levelId]);
  
  const level = useSelector((state: RootState) => state.game.levels[levelIndex]);
  const hints = useSelector((state: RootState) => state.game.hints);
  const tutorials = useSelector((state: RootState) => state.game.tutorials);
  const levelProgress = useSelector((state: RootState) => state.game.levelProgress);

  useEffect(() => {
    if (levelId) logGameEvent('level_view', { level_id: levelId });
  }, [levelId]);

  // Get all unlocked sections
  const sections = useMemo(() => {
    if (!level) return [] as SectionWithId[];
    return level.sections.filter(section => section.isUnlocked) as SectionWithId[];
  }, [level]);

  // Get all slots from unlocked sections in order
  const allSlots = useMemo(() => sections.flatMap(section => section.slots), [sections]);

  // Get available words from all unlocked sections
  const availableWords = useMemo(() => {
    if (!level) return [];
    return level.sections
      .filter(section => section.isUnlocked)
      .flatMap(section => section.availableWords);
  }, [level]);

  // Tutorial steps for the first level
  const tutorialSteps: TutorialStep[] = [
    {
      targetSelector: '.available-words-section',
      message: 'Welcome to Match Five! These are your available words and inventory. Click or drag them to fill the slots below.',
      position: 'bottom'
    },
    {
      targetSelector: '.slots-grid',
      message: 'Drop words into these slots. Each slot accepts specific words based on its hint.',
      position: 'bottom'
    }
  ];

  // Tutorial steps for when second section unlocks
  const sectionTutorialSteps: TutorialStep[] = [
    {
      targetSelector: '.available-words-section',
      message: 'New words are now available! You can use these new words along with your existing words.',
      position: 'bottom'
    },
    {
      targetSelector: '.slots-grid',
      message: 'With more slots unlocked, you have more possible combinations! Try moving words between different slots to find new solutions. Be careful, some words have multiple possible matches!',
      position: 'bottom'
    }
  ];

  // Tutorial steps for incorrect word hint
  const hintTutorialSteps: TutorialStep[] = [
    {
      targetSelector: '.slots-grid',
      message: 'Remember that each slot can accept multiple different words! Think creatively about different ways words could fit the hint. Sometimes the first word that comes to mind isn\'t the right one.',
      position: 'top'
    }
  ];

  // Load level state when entering level
  useEffect(() => {
    if (!levelId || !level) return;

    const hasExistingProgress = levelProgress[levelId] && Object.keys(levelProgress[levelId].sections).length > 0;

    // Only initialize if this level has never been loaded before
    if (!hasExistingProgress) {
        // Initialize first section
        const firstSection = level.sections[0];
        if (firstSection) {
            dispatch(setCurrentSection({
                levelId,
                sectionId: firstSection.id,
                isUnlocked: true,
                wordsToAdd: firstSection.availableWords.map(word => ({ ...word }))
            }));
        }
    }
  }, [levelId, level, levelProgress, dispatch]);

  // Check for section unlocks only when words are placed
  const checkForUnlocks = () => {
    if (!levelId || !level) return;
    dispatch(checkSectionUnlocks({ levelId }));
  };

  // Load and check tutorial state
  useEffect(() => {
    if (levelId.includes('level_1')) {
      if (!tutorials.mainTutorialCompleted) {
        setShowTutorial(true);
      } else if (sections.length === 2 && !tutorials.sectionTutorialCompleted) {
        setTutorialStep(0);
        setShowTutorial(true);
      }
    }
  }, [levelId, sections.length, tutorials]);

  // Check for all slots filled but with incorrect words
  useEffect(() => {
    if (!level || !levelId || tutorials.hintTutorialCompleted) return;

    const allSlotsFilled = allSlots.every(slot => slot.currentWord);
    const hasIncorrectWord = allSlots.some(slot => {
      const hint = hints[slot.hintId];
      return slot.currentWord && hint && !hint.accepts.includes(slot.currentWord.text);
    });

    if (allSlotsFilled && hasIncorrectWord) {
      setShowHintTutorial(true);
    }
  }, [allSlots, level, levelId, hints, tutorials.hintTutorialCompleted]);

  const handleTutorialComplete = () => {
    if (sections.length === 1) {
      dispatch(completeTutorial({ type: 'main' }));
    } else {
      dispatch(completeTutorial({ type: 'section' }));
    }
    setShowTutorial(false);
  };

  const handleTutorialNext = () => {
    setTutorialStep(prev => prev + 1);
  };

  const handleHintTutorialComplete = () => {
    dispatch(completeTutorial({ type: 'hint' }));
    setShowHintTutorial(false);
  };

  const nextLevel = useSelector((state: RootState) => {
    const levels = state.game.levels;
    const currentLevelNum = parseInt(levelId.split('_')[1]);
    return currentLevelNum < levels.length ? levels[currentLevelNum] : undefined;
  });

  // Watch for level completion
  useEffect(() => {
    if (!levelId || !level) return;
    
    // Check if all sections are unlocked and have correct words
    const allSectionsUnlocked = level.sections.every(section => section.isUnlocked);
    const allSectionsCorrect = level.sections.every(section =>
      section.slots.every(slot => {
        const hint = hints[slot.hintId];
        return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
      })
    );

    const isComplete = allSectionsUnlocked && allSectionsCorrect;
    const previousCompletion = completionStateRef.current[levelId];

    if (previousCompletion === false && isComplete) {
      logGameEvent('level_complete', {
        level_id: levelId,
        completed_levels: Object.values(levelProgress).filter(progress => progress.solutions.length > 0).length,
      });
    }

    completionStateRef.current[levelId] = isComplete;
    setShowLevelCompleteModal(isComplete);
  }, [levelId, level, hints, levelProgress]);

  // Modify the next level button handler
  const handleNextLevel = () => {
    const nextLevelNum = parseInt(levelId.split('_')[1]) + 1;
    const nextLevelId = `level_${nextLevelNum}`;
    
    logGameEvent('level_start', { level_id: nextLevelId, source: 'next_level' });
    setShowLevelCompleteModal(false);
    navigate(`/play/${nextLevelId}`);
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Match Five',
      text: `I completed Match Five ${levelId.replace('_', ' ')}!`,
      url: 'https://burgerfun.ca/match-five/',
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        logGameEvent('result_shared', { level_id: levelId, method: 'native' });
        return;
      }
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      logGameEvent('result_shared', { level_id: levelId, method: 'clipboard' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.warn('Unable to share Match Five result:', error);
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, word: Word) => {
    if (!levelId || !level || sections.length === 0) {
      return;
    }

    const wordData = JSON.stringify(word);
    e.dataTransfer.setData('text/plain', wordData);
    e.dataTransfer.setData('word', wordData);
    
    // Find the section and slot that contains this word
    let sourceSection;
    let sourceSlot;
    for (const section of sections) {
      sourceSlot = section.slots.find(slot => slot.currentWord?.id === word.id);
      if (sourceSlot) {
        sourceSection = section;
        break;
      }
    }

    // Only set sourceSectionId if the word was found in a slot
    if (sourceSection && sourceSlot) {
      e.dataTransfer.setData('sourceSectionId', sourceSection.id);
      e.dataTransfer.setData('sourceSlotId', sourceSlot.id);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, slotId: string) => {
    if (!levelId || !level) return;

    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const wordData = e.dataTransfer.getData('word') || e.dataTransfer.getData('text/plain');
    if (!wordData) return;

    const word = JSON.parse(wordData) as Word;
    const sourceSectionId = e.dataTransfer.getData('sourceSectionId');
    const sourceSlotId = e.dataTransfer.getData('sourceSlotId');
    
    // Find the section that owns this slot
    const targetSection = sections.find(section => 
      section.slots.some(slot => slot.id === slotId)
    );
    if (!targetSection) return;

    const levelNum = parseInt(levelId.split('_')[1]);
    const sectionIndex = sections.indexOf(targetSection);
    const targetSectionId = `section_${levelNum}_${sectionIndex + 1}`;

    // If the slot already has a word and the source was another slot, switch the words
    const existingWord = targetSection.slots.find(slot => slot.id === slotId)?.currentWord;

    if (existingWord && sourceSlotId) {
      dispatch(placeWord({ 
        levelId, 
        sectionId: sourceSectionId,
        slotId: sourceSlotId, 
        word: existingWord,
        sourceSectionId: targetSectionId
      }));
    } else if (existingWord) {
      dispatch(placeWord({ 
        levelId, 
        sectionId: targetSectionId,
        slotId: 'inventory', 
        word: existingWord,
        sourceSectionId: targetSectionId
      }));
    }
    
    dispatch(placeWord({ 
      levelId, 
      sectionId: targetSectionId,
      slotId, 
      word,
      sourceSectionId
    }));

    // Check section unlocks after word placement
    checkForUnlocks();
  };

  // Add cleanup function for drag states
  const cleanupDragStates = () => {
    document.querySelectorAll('.drag-over').forEach(element => {
      element.classList.remove('drag-over');
    });
  };

  const handleInventoryDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!levelId || !level || sections.length === 0) {
      return;
    }

    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const wordData = e.dataTransfer.getData('word') || e.dataTransfer.getData('text/plain');
    if (!wordData) {
      return;
    }

    const word = JSON.parse(wordData) as Word;
    const sourceSectionId = e.dataTransfer.getData('sourceSectionId');

    // Prevent inventory to inventory drops
    const isFromInventory = !sourceSectionId;
    if (isFromInventory) {
      return;
    }

    dispatch(placeWord({ 
      levelId, 
      sectionId: sections[0].id,
      slotId: 'inventory', 
      word,
      sourceSectionId
    }));
  };

  // Add this function to handle drag over for inventory
  const handleInventoryDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const sourceSectionId = e.dataTransfer.getData('sourceSectionId');
    // Only allow drag over if the word is not from inventory
    if (!sourceSectionId) {
      return;
    }
    
    e.preventDefault();
    const section = e.currentTarget;
    if (!section.classList.contains('drag-over')) {
      section.classList.add('drag-over');
    }
  };

  const handleWordClick = (word: Word, fromSlot: boolean = false) => {
    if (!levelId || !level) return;

    if (fromSlot) {
      const sourceSection = sections.find(section => 
        section.slots.some(slot => slot.currentWord?.id === word.id)
      );
      if (!sourceSection) return;

      dispatch(placeWord({ 
        levelId, 
        sectionId: sourceSection.id, 
        slotId: 'inventory', 
        word,
        sourceSectionId: sourceSection.id 
      }));
    } else {
      // For words from inventory, use the first unlocked section as target
      const firstSection = sections[0];
      if (!firstSection) return;

      dispatch(placeWord({ 
        levelId, 
        sectionId: firstSection.id,
        slotId: 'inventory', 
        word,
        sourceSectionId: firstSection.id
      }));
    }

    // Check section unlocks after word placement
    checkForUnlocks();
  };

  const isWordAccepted = (word: Word, slot: Slot) => {
    const hint = hints[slot.hintId];
    return hint ? hint.accepts.includes(word.text) : false;
  };

  const getHintText = (hintId: string): string => {
    // The hintId is the same as the display text in our case
    return hintId;
  };

  const handleReturnAllToInventory = () => {
    if (!levelId || !level || sections.length === 0) return;
    
    // First, collect all words from slots
    const wordsToMove = sections.flatMap(section => 
      section.slots
        .filter(slot => slot.currentWord !== null)
        .map(slot => ({
          word: slot.currentWord!,
          sectionId: section.id,
          slotId: slot.id
        }))
    );

    // Then move each word to inventory one by one
    wordsToMove.forEach(({ word, sectionId }) => {
      dispatch(placeWord({ 
        levelId, 
        sectionId: sections[0].id,
        slotId: 'inventory', 
        word,
        sourceSectionId: sectionId
      }));
    });
  };

  if (!level || sections.length === 0) return null;

  return (
    <div className="game-board-container">
      {showTutorial && (
        <TutorialOverlay
          isVisible={showTutorial}
          currentStep={tutorialStep}
          steps={sections.length === 1 ? tutorialSteps : sectionTutorialSteps}
          onComplete={handleTutorialComplete}
          onNext={handleTutorialNext}
        />
      )}
      
      {showHintTutorial && (
        <TutorialOverlay
          isVisible={showHintTutorial}
          currentStep={0}
          steps={hintTutorialSteps}
          onComplete={handleHintTutorialComplete}
          onNext={handleHintTutorialComplete}
        />
      )}
      <div className="game-board">
        <Row className="game-board-row">
          <Col md={12} className="game-content">
            <div className="level-content">
              <h1 className="level-title">Level {levelId.split('_')[1]}</h1>
              
              {/* Combined available words and inventory section */}
              <div className="available-words-section"
                onDragOver={handleInventoryDragOver}
                onDragLeave={(e) => {
                  const section = e.currentTarget;
                  const rect = section.getBoundingClientRect();
                  if (
                    e.clientX <= rect.left ||
                    e.clientX >= rect.right ||
                    e.clientY <= rect.top ||
                    e.clientY >= rect.bottom
                  ) {
                    section.classList.remove('drag-over');
                  }
                }}
                onDrop={handleInventoryDrop}
              >
                <div className="available-words-header">
                  <h6 className="available-words-title">Available Words</h6>
                  {allSlots.some(slot => slot.currentWord) && (
                    <Button 
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleReturnAllToInventory}
                    >
                      Return all words
                    </Button>
                  )}
                </div>
                <div className="available-words-container">
                  {availableWords.map((word: Word) => (
                    <WordTile
                      key={word.id}
                      word={word.text}
                      onDragStart={(e) => handleDragStart(e, word)}
                      onClick={() => handleWordClick(word)}
                    />
                  ))}
                  {level.inventory.map((word) => (
                    <WordTile
                      key={word.id}
                      word={word.text}
                      onDragStart={(e) => handleDragStart(e, word)}
                      onClick={() => handleWordClick(word, true)}
                    />
                  ))}
                </div>
              </div>
              
              {/* Slots grid */}
              <div className="slots-grid">
                {allSlots.map((slot) => (
                  <div 
                    key={slot.id}
                    className={`slot-card ${slot.currentWord && isWordAccepted(slot.currentWord, slot) ? 'correct' : ''} 
                               ${slot.currentWord && !isWordAccepted(slot.currentWord, slot) ? 'incorrect' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const card = e.currentTarget;
                      if (!card.classList.contains('drag-over')) {
                        card.classList.add('drag-over');
                      }
                    }}
                    onDragLeave={(e) => {
                      const card = e.currentTarget;
                      const rect = card.getBoundingClientRect();
                      if (
                        e.clientX <= rect.left ||
                        e.clientX >= rect.right ||
                        e.clientY <= rect.top ||
                        e.clientY >= rect.bottom
                      ) {
                        card.classList.remove('drag-over');
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      cleanupDragStates();
                      handleDrop(e, slot.id);
                    }}
                  >
                    <div className="hint-word">{getHintText(slot.hintId)}</div>
                    <div className="word-container">
                      {slot.currentWord ? (
                        <WordTile
                          word={slot.currentWord.text}
                          onDragStart={(e) => handleDragStart(e, slot.currentWord!)}
                          onClick={() => handleWordClick(slot.currentWord!, true)}
                        />
                      ) : (
                        <div className="empty-slot-text">Drop word here</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Col>
        </Row>

        <Modal show={showLevelCompleteModal} onHide={() => setShowLevelCompleteModal(false)} centered backdrop="static" keyboard={false}>
          <Modal.Header>
            <Modal.Title>
              {nextLevel ? 'Level Complete!' : 'Congratulations! 🎉'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="level-complete-message">
              {nextLevel ? (
                'You\'ve completed this level!'
              ) : (
                'You\'ve completed all available levels!'
              )}
            </div>
            <div className="level-complete-submessage">
              {!nextLevel && 'More levels coming soon! Stay tuned for new challenges.'}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button 
              variant="secondary" 
              onClick={() => {
                logGameEvent('level_replay', { level_id: levelId });
                dispatch(resetLevel({ levelId }));
                setShowLevelCompleteModal(false);
              }}
            >
              Play Again
            </Button>
            <Button variant="outline-primary" onClick={handleShare}>
              Share Result
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                logGameEvent('level_select_open', { source: 'completion', level_id: levelId });
                navigate('/levels');
              }}
            >
              Level Select
            </Button>
            {nextLevel && (
              <Button 
                variant="primary" 
                onClick={handleNextLevel}
              >
                Next Level
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
};

export default GameBoard;
