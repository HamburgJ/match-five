import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Container, Row, Col } from 'react-bootstrap';
import { RootState } from '../store/store';
import { setCurrentLevel } from '../store/gameSlice';

const LevelSelector: React.FC = () => {
  const dispatch = useDispatch();
  const currentWorld = useSelector((state: RootState) => {
    const worldId = state.game.currentWorld;
    return state.game.worlds.find(w => w.id === worldId);
  });

  if (!currentWorld) return null;

  return (
    <Container>
      <Row className="g-4">
        {currentWorld.levels.map(level => (
          <Col key={level.id} xs={12} sm={6} md={4}>
            <Card 
              onClick={() => level.isUnlocked && dispatch(setCurrentLevel(level.id))}
              className={`h-100 ${!level.isUnlocked ? 'opacity-50' : ''}`}
            >
              <Card.Body>
                <Card.Title>Level {level.id}</Card.Title>
                <Card.Text>
                  {level.isUnlocked ? 'Click to play' : 'Complete previous level to unlock'}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default LevelSelector; 