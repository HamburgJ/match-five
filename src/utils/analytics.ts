import ReactGA from 'react-ga4';

// Create React App only inlines REACT_APP_* at build time; the other names are
// kept for builds that export them. The literal is burgerfun.ca's public GA4
// measurement id — the fallback so a build with no env var still reports
// instead of shipping dark (what happened from 2026-09-03 to 2026-09-11).
const GA_ID =
  process.env.REACT_APP_GA_ID || process.env.VITE_GA_ID || process.env.CF_GA_ID || 'G-3ZP8KNH2V1';
const isProduction = process.env.NODE_ENV === 'production';
const gameSlug = 'match_five';
let gameStarted = false;

// GA starts only on the production site, and never under automation, so local
// dev, preview deploys, any copy on another host (the old GitHub Pages site)
// and Playwright runs stay out of burgerfun.ca's GA4 property. The id is
// hard-coded above, so without this guard every build anywhere reports.
const PRODUCTION_HOSTNAME = 'burgerfun.ca';
let analyticsStarted = false;

const isProductionVisit = (): boolean => {
  try {
    if (typeof window === 'undefined' || window.location.hostname !== PRODUCTION_HOSTNAME) return false;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
    return true;
  } catch {
    return false;
  }
};

/** True once initGA has started GA on burgerfun.ca; every logger is a no-op until then. */
export const isAnalyticsActive = () => analyticsStarted;

type EventParams = Record<string, string | number | boolean | undefined>;

const logStandardEvent = (eventName: string, params: EventParams = {}) => {
  if (!analyticsStarted) return;

  try {
    ReactGA.event(eventName, { game: gameSlug, ...params });
  } catch (error) {
    if (!isProduction) {
      console.warn(`Failed to log ${eventName}:`, error);
    }
  }
};

export const initGA = () => {
  if (analyticsStarted) return;
  if (!GA_ID) {
    if (!isProduction) {
      console.log('Analytics disabled: No measurement ID available');
    }
    return;
  }
  if (!isProductionVisit()) {
    if (!isProduction) {
      console.log(`Analytics off: only ${PRODUCTION_HOSTNAME}, and never under automation`);
    }
    return;
  }

  try {
    ReactGA.initialize(GA_ID, {
      gaOptions: {
        debug_mode: !isProduction
      },
      gtagOptions: {
        // ReactGA.send below owns the initial page view. Without this, the
        // config call and the explicit send both record the same visit.
        send_page_view: false
      }
    });
    analyticsStarted = true;
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
  if (!analyticsStarted) return;

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
  if (!analyticsStarted) return;

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

// Matches the parent site's logShare taxonomy (event 'share' with a `method`
// param). Call sites only fire this on a successful copy or a completed native
// share — a dismissed share sheet logs nothing.
export const logMatchFiveShare = (method: 'copy' | 'web_share') => {
  logStandardEvent('share', { method });
};

// Matches the parent site's cross_game_click taxonomy: fired when a player
// follows a link out of the game back into the burgerfun portfolio.
export const logMatchFiveCrossClick = (dest: string) => {
  logStandardEvent('cross_game_click', { dest });
};
