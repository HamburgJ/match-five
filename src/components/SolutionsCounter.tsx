import React from 'react';
import { Card } from 'react-bootstrap';

interface SolutionsCounterProps {
  solutionsCount: number;
}

const SolutionsCounter: React.FC<SolutionsCounterProps> = ({ solutionsCount }) => {
  return (
    <Card className="mt-3 text-center">
      <Card.Body>
        <div className="solutions-count">
          <h6 className="mb-2">Solutions Found</h6>
          <div className="stars">
            {Array(solutionsCount).fill('⭐').join(' ')}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default SolutionsCounter; 