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
            { id: 'slot111', acceptedWords: ['Strawberry', 'Apple', 'Rage'], currentWord: null, hintWord: 'Red' },
            { id: 'slot112', acceptedWords: ['Eggplant', 'Potato'], currentWord: null, hintWord: 'Purple' },
            { id: 'slot113', acceptedWords: ['Banana', 'Garlic', 'Potato', 'Lemon'], currentWord: null, hintWord: 'Yellow' },
            { id: 'slot114', acceptedWords: ['Lettuce', 'Kiwi', 'Strawberry', 'Money'], currentWord: null, hintWord: 'Green' },
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
            { id: 'slot121', acceptedWords: ['Apple', 'Pumpkin'], currentWord: null, hintWord: 'Orange' },
            { id: 'slot122', acceptedWords: ['Blueberry', 'Sadness'], currentWord: null, hintWord: 'Blue' },
            { id: 'slot123', acceptedWords: ['Grape', 'Blueberry', 'Blackberry', 'Eggplant'], currentWord: null, hintWord: 'Purple' },
            { id: 'slot124', acceptedWords: ['Garlic', 'Strawberry', 'Potato'], currentWord: null, hintWord: 'White' },
            { id: 'slot125', acceptedWords: ['Kiwi', 'Potato', 'Banana'], currentWord: null, hintWord: 'Brown' }
          ],
          availableWords: [
            { id: 'w121', text: 'Apple' },
            { id: 'w122', text: 'Blueberry' },
            { id: 'w123', text: 'Grape' },
            { id: 'w124', text: 'Garlic' },
            { id: 'w125', text: 'Lettuce' },
          ]
        },
        {
            id: 'level3',
            name: 'Vegetables',
            isUnlocked: false,
            isCompleted: false,
            slots: [
              { id: 'slot131', acceptedWords: ['Apple', 'Banana', 'Grape', 'Kiwi', 'Blackberry', 'Blueberry', 'Eggplant', 'Strawberry', 'Lemon'], currentWord: null, hintWord: 'Fruit' },
              { id: 'slot132', acceptedWords: ['Lettuce', 'Garlic', 'Eggplant', 'Potato', 'Pumpkin'], currentWord: null, hintWord: 'Vegetable' },
              { id: 'slot133', acceptedWords: ['Strawberry', 'Blackberry', 'Kiwi', 'Blueberry'], currentWord: null, hintWord: 'Berry' },
              { id: 'slot134', acceptedWords: ['Lettuce', 'Garlic', 'Eggplant', 'Pumpkin', 'Potato'], currentWord: null, hintWord: 'Vegetable' },
              { id: 'slot135', acceptedWords: ['Apple', 'Banana', 'Grape', 'Kiwi', 'Blackberry', 'Blueberry', 'Eggplant', 'Strawberry', 'Lemon'], currentWord: null, hintWord: 'Fruit' }
            ],
            availableWords: [
              { id: 'w131', text: 'Sadness' }, // blue = sad synonym
              { id: 'w132', text: 'Money' }, // green = envious synonym
              { id: 'w133', text: 'Rage' }, // red = rage synonym
              { id: 'w134', text: 'Potato' },
              { id: 'w135', text: 'Pumpkin' },
            ]
          },
          {
            id: 'level4',
            name: 'Animals',
            isUnlocked: false,
            isCompleted: false,
            slots: [
              { id: 'slot141', acceptedWords: ['Rose', 'River'], currentWord: null, hintWord: 'Flower' },
              { id: 'slot142', acceptedWords: [
                'Strawberry', 'Kiwi', 'Garlic', 'Potato', 'Pumpkin',
                'Eggplant', 'Apple', 'Blueberry', 'Grape', 'Banana', 
                'Blackberry', 'Rose', 'Lemon'
              ], currentWord: null, hintWord: 'Plant' },
              { id: 'slot143', acceptedWords: ['Dog', 'Kiwi', 'Snake'], currentWord: null, hintWord: 'Animal' },
              { id: 'slot144', acceptedWords: ['Garlic', 'Kiwi'], currentWord: null, hintWord: 'Bird' },
              { id: 'slot145', acceptedWords: ['Dog'], currentWord: null, hintWord: 'Mammel' }
            ],
            availableWords: [
              { id: 'w141', text: 'Rose' },
              { id: 'w142', text: 'Lemon' },
              { id: 'w143', text: 'Dog' },
              { id: 'w144', text: 'River' },
              { id: 'w145', text: 'Snake' },
            ]
          },
          {
            id: 'level5',
            name: 'Plants',
            isUnlocked: false,
            isCompleted: false,
            slots: [
              { id: 'slot151', acceptedWords: ['Apple'], currentWord: null, hintWord: 'Orange' },
              { id: 'slot152', acceptedWords: ['Blueberry'], currentWord: null, hintWord: 'Blue' },
              { id: 'slot153', acceptedWords: ['Grape', 'Blueberry', 'Blackberry'], currentWord: null, hintWord: 'Purple' },
              { id: 'slot154', acceptedWords: ['Garlic', 'Strawberry'], currentWord: null, hintWord: 'White' },
              { id: 'slot155', acceptedWords: ['Kiwi'], currentWord: null, hintWord: 'Brown' }
            ],
            availableWords: [
              { id: 'w151', text: 'Apple' },
              { id: 'w152', text: 'Blueberry' },
              { id: 'w153', text: 'Grape' },
              { id: 'w154', text: 'Garlic' },
              { id: 'w155', text: 'Lettuce' },
            ]
          },
      ]
    }
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