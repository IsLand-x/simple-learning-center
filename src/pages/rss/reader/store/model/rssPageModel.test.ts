import { describe, expect, it } from 'vitest';
import {
  digestPreview,
  folderFeedsDroppableId,
  folderIdFromFeedsDroppable,
  isTimeRange,
  rssSourceKey,
} from './rssPageModel';

describe('RSS page model', () => {
  it('round-trips folder droppable ids', () => {
    const droppableId = folderFeedsDroppableId('folder:1');
    expect(folderIdFromFeedsDroppable(droppableId)).toBe('folder:1');
    expect(folderIdFromFeedsDroppable('rss-feeds:unfiled')).toBeUndefined();
    expect(folderIdFromFeedsDroppable('unknown')).toBeNull();
  });

  it('accepts only supported time ranges', () => {
    expect(isTimeRange('today')).toBe(true);
    expect(isTimeRange('seven-days')).toBe(true);
    expect(isTimeRange('all')).toBe(true);
    expect(isTimeRange('month')).toBe(false);
  });

  it('builds stable keys for every source kind', () => {
    expect(rssSourceKey({ kind: 'rss', feedUrl: 'https://example.com/feed' })).toBe(
      'rss:https://example.com/feed',
    );
    expect(rssSourceKey({ kind: 'bilibili-weekly' })).toBe('bilibili-weekly');
    expect(rssSourceKey({ kind: 'bilibili-up', uid: '42' })).toBe('bilibili-up:42');
    expect(
      rssSourceKey({ kind: 'youtube-channel', channelId: 'UC1', feedUrl: 'https://example.com' }),
    ).toBe('youtube-channel:UC1');
  });

  it('creates the same compact digest preview without markdown punctuation', () => {
    expect(digestPreview('## **主题** [来源](https://example.com)\n下一行')).toBe(
      ' 主题 来源https://example.com 下一行',
    );
  });
});
