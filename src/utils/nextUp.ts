// Pause points for burgerfun.ca's "Next up" row. The site injects the runtime
// and defines <burger-next-cards>; in any other build nothing listens, the
// events are no-ops and the slot stays an empty, zero-size element.
export type PauseKind = 'level-complete' | 'game-complete';

const announce = (type: 'burgerfun:pause' | 'burgerfun:resume', detail?: { kind: PauseKind }) => {
  try {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  } catch {
    // No DOM: nothing is listening.
  }
};

/** A level (or the last level) was just cleared. */
export const announcePause = (kind: PauseKind) => announce('burgerfun:pause', { kind });

/** Play restarted: Play Again or Next Level. */
export const announceResume = () => announce('burgerfun:resume');
