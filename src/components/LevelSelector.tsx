import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Card, Container } from 'react-bootstrap';
import { RootState } from '../store/store';
import { FaLock, FaCheck, FaChevronRight } from 'react-icons/fa';
import { DEVELOPER_MODE } from '../constants/storage';

const LevelSelector: React.FC = () => {
  const navigate = useNavigate();
  const levels = useSelector((state: RootState) => state.game.levels);
  const levelProgress = useSelector((state: RootState) => state.game.levelProgress);

  const isLevelAccessible = (levelIndex: number): boolean => {
    if (DEVELOPER_MODE) return true; // Allow all levels in developer mode
    if (levelIndex === 0) return true;
    // To check if level N is accessible, we need to check if level N-1 is complete
    // levelIndex is 0-based but level IDs are 1-based
    const previousLevelId = `level_${levelIndex}`; // For level 2 (index 1), check level_1
    const solutionsCount = levelProgress[previousLevelId]?.solutions?.length ?? 0;
    return solutionsCount > 0;
  };

  const isLevelComplete = (levelId: string): boolean => {
    return (levelProgress[levelId]?.solutions?.length ?? 0) > 0;
  };

  const getCompletedSectionsCount = (levelId: string): number => {
    const progress = levelProgress[levelId];
    if (!progress?.sections) return 0;

    // A section is complete if all its slots have correct words
    return Object.values(progress.sections)
        .filter(section => {
            // Check if all slots in this section have correct words
            return Object.values(section.slots)
                .every(slot => slot.currentWord !== null);
        }).length;
  };

  return (
    <Container className="level-select-container">
      <h2 className="level-select-title">Select a Level</h2>
      <div className="levels-grid">
        {levels.map((level, index) => {
          const levelId = `level_${index + 1}`;
          const isLevelUnlocked = isLevelAccessible(index);
          const isComplete = isLevelComplete(levelId);

          return (
            <Card 
              key={levelId}
              onClick={() => isLevelUnlocked && navigate(`/play/${levelId}`)}
              className={`level-select-card ${isComplete ? 'completed' : ''} ${!isLevelUnlocked ? 'locked' : ''}`}
            >
              <Card.Body>
                <div className="level-header">
                  <div className="level-info">
                    <h3 className="level-name">{level.name || `Level ${index + 1}`}</h3>
                    <div className="level-progress">
                      {isComplete ? 
                        'Completed' :
                        `${level.sections.length} sections`
                      }
                    </div>
                  </div>
                  {!isLevelUnlocked ? (
                    <div className="level-status locked">
                      <FaLock />
                    </div>
                  ) : isComplete ? (
                    <div className="level-status complete">
                      <FaCheck />
                    </div>
                  ) : (
                    <div className="level-status">
                      <FaChevronRight />
                    </div>
                  )}
                </div>
                
                {!isLevelUnlocked && (
                  <div className="locked-message">
                    Complete previous level to unlock
                  </div>
                )}
              </Card.Body>
            </Card>
          );
        })}
        
        {/* Coming Soon Card */}
        <Card className="level-select-card coming-soon">
          <Card.Body>
            <div className="level-header">
              <div className="level-info">
                <h3 className="level-name">New Levels Coming Soon</h3>
                <div className="level-progress">
                  Stay tuned for more challenges!
                </div>
              </div>
              <div className="level-status">
                <FaChevronRight />
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    </Container>
  );
};

export default LevelSelector; 