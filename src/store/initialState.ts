import { GameState } from './types';
import { parseGameData } from '../utils/gameDataParser';

export const initialGameState: GameState = parseGameData(); 