import type { ReaderFont } from '../types';

export const READER_FONT_STACKS: Record<ReaderFont, string> = {
  'system-serif': '"Songti SC", STSong, SimSun, Georgia, serif',
  'source-serif': '"Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif',
  sans: '"Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  kai: '"LXGW WenKai", "Kaiti SC", STKaiti, KaiTi, serif',
  bright: '"LXGW Bright", "LXGW WenKai", "Kaiti SC", serif',
  pingfang: '"PingFang SC", "PingFang TC", "Hiragino Sans GB", "Noto Sans SC", sans-serif',
};

export const READER_FONT_OPTIONS: Array<{ value: ReaderFont; label: string }> = [
  { value: 'system-serif', label: '系统宋体' },
  { value: 'source-serif', label: '思源宋体' },
  { value: 'kai', label: '霞鹜文楷' },
  { value: 'bright', label: '霞鹜 Bright' },
  { value: 'sans', label: '思源黑体' },
  { value: 'pingfang', label: '苹方' },
];

const READER_FONT_STYLESHEETS: Partial<Record<ReaderFont, string>> = {
  'source-serif': 'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.3.0/400.css',
  sans: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.0/400.css',
  kai: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
  bright: 'https://cdn.jsdelivr.net/npm/@krosdai/lxgw-bright@2.0.0/400-normal.css',
  pingfang: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.0/400.css',
};

export function getReaderFontStylesheet(font: ReaderFont) {
  return READER_FONT_STYLESHEETS[font];
}

const fontLoads = new WeakMap<Document, Map<ReaderFont, Promise<void>>>();

export function ensureReaderFontStylesheet(targetDocument: Document, font: ReaderFont) {
  const stylesheet = getReaderFontStylesheet(font);
  if (!stylesheet || !targetDocument.head) return Promise.resolve();

  let documentLoads = fontLoads.get(targetDocument);
  if (!documentLoads) {
    documentLoads = new Map();
    fontLoads.set(targetDocument, documentLoads);
  }
  const pending = documentLoads.get(font);
  if (pending) return pending;

  const load = new Promise<void>((resolve) => {
    const selector = `link[data-reader-font="${font}"]`;
    const existing = targetDocument.head.querySelector<HTMLLinkElement>(selector);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const link = existing ?? targetDocument.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheet;
    link.crossOrigin = 'anonymous';
    link.dataset.readerFont = font;
    link.addEventListener('load', () => {
      link.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      documentLoads?.delete(font);
      resolve();
    }, { once: true });
    if (!existing) targetDocument.head.appendChild(link);
  });
  documentLoads.set(font, load);
  return load;
}
