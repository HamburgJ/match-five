// Under prefers-reduced-motion Bootstrap drops its fade transitions, and the
// react-bootstrap modal then never finishes closing: the closed dialog stays
// mounted, invisible, over the game and swallows every tap. Modals skip the
// animation for these players instead.
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
