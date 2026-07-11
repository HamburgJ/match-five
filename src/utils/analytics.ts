import ReactGA from 'react-ga4';

const GA_ID = import.meta.env.VITE_GA_ID || import.meta.env.CF_GA_ID;
const isProduction = import.meta.env.PROD;

type AnalyticsValue = string | number | boolean | undefined;
export type GameEventParameters = Record<string, AnalyticsValue>;

export const initGA = () => {
  if (!GA_ID) {
    if (!isProduction) console.log('Analytics disabled: no measurement ID available');
    return;
  }

  try {
    ReactGA.initialize(GA_ID, { gaOptions: { debug_mode: !isProduction } });
  } catch (error) {
    if (!isProduction) console.warn('Failed to initialize Google Analytics:', error);
  }
};

export const logPageView = (page: string) => {
  if (!GA_ID) return;
  ReactGA.send({
    hitType: 'pageview',
    page,
    title: 'Match Five - Word Association Game',
  });
};

export const logGameEvent = (action: string, parameters: GameEventParameters = {}) => {
  if (!GA_ID) return;
  ReactGA.event(action, {
    game_name: 'Match Five',
    ...parameters,
  });
};
