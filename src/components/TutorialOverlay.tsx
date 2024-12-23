import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TutorialStep {
  targetSelector: string;
  message: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

interface TutorialOverlayProps {
  isVisible: boolean;
  currentStep: number;
  steps: TutorialStep[];
  onComplete: () => void;
  onNext: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isVisible,
  currentStep,
  steps,
  onComplete,
  onNext,
}) => {
  const currentTutorialStep = steps[currentStep];
  const [messagePosition, setMessagePosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (isVisible && currentTutorialStep) {
      const targetElement = document.querySelector(currentTutorialStep.targetSelector);
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const spotlight = document.querySelector('.tutorial-spotlight') as HTMLElement;
        
        if (spotlight) {
          spotlight.style.left = `${rect.left - 10}px`;
          spotlight.style.top = `${rect.top - 10}px`;
          spotlight.style.width = `${rect.width + 20}px`;
          spotlight.style.height = `${rect.height + 20}px`;

          const messageWidth = 300;
          const messageHeight = 120;
          const padding = 20;
          const viewportPadding = 20;

          let top = 0;
          let left = 0;

          switch (currentTutorialStep.position) {
            case 'top':
              top = rect.top - messageHeight - padding;
              left = rect.left + (rect.width - messageWidth) / 2;
              break;
            case 'bottom':
              top = rect.bottom + padding;
              left = rect.left + (rect.width - messageWidth) / 2;
              break;
            case 'left':
              top = rect.top + (rect.height - messageHeight) / 2;
              left = rect.left - messageWidth - padding;
              break;
            case 'right':
              top = rect.top + (rect.height - messageHeight) / 2;
              left = rect.right + padding;
              break;
          }

          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          if (left < viewportPadding) {
            left = viewportPadding;
          } else if (left + messageWidth > viewportWidth - viewportPadding) {
            left = viewportWidth - messageWidth - viewportPadding;
          }

          if (top < viewportPadding) {
            top = viewportPadding;
          } else if (top + messageHeight > viewportHeight - viewportPadding) {
            top = viewportHeight - messageHeight - viewportPadding;
          }

          setMessagePosition({ top, left });
        }
      }
    }
  }, [isVisible, currentStep, currentTutorialStep]);

  if (!isVisible) return null;

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-spotlight" />
      <div 
        className="tutorial-message"
        style={{
          position: 'fixed',
          top: messagePosition.top,
          left: messagePosition.left,
          background: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          maxWidth: '300px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          zIndex: 10001,
        }}
      >
        <p style={{ margin: '0 0 16px 0' }}>
          {currentTutorialStep.message}
        </p>
        <button
          onClick={currentStep === steps.length - 1 ? onComplete : onNext}
          style={{
            background: '#2196f3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {currentStep === steps.length - 1 ? 'Got it!' : 'Next'}
        </button>
      </div>
    </div>
  );
};

export default TutorialOverlay; 