import { describe, expect, it } from 'vitest';
import type { ReaderPreferences } from '../types';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  getReaderTextureStyle,
  legacyReaderPaperColor,
  normalizeReaderCustomStyle,
  readerDensityFromLineHeight,
  resolveReaderStyle,
} from './readerThemes';

const preferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'custom',
  fontFamily: 'kai',
  customStyle: DEFAULT_READER_CUSTOM_STYLE,
  tocWidth: 280,
  panelWidth: 400,
  tocCollapsed: false,
};

describe('normalizeReaderCustomStyle', () => {
  it('normalizes colors and clamps the supported font size range', () => {
    expect(
      normalizeReaderCustomStyle({
        ...DEFAULT_READER_CUSTOM_STYLE,
        paperColor: '#abcdef',
        textColor: '#123abc',
        fontSize: 99.4,
      }),
    ).toMatchObject({
      paperColor: '#ABCDEF',
      textColor: '#123ABC',
      fontSize: 28,
    });
  });

  it('uses safe defaults for invalid persisted values', () => {
    expect(
      normalizeReaderCustomStyle({
        paperColor: 'invalid',
        textColor: 'invalid',
        fontSize: Number.NaN,
      }),
    ).toEqual(DEFAULT_READER_CUSTOM_STYLE);
  });

  it('chooses a readable fallback text color for dark custom paper', () => {
    expect(normalizeReaderCustomStyle({ paperColor: '#000000' })).toMatchObject({
      paperColor: '#000000',
      textColor: '#E1E5EA',
    });
  });
});

describe('resolveReaderStyle', () => {
  it('derives the palette and expanded density for custom themes', () => {
    expect(resolveReaderStyle(preferences)).toMatchObject({
      paperColor: '#F3EBDD',
      textColor: '#2D2924',
      isDark: false,
      density: {
        id: 'relaxed',
        lineHeight: 2,
        pagePadding: '10%',
      },
    });
  });
});

describe('reader theme compatibility helpers', () => {
  it.each([
    [1.6, 'compact'],
    [1.8, 'balanced'],
    [2, 'relaxed'],
    [undefined, 'balanced'],
  ] as const)('maps line height %s to %s density', (lineHeight, expected) => {
    expect(readerDensityFromLineHeight(lineHeight)).toBe(expected);
  });

  it.each([
    ['night', '#202A36'],
    ['white', '#FAF9F6'],
    ['paper', '#F3EBDD'],
  ])('maps legacy theme %s to %s', (theme, expected) => {
    expect(legacyReaderPaperColor(theme)).toBe(expected);
  });

  it('preserves the no-texture background contract', () => {
    expect(getReaderTextureStyle('none', false)).toEqual({
      backgroundImage: 'none',
      backgroundSize: 'auto',
      backgroundPosition: '0 0',
      backgroundBlendMode: 'normal',
    });
  });
});
