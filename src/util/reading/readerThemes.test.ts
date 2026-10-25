import { describe, expect, it } from 'vitest';
import type { ReaderPreferences } from '../../../contracts/reading';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  getReaderTextureStyle,
  legacyReaderPaperColor,
  normalizeReaderCustomStyle,
  readerDensityFromLineHeight,
  resolveReaderStyle,
  upgradeReaderTypography,
  READER_THEME_PRESETS,
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

  it('keeps typography independent of the selected paper palette', () => {
    const customized: ReaderPreferences = {
      ...preferences,
      paragraphStyle: 'book',
      fontFamily: 'sans',
      fontSize: 23,
      lineHeight: 1.6,
    };
    for (const preset of READER_THEME_PRESETS) {
      expect(resolveReaderStyle({ ...customized, theme: preset.id })).toMatchObject({
        fontFamily: 'sans',
        fontSize: 23,
        density: { id: 'compact', lineHeight: 1.6 },
        paragraphSpacing: 0,
        paragraphIndent: '2em',
        letterSpacing: 'normal',
        textAlign: 'justify',
        paperColor: preset.paperColor,
      });
    }
    expect(new Set(READER_THEME_PRESETS.map((preset) => preset.id)).size).toBe(20);
  });

  it('supports spaced paragraphs with the same font and line-height controls', () => {
    expect(
      resolveReaderStyle({
        ...preferences,
        paragraphStyle: 'spaced',
        fontFamily: 'source-serif',
        fontSize: 22,
        lineHeight: 1.8,
      }),
    ).toMatchObject({
      fontFamily: 'source-serif',
      fontSize: 22,
      paragraphSpacing: 1.25,
      paragraphIndent: '0',
      letterSpacing: '0.005em',
      textAlign: 'start',
    });
  });

  it('preserves the actual legacy custom typography rather than its unused top-level values', () => {
    const legacy = {
      ...preferences,
      customStyle: {
        ...DEFAULT_READER_CUSTOM_STYLE,
        fontFamily: 'bright' as const,
        fontSize: 24,
        density: 'compact' as const,
      },
    };
    const upgraded = upgradeReaderTypography(legacy);
    expect(upgraded).toMatchObject({
      fontFamily: 'bright',
      fontSize: 24,
      lineHeight: 1.6,
      paragraphStyle: 'spaced',
      customStyle: legacy.customStyle,
    });
    expect(upgradeReaderTypography(upgraded)).toBe(upgraded);
  });

  it('initializes a legacy preset from its visible settings', () => {
    expect(upgradeReaderTypography({ ...preferences, theme: 'ivory' })).toMatchObject({
      fontFamily: 'system-serif',
      fontSize: 18,
      lineHeight: 1.8,
      paragraphStyle: 'book',
    });
  });

  it('keeps body text contrast above 7:1 for every built-in paper palette', () => {
    const luminance = (color: string) => {
      const channels = [1, 3, 5].map((start) => {
        const value = Number.parseInt(color.slice(start, start + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const preset of READER_THEME_PRESETS) {
      const values = [luminance(preset.paperColor), luminance(preset.textColor)].sort(
        (a, b) => b - a,
      );
      expect((values[0] + 0.05) / (values[1] + 0.05), preset.id).toBeGreaterThanOrEqual(7);
    }
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
