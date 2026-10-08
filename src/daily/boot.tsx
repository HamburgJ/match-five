// Daily mode boot: self-hosted fonts with metric-matched fallbacks, the daily's
// own manifest and touch icon, then the app. Imported lazily by src/index.tsx,
// so the campaign's Redux store, redux-persist, react-bootstrap, HashRouter and
// gameData.json never load on /match-five/daily/.
import React from 'react';
import ReactDOM from 'react-dom/client';
import DailyApp from './DailyApp';
import './daily.css';

const BASE = process.env.PUBLIC_URL || '/match-five';

/*
 * Outfit is a real font file (OFL, public/fonts/OFL-Outfit.txt), subset to Latin
 * and limited to weights 600-700. The fallback faces carry size-adjust and ascent
 * and descent overrides computed from the real metrics (Outfit 600 against Arial
 * Bold: avg advance 0.4563 vs 0.4841 em), so a late font load reflows nothing.
 * Roboto is the system font on Android (local()); elsewhere the page's Roboto
 * stylesheet or the Arial-based fallback with Roboto's published metrics serves.
 */
const FONT_CSS = `
@font-face{font-family:'M5 Outfit';src:url('${BASE}/fonts/outfit-600-700.woff2') format('woff2');font-weight:600 700;font-style:normal;font-display:swap}
@font-face{font-family:'M5 Outfit Fallback';src:local('Arial Bold'),local('Arial-BoldMT'),local('Helvetica Bold'),local('Liberation Sans Bold');font-weight:600 700;size-adjust:94.26%;ascent-override:106.09%;descent-override:27.58%;line-gap-override:0%}
@font-face{font-family:'M5 Roboto';src:local('Roboto'),local('Roboto-Regular');font-weight:400;font-display:swap}
@font-face{font-family:'M5 Roboto';src:local('Roboto Medium'),local('Roboto-Medium');font-weight:500;font-display:swap}
@font-face{font-family:'M5 Roboto Fallback';src:local('Arial'),local('ArialMT'),local('Helvetica'),local('Liberation Sans');size-adjust:100.3%;ascent-override:92.77%;descent-override:24.41%;line-gap-override:0%}
`;

const setLink = (rel: string, href: string, extra: Record<string, string> = {}) => {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
};

export const bootDaily = (container: HTMLElement) => {
  try {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'font';
    preload.type = 'font/woff2';
    preload.crossOrigin = 'anonymous';
    preload.href = `${BASE}/fonts/outfit-600-700.woff2`;
    document.head.appendChild(preload);
    const style = document.createElement('style');
    style.setAttribute('data-m5d-fonts', '');
    style.textContent = FONT_CSS;
    document.head.appendChild(style);
    // The shell sets these in production; this keeps a plain /match-five/ document honest too.
    setLink('manifest', `${BASE}/manifest-daily.json`);
    setLink('apple-touch-icon', `${BASE}/icons/apple-touch-icon.png`);
    document.body.classList.add('m5d-body');
    if (!/Daily/.test(document.title)) document.title = 'Match Five Daily | burger fun';
  } catch {
    /* cosmetic only */
  }
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <DailyApp />
    </React.StrictMode>,
  );
};
