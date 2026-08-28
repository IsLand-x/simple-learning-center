import type {
  ReaderCustomStyle,
  ReaderDensity,
  ReaderFont,
  ReaderPreferences,
  ReaderTheme,
  ReaderTexture,
} from '../types';

type PresetTheme = Exclude<ReaderTheme, 'custom'>;

interface ReaderPalette {
  paperColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  highlightColor: string;
  calloutColor: string;
  isDark: boolean;
}

export interface ReaderThemePreset extends ReaderPalette {
  id: PresetTheme;
  name: string;
  description: string;
  fontFamily: ReaderFont;
  texture: ReaderTexture;
  fontSize: number;
  density: ReaderDensity;
}

export interface ReaderTexturePreset {
  id: ReaderTexture;
  label: string;
  description: string;
}

export interface ReaderDensityPreset {
  id: ReaderDensity;
  label: string;
  lineHeight: number;
  paragraphSpacing: number;
  pagePadding: string;
  letterSpacing: string;
}

export const READER_DENSITY_PRESETS: ReaderDensityPreset[] = [
  {
    id: 'compact',
    label: '紧凑',
    lineHeight: 1.6,
    paragraphSpacing: 1,
    pagePadding: '4%',
    letterSpacing: '0',
  },
  {
    id: 'balanced',
    label: '适中',
    lineHeight: 1.8,
    paragraphSpacing: 1.25,
    pagePadding: '7%',
    letterSpacing: '0.005em',
  },
  {
    id: 'relaxed',
    label: '舒展',
    lineHeight: 2,
    paragraphSpacing: 1.45,
    pagePadding: '10%',
    letterSpacing: '0.01em',
  },
];

export const READER_TEXTURE_PRESETS: ReaderTexturePreset[] = [
  { id: 'none', label: '无纹理', description: '保持纯净纸面' },
  { id: 'paper', label: '细腻纸纹', description: '轻微纤维层次' },
  { id: 'grain', label: '柔和颗粒', description: '减弱屏幕平滑感' },
];

export const READER_THEME_PRESETS: ReaderThemePreset[] = [
  {
    id: 'paper',
    name: '经典宣纸',
    description: '温润舒展',
    paperColor: '#F3EBDD',
    textColor: '#2D2924',
    mutedTextColor: '#70685D',
    accentColor: '#876A3D',
    highlightColor: '#E2C66A',
    calloutColor: '#EAE0CD',
    isDark: false,
    fontFamily: 'kai',
    texture: 'paper',
    fontSize: 18,
    density: 'relaxed',
  },
  {
    id: 'ivory',
    name: '简净阅读',
    description: '柔和象牙白',
    paperColor: '#FAF9F6',
    textColor: '#252525',
    mutedTextColor: '#696866',
    accentColor: '#456C91',
    highlightColor: '#F0D983',
    calloutColor: '#F0EFEB',
    isDark: false,
    fontFamily: 'system-serif',
    texture: 'none',
    fontSize: 18,
    density: 'balanced',
  },
  {
    id: 'mist',
    name: '杏仁手札',
    description: '暖杏轻盈',
    paperColor: '#F4E7D8',
    textColor: '#43362D',
    mutedTextColor: '#76675B',
    accentColor: '#956B4C',
    highlightColor: '#E6C58F',
    calloutColor: '#EBDAC7',
    isDark: false,
    fontFamily: 'bright',
    texture: 'paper',
    fontSize: 18,
    density: 'balanced',
  },
  {
    id: 'celadon',
    name: '青瓷护眼',
    description: '淡雅灰绿',
    paperColor: '#E4ECE4',
    textColor: '#263129',
    mutedTextColor: '#617065',
    accentColor: '#4C7660',
    highlightColor: '#BDD6BD',
    calloutColor: '#D7E3D8',
    isDark: false,
    fontFamily: 'kai',
    texture: 'grain',
    fontSize: 18,
    density: 'relaxed',
  },
  {
    id: 'twilight',
    name: '暮蓝夜读',
    description: '低眩光深蓝',
    paperColor: '#202A36',
    textColor: '#D8E1EA',
    mutedTextColor: '#9FAFBE',
    accentColor: '#8CB9E3',
    highlightColor: '#526B45',
    calloutColor: '#2A3745',
    isDark: true,
    fontFamily: 'kai',
    texture: 'grain',
    fontSize: 18,
    density: 'relaxed',
  },
  {
    id: 'rice',
    name: '米白宋韵',
    description: '清雅纸书',
    paperColor: '#F8F4E8',
    textColor: '#302C26',
    mutedTextColor: '#70695E',
    accentColor: '#806B4C',
    highlightColor: '#E7CF83',
    calloutColor: '#EEE7D8',
    isDark: false,
    fontFamily: 'source-serif',
    texture: 'paper',
    fontSize: 19,
    density: 'relaxed',
  },
  {
    id: 'azure',
    name: '云水蓝笺',
    description: '清透冷静',
    paperColor: '#EDF3F5',
    textColor: '#27383E',
    mutedTextColor: '#61747B',
    accentColor: '#477D91',
    highlightColor: '#C5DFE8',
    calloutColor: '#DFEAED',
    isDark: false,
    fontFamily: 'sans',
    texture: 'none',
    fontSize: 18,
    density: 'balanced',
  },
  {
    id: 'ink',
    name: '墨夜宋读',
    description: '沉静深灰',
    paperColor: '#181B1F',
    textColor: '#D9D5CC',
    mutedTextColor: '#A6A198',
    accentColor: '#B5A67E',
    highlightColor: '#665C35',
    calloutColor: '#23272C',
    isDark: true,
    fontFamily: 'source-serif',
    texture: 'grain',
    fontSize: 18,
    density: 'relaxed',
  },
];

export const DEFAULT_READER_CUSTOM_STYLE: ReaderCustomStyle = {
  fontFamily: 'kai',
  paperColor: '#F3EBDD',
  textColor: '#2D2924',
  texture: 'paper',
  fontSize: 18,
  density: 'relaxed',
};

const HEX_COLOR = /^#([\da-f]{6})$/i;

function normalizeColor(color: unknown, fallback: string) {
  return typeof color === 'string' && HEX_COLOR.test(color) ? color.toUpperCase() : fallback;
}

function normalizePaperColor(color: unknown) {
  return normalizeColor(color, DEFAULT_READER_CUSTOM_STYLE.paperColor);
}

function relativeLuminance(color: string) {
  const channels = color.slice(1).match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [1, 1, 1];
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

const PAPER_TEXTURE_DATA_URL = `url("data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.22" numOctaves="3" seed="11" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="220" height="220" filter="url(#paper)" opacity="0.028" />
  </svg>
`)}")`;

const GRAIN_TEXTURE_DATA_URL = `url("data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" seed="17" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="160" height="160" filter="url(#grain)" opacity="0.055" />
  </svg>
`)}")`;

export function getReaderTextureStyle(texture: ReaderTexture, isDark: boolean) {
  if (texture === 'paper') {
    return {
      backgroundImage: PAPER_TEXTURE_DATA_URL,
      backgroundSize: '220px 220px',
      backgroundPosition: '0 0',
      backgroundBlendMode: isDark ? 'soft-light' : 'multiply',
    };
  }
  if (texture === 'grain') {
    return {
      backgroundImage: GRAIN_TEXTURE_DATA_URL,
      backgroundSize: '160px 160px',
      backgroundPosition: '0 0',
      backgroundBlendMode: isDark ? 'soft-light' : 'multiply',
    };
  }
  return {
    backgroundImage: 'none',
    backgroundSize: 'auto',
    backgroundPosition: '0 0',
    backgroundBlendMode: 'normal',
  };
}

function createCustomPalette(rawPaperColor: string, rawTextColor: string): ReaderPalette {
  const paperColor = normalizePaperColor(rawPaperColor);
  const isDark = relativeLuminance(paperColor) < 0.32;
  const textColor = normalizeColor(rawTextColor, isDark ? '#E1E5EA' : '#272624');
  return isDark
    ? {
      paperColor,
      textColor,
      mutedTextColor: '#AAB2BC',
      accentColor: '#8AB4F8',
      highlightColor: '#73653D',
      calloutColor: 'rgba(255, 255, 255, 0.07)',
      isDark,
    }
    : {
      paperColor,
      textColor,
      mutedTextColor: '#6B6862',
      accentColor: '#416E99',
      highlightColor: '#E4C85F',
      calloutColor: 'rgba(0, 0, 0, 0.045)',
      isDark,
    };
}

export function getReaderDensity(density: ReaderDensity) {
  return READER_DENSITY_PRESETS.find((preset) => preset.id === density) ?? READER_DENSITY_PRESETS[1];
}

export function getReaderThemePreset(theme: ReaderTheme) {
  return READER_THEME_PRESETS.find((preset) => preset.id === theme) ?? READER_THEME_PRESETS[0];
}

export function getReaderThemeName(theme: ReaderTheme) {
  return theme === 'custom' ? '我的自定义' : getReaderThemePreset(theme).name;
}

export function resolveReaderStyle(preferences: ReaderPreferences) {
  const base = preferences.theme === 'custom'
    ? preferences.customStyle
    : getReaderThemePreset(preferences.theme);
  const palette = preferences.theme === 'custom'
    ? createCustomPalette(base.paperColor, base.textColor)
    : getReaderThemePreset(preferences.theme);
  return {
    ...base,
    ...palette,
    density: getReaderDensity(base.density),
  };
}

export function normalizeReaderCustomStyle(value: Partial<ReaderCustomStyle> | undefined): ReaderCustomStyle {
  const density = READER_DENSITY_PRESETS.some((preset) => preset.id === value?.density)
    ? value!.density!
    : DEFAULT_READER_CUSTOM_STYLE.density;
  const fontSize = typeof value?.fontSize === 'number' && Number.isFinite(value.fontSize)
    ? Math.max(14, Math.min(28, Math.round(value.fontSize)))
    : DEFAULT_READER_CUSTOM_STYLE.fontSize;
  const paperColor = normalizePaperColor(value?.paperColor);
  const isDark = relativeLuminance(paperColor) < 0.32;
  const texture = READER_TEXTURE_PRESETS.some((preset) => preset.id === value?.texture)
    ? value!.texture!
    : DEFAULT_READER_CUSTOM_STYLE.texture;
  return {
    fontFamily: value?.fontFamily ?? DEFAULT_READER_CUSTOM_STYLE.fontFamily,
    paperColor,
    textColor: normalizeColor(value?.textColor, isDark ? '#E1E5EA' : DEFAULT_READER_CUSTOM_STYLE.textColor),
    texture,
    fontSize,
    density,
  };
}

export function readerDensityFromLineHeight(lineHeight: unknown): ReaderDensity {
  if (typeof lineHeight !== 'number') return 'balanced';
  if (lineHeight <= 1.65) return 'compact';
  if (lineHeight >= 1.95) return 'relaxed';
  return 'balanced';
}

export function legacyReaderPaperColor(theme: unknown) {
  if (theme === 'night') return '#202A36';
  if (theme === 'white') return '#FAF9F6';
  return '#F3EBDD';
}
