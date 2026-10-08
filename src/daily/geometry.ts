// Geometry custom properties from layout.json (DOSSIER-v2 4.1), in rem so the
// board scales with the reader's text size. Set on every .m5d root.
import type React from 'react';
import layout from './layout.json';

const rem = (px: number) => `${px / 16}rem`;
export const CSS_VARS = {
  '--g-gutter': `${layout.gutter}px`,
  '--g-header': rem(layout.header),
  '--g-sec-head': rem(layout.secHead),
  '--g-gap': `${layout.gap}px`,
  '--g-band-gap': `${layout.bandGap}px`,
  '--g-card': rem(layout.card),
  '--g-card-pad': rem(layout.cardPad),
  '--g-label-lh': rem(layout.labelLh),
  '--g-well': rem(layout.well),
  '--g-tile': rem(layout.tile),
  '--g-status-row': rem(layout.statusRow),
  '--g-tray-cell': rem(layout.trayCell),
  '--g-tray-gap': `${layout.trayGap}px`,
  '--g-bar': rem(layout.bar),
  '--g-dock-pad-top': `${layout.dockPadTop}px`,
  '--g-dock-pad-bottom': `${layout.dockPadBottom}px`,
  '--g-column-max': `${layout.columnMax}px`,
  '--g-min-secondary': rem(layout.minSecondaryTarget),
} as React.CSSProperties;

