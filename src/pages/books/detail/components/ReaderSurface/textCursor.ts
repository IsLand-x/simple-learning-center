interface ReaderTextCursorPalette {
  accentColor: string;
  paperColor: string;
  textColor: string;
}

const CURSOR_SIZE = 28;
const CURSOR_HOTSPOT = CURSOR_SIZE / 2;

export function createReaderTextSelectionCursor({
  accentColor,
  paperColor,
  textColor,
}: ReaderTextCursorPalette) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 ${CURSOR_SIZE} ${CURSOR_SIZE}"><g fill="none" stroke-linecap="round"><circle cx="14" cy="14" r="10.5" stroke="${textColor}" stroke-opacity=".42" stroke-width="2.25" stroke-dasharray="7 9.5"/><circle cx="14" cy="14" r="10.5" stroke="${accentColor}" stroke-opacity=".82" stroke-width="1" stroke-dasharray="7 9.5"/><path d="M10 5h8M14 5v18M10 23h8" stroke="${textColor}" stroke-opacity=".94" stroke-width="4"/><path d="M10 5h8M14 5v18M10 23h8" stroke="${paperColor}" stroke-width="2.25"/><path d="M10 5h8M14 5v18M10 23h8" stroke="${accentColor}" stroke-width="1"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${CURSOR_HOTSPOT} ${CURSOR_HOTSPOT}, text`;
}
