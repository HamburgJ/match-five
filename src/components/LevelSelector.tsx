import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Card, Container } from 'react-bootstrap';
import { RootState } from '../store/store';
import { FaLock, FaCheck, FaChevronRight } from 'react-icons/fa';

interface LevelCompletion {
  isComplete: boolean;
  uniqueSolutions: string[];
}

interface SectionCompletion {
  isComplete: boolean;
}

const LevelSelector: React.FC = () => {
  const navigate = useNavigate();
  const levels = useSelector((state: RootState) => state.game.levels);

  const isLevelAccessible = (levelIndex: number): boolean => {
    if (levelIndex === 0) return true;
    const previousLevel = levels[levelIndex - 1];
    return isLevelComplete(`level_${levelIndex}`);
  };

  const isLevelComplete = (levelId: string): boolean => {
    const saved = localStorage.getItem(`level_completion_${levelId}`);
    if (!saved) return false;
    const completion: LevelCompletion = JSON.parse(saved);
    return completion.isComplete;
  };

  const getLevelSolutions = (levelId: string): string[] => {
    const saved = localStorage.getItem(`level_completion_${levelId}`);
    if (!saved) return [];
    const completion: LevelCompletion = JSON.parse(saved);
    return completion.uniqueSolutions;
  };

  const isSectionComplete = (levelId: string, sectionId: string): boolean => {
    const level = levels.find(l => l.id === levelId);
    if (!level) return false;

    const targetSectionIndex = level.sections.findIndex(s => s.id === sectionId);
    if (targetSectionIndex === -1) return false;

    for (let i = 0; i <= targetSectionIndex; i++) {
      const section = level.sections[i];
      const saved = localStorage.getItem(`completion_${levelId}_${section.id}`);
      if (!saved) return false;
      const completion: SectionCompletion = JSON.parse(saved);
      if (!completion.isComplete) return false;
    }

    return true;
  };

  return (
    <Container className="level-select-container">
      <h2 className="level-select-title">Select a Level</h2>
      <div className="levels-grid">
        {levels.map((level, index) => {
          const levelId = `level_${index + 1}`;
          const isLevelUnlocked = isLevelAccessible(index);
          const isComplete = isLevelComplete(levelId);
          const solutions = getLevelSolutions(levelId);
          const completedSections = level.sections.filter((section, sectionIndex) => 
            isSectionComplete(levelId, `section_${index + 1}_${sectionIndex + 1}`)
          ).length;

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
                      {completedSections} / {level.sections.length} sections
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
                
                {solutions.length > 0 && (
                  <div className="solutions-row">
                    <div className="solutions-stars">
                      {Array(solutions.length).fill('⭐').join(' ')}
                    </div>
                  </div>
                )}
                
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