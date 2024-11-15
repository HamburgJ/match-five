import { GameState } from './types';

export const initialGameState: GameState = {
  worlds: [
    {
      id: 'world1',
      name: 'Elements',
      isUnlocked: true,
      isCompleted: false,
      levels: [
        {
          id: 'level1',
          name: 'Basic Elements',
          isUnlocked: true,
          isCompleted: false,
          slots: [
            { id: 'slot111', acceptedWords: ['Strawberry', 'Apple'], currentWord: null, hintWord: 'Red' },
            { id: 'slot112', acceptedWords: ['Eggplant'], currentWord: null, hintWord: 'Purple' },
            { id: 'slot113', acceptedWords: ['Banana', 'Garlic'], currentWord: null, hintWord: 'Yellow' },
            { id: 'slot114', acceptedWords: ['Lettuce', 'Kiwi', 'Strawberry'], currentWord: null, hintWord: 'Green' },
            { id: 'slot115', acceptedWords: ['Blackberry'], currentWord: null, hintWord: 'Black' },
          ],
          availableWords: [
            { id: 'w111', text: 'Strawberry' },
            { id: 'w112', text: 'Eggplant' },
            { id: 'w113', text: 'Banana' },
            { id: 'w114', text: 'Kiwi' },
            { id: 'w115', text: 'Blackberry' },
    
          ]
        },
        {
          id: 'level2',
          name: 'Fruits',
          isUnlocked: false,
          isCompleted: false,
          slots: [
            { id: 'slot121', acceptedWords: ['Apple'], currentWord: null, hintWord: 'Orange' },
            { id: 'slot122', acceptedWords: ['Blueberry'], currentWord: null, hintWord: 'Blue' },
            { id: 'slot123', acceptedWords: ['Grape', 'Blueberry', 'Blackberry'], currentWord: null, hintWord: 'Purple' },
            { id: 'slot124', acceptedWords: ['Garlic', 'Strawberry'], currentWord: null, hintWord: 'White' },
            { id: 'slot125', acceptedWords: ['Kiwi'], currentWord: null, hintWord: 'Brown' }
          ],
          availableWords: [
            { id: 'w121', text: 'Apple' },
            { id: 'w122', text: 'Blueberry' },
            { id: 'w123', text: 'Grape' },
            { id: 'w124', text: 'Garlic' },
            { id: 'w125', text: 'Lettuce' },
          ]
        }
      ]
    }
    // Add more worlds following the same pattern
  ],
  currentWorld: null,
  currentLevel: null,
  inventory: []
}; 

// wind
// flower
// runner
// fire
// plant
// spring
// scale
// bat
// match

//