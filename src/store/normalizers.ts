import { normalizeReaderCustomStyle, READER_THEME_PRESETS } from '../util/reading/readerThemes';
import type { ReaderCustomStyle, ReaderFont, ReaderTheme } from '../../contracts/reading';

export function normalizeReaderFont(font: unknown): ReaderFont {
  if (font === 'kai' || font === 'wenkai-screen') return 'kai';
  if (font === 'source-serif') return 'source-serif';
  if (font === 'bright') return 'bright';
  if (font === 'sans') return 'sans';
  if (font === 'pingfang' || font === 'mi-lanting' || font === 'yahei') return 'pingfang';
  return 'system-serif';
}

export function normalizeStoredCustomStyle(style: Partial<ReaderCustomStyle> | undefined) {
  return normalizeReaderCustomStyle({
    ...style,
    fontFamily: normalizeReaderFont(style?.fontFamily),
  });
}

export function normalizeReaderTheme(theme: unknown): ReaderTheme {
  return READER_THEME_PRESETS.find((preset) => preset.id === theme)?.id ?? 'custom';
}
