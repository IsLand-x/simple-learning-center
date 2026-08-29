export const MOBILE_TEXT_SELECTION_HOLD_MS = 420;

export function isTextSelectionHold(startedAt: number, currentTime: number) {
  return currentTime - startedAt >= MOBILE_TEXT_SELECTION_HOLD_MS;
}
