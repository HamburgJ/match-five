import ReactGA from 'react-ga4';

const GA_ID = process.env.REACT_APP_GA_ID || process.env.VITE_GA_ID || process.env.CF_GA_ID;
const isProduction = process.env.NODE_ENV === 'production';
const gameSlug = 'match_five';
let gameStarted = false;

type EventParams = Record<string, string | number | boolean | undefined>;

const logStandardEvent = (eventName: string, params: EventParams = {}) => {
  if (!GA_ID) return;

  try {
    ReactGA.event(eventName, { game: gameSlug, ...params });
  } catch (error) {
    if (!isProduction) {
      console.warn(`Failed to log ${eventName}:`, error);
    }
  }
};

export const initGA = () => {
  if (!GA_ID) {
    if (!isProduction) {
      console.log('Analytics disabled: No measurement ID available');
    }
    return;
  }

  try {
    ReactGA.initialize(GA_ID, {
      gaOptions: {
        debug_mode: !isProduction
      }
    });
    // Send initial pageview
    ReactGA.send({
      hitType: "pageview",
      page: window.location.pathname,
      title: "Match Five - Word Association Game"
    });
  } catch (error) {
    if (!isProduction) {
      console.warn('Failed to initialize Google Analytics:', error);
    }
  }
};

export const logPageView = (page: string) => {
  if (!GA_ID) return;

  try {
    ReactGA.send({
      hitType: "pageview",
      page,
      title: "Match Five - Word Association Game"
    });
  } catch (error) {
    if (!isProduction) {
      console.warn('Failed to log page view:', error);
    }
  }
};

export const logGameEvent = (action: string, label?: string, value?: number) => {
  if (!GA_ID) return;

  try {
    ReactGA.event({
      category: 'Game',
      action,
      label,
      value
    });
  } catch (error) {
    if (!isProduction) {
      console.warn('Failed to log game event:', error);
    }
  }
};

export const logMatchFiveStart = (surface: 'home' | 'level', detail?: string) => {
  if (gameStarted) return;
  gameStarted = true;
  logStandardEvent('game_start', { surface, detail });
};

export const logMatchFiveLevelSolved = (level: number, isFinalLevel: boolean) => {
  logStandardEvent('puzzle_solved', { detail: `level_${level}`, level });
  logStandardEvent('level_complete', { level });
  if (isFinalLevel) {
    logStandardEvent('game_complete', { result: 'all_levels_complete', score: level });
  }
};

export const logMatchFiveRetry = (level: number) => {
  logStandardEvent('retry', { level });
};
