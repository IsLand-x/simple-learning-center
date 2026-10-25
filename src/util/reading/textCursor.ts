interface ReaderTextCursorPalette {
  accentColor: string;
  paperColor: string;
  textColor: string;
}

const CURSOR_SIZE = 32;
const CURSOR_HOTSPOT = CURSOR_SIZE / 2;

export function createReaderTextSelectionCursor({
  accentColor,
  paperColor,
  textColor,
}: ReaderTextCursorPalette) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 ${CURSOR_SIZE} ${CURSOR_SIZE}"><g fill="none" stroke-linecap="round"><circle cx="16" cy="16" r="12" stroke="${textColor}" stroke-width="3"/><circle cx="16" cy="16" r="12" stroke="${paperColor}" stroke-width="1.5"/><path d="M12 5h8M16 5v22M12 27h8" stroke="${textColor}" stroke-width="6"/><path d="M12 5h8M16 5v22M12 27h8" stroke="${paperColor}" stroke-width="3.5"/><path d="M12 5h8M16 5v22M12 27h8" stroke="${accentColor}" stroke-width="1.5"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${CURSOR_HOTSPOT} ${CURSOR_HOTSPOT}, text`;
}
