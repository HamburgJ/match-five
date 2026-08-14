// Web Share API helper, mirroring the parent site's src/utils/webShare.ts.
// Feature-detected: callers keep their copy button and only ADD a share
// button when the API exists (mostly mobile share sheets).

export const canWebShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Open the native share sheet with plain text.
 * Resolves 'shared' on success, 'cancelled' when the user dismissed the sheet,
 * 'failed' on anything else (callers can fall back to clipboard).
 */
export const webShareText = async (text: string): Promise<'shared' | 'cancelled' | 'failed'> => {
  if (!canWebShare()) return 'failed';
  try {
    await navigator.share({ text });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
};
