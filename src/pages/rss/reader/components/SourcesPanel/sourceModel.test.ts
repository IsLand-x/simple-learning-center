import { describe, expect, it } from 'vitest';
import { rssSourceKey } from './sourceModel';
describe('RSS source model', () => {
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
});
