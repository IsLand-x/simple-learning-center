import { normalizeReaderCustomStyle } from '../lib/readerThemes';
import type { ReaderCustomStyle, ReaderFont, ReaderTheme, RssFeed } from '../types';

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
  return theme === 'paper' ||
    theme === 'ivory' ||
    theme === 'mist' ||
    theme === 'celadon' ||
    theme === 'twilight' ||
    theme === 'rice' ||
    theme === 'azure' ||
    theme === 'ink' ||
    theme === 'parchment' ||
    theme === 'blossom' ||
    theme === 'lavender' ||
    theme === 'forest' ||
    theme === 'graphite' ||
    theme === 'oled' ||
    theme === 'custom'
    ? theme
    : 'custom';
}

export function normalizeRssFeedSource(feed: RssFeed): RssFeed {
  const source = feed.source;
  if (source?.kind === 'rss' && typeof source.feedUrl === 'string' && source.feedUrl) return feed;
  if (source?.kind === 'bilibili-weekly') return feed;
  if (source?.kind === 'bilibili-up' && typeof source.uid === 'string' && source.uid) return feed;
  if (
    source?.kind === 'youtube-channel' &&
    typeof source.channelId === 'string' &&
    source.channelId &&
    typeof source.feedUrl === 'string' &&
    source.feedUrl
  )
    return feed;
  return {
    ...feed,
    source: { kind: 'rss', feedUrl: feed.url },
  };
}
