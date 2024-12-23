import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { Row, Col, Modal, Button } from 'react-bootstrap';
import { RootState } from '../store/store';
import { placeWord, addToInventory, checkSolution, markSectionComplete, setCurrentSection } from '../store/gameSlice';
import { Word, Slot, Section, Hint, HintDictionary } from '../store/types';
import TutorialOverlay from './TutorialOverlay';
import gameData from '../data/gameData.json';
import '../styles/GameBoard.css';
import WordTile from './WordTile';

interface SectionWithId extends Section {
  id: string;
}

interface SectionCompletion {
  isComplete: boolean;
}

interface LevelCompletion {
  isComplete: boolean;
  uniqueSolutions: Set<string>;
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
  
  // Get the current level and hints from Redux store
  const level = useSelector((state: RootState) => {
    const levelIndex = parseInt(levelId.split('_')[1]) - 1;
    return state.game.levels[levelIndex];
  });
  
  const hints = useSelector((state: RootState) => state.game.hints);

  // Check if a level is complete
  const isLevelComplete = (levelId: string): boolean => {
    const saved = localStorage.getItem(`level_completion_${levelId}`);
    if (!saved) return false;
    const completion = JSON.parse(saved);
    return completion.isComplete;
  };

  // Check if the level is accessible
  const isLevelAccessible = (levelId: string): boolean => {
    if (levelId === 'level_1') return true;
    const levelNum = parseInt(levelId.split('_')[1]);
    const previousLevelId = `level_${levelNum - 1}`;
    return isLevelComplete(previousLevelId);
  };

  // Redirect to home if level is not accessible
  useEffect(() => {
    if (!isLevelAccessible(levelId)) {
      navigate('/');
    }
  }, [levelId, navigate]);

  // Helper function to check if a section is complete
  const checkSectionComplete = (levelId: string, sectionId: string): boolean => {
    if (!level) return false;

    const [_, levelNum, sectionNum] = sectionId.split('_').map(Number);
    const targetSectionIndex = sectionNum - 1;
    if (targetSectionIndex === -1) return false;

    // Check all sections up to and including the target section
    for (let i = 0; i <= targetSectionIndex; i++) {
      const section = level.sections[i];
      const sectionId = `section_${levelNum}_${i + 1}`;
      const saved = localStorage.getItem(`completion_${levelId}_${sectionId}`);
      if (!saved) return false;
      const completion: SectionCompletion = JSON.parse(saved);
      if (!completion.isComplete) return false;
    }

    return true;
  };

  // Get all unlocked sections up to the current section
  const sections = useSelector((state: RootState) => {
    if (!level) return [] as SectionWithId[];
    
    const levelNum = parseInt(levelId.split('_')[1]);
    
    // Find the first incomplete section based on stored completion state
    const currentSectionIndex = level.sections.findIndex(section => {
      const sectionId = `section_${levelNum}_${level.sections.indexOf(section) + 1}`;
      return !checkSectionComplete(levelId, sectionId);
    });
    
    // If all sections are complete, show all sections
    const lastIndex = currentSectionIndex === -1 ? level.sections.length : currentSectionIndex + 1;
    return level.sections.slice(0, lastIndex) as SectionWithId[];
  });

  // Get all slots from unlocked sections in order
  const allSlots = sections.flatMap(section => section.slots);
  
  // Get only the current section's available words
  const currentSection = sections[sections.length - 1] as SectionWithId | undefined;

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
      position: 'top'
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

  // Load and check tutorial state
  useEffect(() => {
    console.log('Tutorial check - Level ID:', levelId);
    console.log('Tutorial check - Sections length:', sections.length);
    console.log('Tutorial check - Level ID type:', typeof levelId);
    console.log('Tutorial check - Level ID strict equality:', levelId === '1');
    console.log('Tutorial check - Level ID includes:', levelId.includes('1'));
    
    if (levelId.includes('level_1')) {
      const hasSeenTutorial = localStorage.getItem('tutorial_completed') === 'true';
      const hasSeenSectionTutorial = localStorage.getItem('section_tutorial_completed') === 'true';
      
      console.log('Tutorial state:', {
        hasSeenTutorial,
        hasSeenSectionTutorial,
        showTutorial,
        tutorialStep
      });
      
      if (!hasSeenTutorial) {
        console.log('Setting showTutorial to true - new user');
        setShowTutorial(true);
      } else if (sections.length === 2 && !hasSeenSectionTutorial) {
        console.log('Setting showTutorial to true - second section unlocked');
        setTutorialStep(0);
        setShowTutorial(true);
      }
    }
  }, [levelId, sections.length]);

  // Load saved game state
  useEffect(() => {
    if (!levelId || !level) return;

    // Load section completion states
    sections.forEach((section, index) => {
      const levelNum = parseInt(levelId.split('_')[1]);
      const sectionId = `section_${levelNum}_${index + 1}`;
      const saved = localStorage.getItem(`completion_${levelId}_${sectionId}`);
      if (saved) {
        const completion = JSON.parse(saved);
        if (completion.isComplete) {
          dispatch(markSectionComplete({ levelId, sectionId }));
        }
      }
    });

    // Load level completion state
    const levelCompletion = localStorage.getItem(`level_completion_${levelId}`);
    if (levelCompletion) {
      const completion = JSON.parse(levelCompletion);
      if (completion.isComplete && completion.uniqueSolutions) {
        completion.uniqueSolutions.forEach((solution: string) => {
          saveLevelSolution(solution);
        });
      }
    }
  }, [levelId, level, sections, dispatch]);

  // Save section completion state
  useEffect(() => {
    if (!currentSection || !levelId || !level) return;

    // Check if ALL slots in ALL unlocked sections are correctly filled
    const areAllSectionsComplete = sections.every(section => 
      section.slots.every(slot => {
        const hint = hints[slot.hintId];
        return slot.currentWord && hint && hint.accepts.includes(slot.currentWord.text);
      })
    );

    if (areAllSectionsComplete) {
      // Save section completion
      localStorage.setItem(
        `completion_${levelId}_${currentSection.id}`,
        JSON.stringify({ isComplete: true })
      );
      dispatch(markSectionComplete({ levelId, sectionId: currentSection.id }));

      // If this was the last section, handle level completion
      if (sections.length === level.sections.length) {
        const solution = level.sections
          .flatMap(section => section.slots)
          .map(slot => slot.currentWord?.text)
          .join(',');
        const isNewSolution = saveLevelSolution(solution);
        if (isNewSolution) {
          setShowLevelCompleteModal(true);
        }
      }
    }
  }, [sections, levelId, currentSection, level, dispatch]);

  // Check for all slots filled but with incorrect words
  useEffect(() => {
    if (!level || !levelId) return;
    
    const hasSeenHintTutorial = localStorage.getItem('hint_tutorial_completed') === 'true';
    if (hasSeenHintTutorial) return;

    const allSlotsFilled = allSlots.every(slot => slot.currentWord);
    const hasIncorrectWord = allSlots.some(slot => {
      const hint = hints[slot.hintId];
      return slot.currentWord && hint && !hint.accepts.includes(slot.currentWord.text);
    });

    if (allSlotsFilled && hasIncorrectWord) {
      setShowHintTutorial(true);
    }
  }, [allSlots, level, levelId]);

  const handleTutorialComplete = () => {
    console.log('Tutorial completed');
    setShowTutorial(false);
    if (sections.length === 1) {
      console.log('Saving initial tutorial completion');
      localStorage.setItem('tutorial_completed', 'true');
    } else {
      console.log('Saving section tutorial completion');
      localStorage.setItem('section_tutorial_completed', 'true');
    }
  };

  const handleTutorialNext = () => {
    console.log('Moving to next tutorial step:', tutorialStep + 1);
    setTutorialStep(prev => prev + 1);
  };

  const handleHintTutorialComplete = () => {
    setShowHintTutorial(false);
    localStorage.setItem('hint_tutorial_completed', 'true');
  };

  const getLevelSolutions = (): Set<string> => {
    const saved = localStorage.getItem(`level_completion_${levelId}`);
    if (!saved) return new Set();
    const completion: LevelCompletion = JSON.parse(saved, (key, value) => 
      key === 'uniqueSolutions' ? new Set(value) : value
    );
    return completion.uniqueSolutions;
  };

  const saveLevelSolution = (solution: string): boolean => {
    const solutions = getLevelSolutions();
    const isNewSolution = !solutions.has(solution);
    solutions.add(solution);
    localStorage.setItem(`level_completion_${levelId}`, JSON.stringify({
      isComplete: true,
      uniqueSolutions: Array.from(solutions)
    }));
    return isNewSolution;
  };

  const nextLevel = useSelector((state: RootState) => {
    const levels = state.game.levels;
    const currentLevelNum = parseInt(levelId.split('_')[1]);
    return currentLevelNum < levels.length ? levels[currentLevelNum] : undefined;
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, slotId: string) => {
    if (!currentSection || !levelId) return;

    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const word = JSON.parse(e.dataTransfer.getData('word')) as Word;
    const sourceLevelId = e.dataTransfer.getData('sourceLevelId');
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
      // Move the existing word to the source slot
      dispatch(placeWord({ 
        levelId, 
        sectionId: sourceSectionId,
        slotId: sourceSlotId, 
        word: existingWord,
        sourceLevelId: levelId,
        sourceSectionId: targetSectionId
      }));
    } else if (existingWord) {
      // If source wasn't a slot (was inventory/available words), move to inventory
      dispatch(placeWord({ 
        levelId, 
        sectionId: targetSectionId,
        slotId: 'inventory', 
        word: existingWord,
        sourceLevelId: levelId,
        sourceSectionId: targetSectionId
      }));
    }
    
    // Place the new word in the target slot
    dispatch(placeWord({ 
      levelId, 
      sectionId: targetSectionId,
      slotId, 
      word,
      sourceLevelId,
      sourceSectionId
    }));
  };

  // Add cleanup function for drag states
  const cleanupDragStates = () => {
    document.querySelectorAll('.drag-over').forEach(element => {
      element.classList.remove('drag-over');
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, word: Word) => {
    if (!currentSection || !levelId) return;

    e.dataTransfer.setData('word', JSON.stringify(word));
    e.dataTransfer.setData('sourceLevelId', levelId);
    
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

    const sectionId = sourceSection?.id || currentSection.id;
    e.dataTransfer.setData('sourceSectionId', sectionId);
    if (sourceSlot) {
      e.dataTransfer.setData('sourceSlotId', sourceSlot.id);
    }
  };

  const handleDragEnd = () => {
    cleanupDragStates();
  };

  const handleInventoryDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!currentSection || !levelId) return;

    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const word = JSON.parse(e.dataTransfer.getData('word')) as Word;
    const sourceLevelId = e.dataTransfer.getData('sourceLevelId');
    const sourceSectionId = e.dataTransfer.getData('sourceSectionId');

    dispatch(placeWord({ 
      levelId, 
      sectionId: currentSection.id,
      slotId: 'inventory', 
      word,
      sourceLevelId,
      sourceSectionId
    }));
  };

  const handleWordClick = (word: Word, fromSlot: boolean = false) => {
    if (!currentSection || !levelId) return;

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
        sourceLevelId: levelId,
        sourceSectionId: sourceSection.id 
      }));
    } else {
      // For words from the available words section
      dispatch(placeWord({ 
        levelId, 
        sectionId: currentSection.id,
        slotId: 'inventory', 
        word,
        sourceLevelId: levelId,
        sourceSectionId: currentSection.id
      }));
    }
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
    if (!levelId) return;
    
    // Move all words from slots to inventory
    sections.forEach(section => {
      section.slots.forEach(slot => {
        if (slot.currentWord) {
          dispatch(placeWord({ 
            levelId, 
            sectionId: section.id,
            slotId: 'inventory', 
            word: slot.currentWord,
            sourceLevelId: levelId,
            sourceSectionId: section.id
          }));
        }
      });
    });
  };

  const getWordEmoji = (word: Word): string | null => {
    return gameData.wordEmojis[word.text] || null;
  };

  if (!level || sections.length === 0 || !currentSection) return null;

  const availableWords = currentSection.availableWords || [];

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
                onDragOver={(e) => {
                  e.preventDefault();
                  const section = e.currentTarget;
                  if (!section.classList.contains('drag-over') && e.target === section) {
                    section.classList.add('drag-over');
                  }
                }}
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
                onDrop={(e) => {
                  e.preventDefault();
                  cleanupDragStates();
                  handleInventoryDrop(e);
                }}
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

        <Modal show={showLevelCompleteModal} onHide={() => setShowLevelCompleteModal(false)} centered>
          <Modal.Header closeButton>
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
            <div className="level-complete-stars">
              {Array(getLevelSolutions().size).fill('⭐').join(' ')}
            </div>
            <div className="level-complete-submessage">
              {nextLevel ? (
                'Can you find more solutions?'
              ) : (
                'More levels coming soon! Stay tuned for new challenges.'
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => navigate('/levels')}>
              Level Select
            </Button>
            {nextLevel ? (
              <>
                <Button variant="info" onClick={() => setShowLevelCompleteModal(false)}>
                  Find More Solutions
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    setShowLevelCompleteModal(false);
                    navigate(`/play/level_${parseInt(levelId.split('_')[1]) + 1}`);
                  }}
                >
                  Next Level
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setShowLevelCompleteModal(false)}>
                Keep Playing
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
};

export default GameBoard; 