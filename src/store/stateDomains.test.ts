import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LearningData, StateDomain } from '../../contracts/state';
import {
  ALL_STATE_DOMAINS,
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
  STATE_DOMAIN_FIELDS,
  stateDomainsForPath,
} from './stateDomains';

describe('stateDomainsForPath', () => {
  it.each([
    ['/books/book-1', READER_STATE_DOMAINS],
    ['/rss', LIBRARY_STATE_DOMAINS],
    ['/rss?feed=feed-1', LIBRARY_STATE_DOMAINS],
    ['/videos', LIBRARY_STATE_DOMAINS],
    ['/settings', SETTINGS_STATE_DOMAINS],
    ['/', LIBRARY_STATE_DOMAINS],
    ['/unknown', LIBRARY_STATE_DOMAINS],
  ])('maps %s to its required state domains', (pathname, expected) => {
    expect(stateDomainsForPath(pathname)).toBe(expected);
  });

  it('keeps the public domain list aligned with the field map', () => {
    expect(ALL_STATE_DOMAINS).toEqual(Object.keys(STATE_DOMAIN_FIELDS));
    expect(new Set(ALL_STATE_DOMAINS).size).toBe(ALL_STATE_DOMAINS.length);
    expect(
      Object.values(STATE_DOMAIN_FIELDS).filter((fields) =>
        (fields as readonly string[]).includes('chapterMindMaps'),
      ),
    ).toHaveLength(1);
    expect(STATE_DOMAIN_FIELDS.reading).toContain('chapterMindMaps');
    expect(
      Object.values(STATE_DOMAIN_FIELDS).filter((fields) =>
        (fields as readonly string[]).includes('chapterVideos'),
      ),
    ).toHaveLength(1);
    expect(STATE_DOMAIN_FIELDS.reading).toContain('chapterVideos');
  });

  it('全部活动持久化字段均且仅归属一个分区', () => {
    const fields = Object.values(STATE_DOMAIN_FIELDS).flat();
    expect(new Set(fields).size).toBe(fields.length);
    expectTypeOf<(typeof STATE_DOMAIN_FIELDS)[StateDomain][number]>().toEqualTypeOf<
      keyof LearningData
    >();
  });

  it('活动分区不再包含 RSS 和独立视频', () => {
    expect(ALL_STATE_DOMAINS).not.toContain('rss');
    expect(ALL_STATE_DOMAINS).not.toContain('videos');
  });

  it('never blocks content routes on the complete conversation history', () => {
    for (const domains of [READER_STATE_DOMAINS, LIBRARY_STATE_DOMAINS]) {
      expect(domains).not.toContain('conversations');
    }
  });
});
