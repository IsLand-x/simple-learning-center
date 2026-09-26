import { describe, expect, it } from 'vitest';
import {
  ALL_STATE_DOMAINS,
  LIBRARY_STATE_DOMAINS,
  READER_STATE_DOMAINS,
  RSS_STATE_DOMAINS,
  SETTINGS_STATE_DOMAINS,
  STATE_DOMAIN_FIELDS,
  VIDEO_STATE_DOMAINS,
  stateDomainsForPath,
} from './stateDomains';

describe('stateDomainsForPath', () => {
  it.each([
    ['/books/book-1', READER_STATE_DOMAINS],
    ['/rss', RSS_STATE_DOMAINS],
    ['/rss?feed=feed-1', RSS_STATE_DOMAINS],
    ['/videos', VIDEO_STATE_DOMAINS],
    ['/settings', SETTINGS_STATE_DOMAINS],
    ['/', LIBRARY_STATE_DOMAINS],
    ['/unknown', LIBRARY_STATE_DOMAINS],
  ])('maps %s to its required state domains', (pathname, expected) => {
    expect(stateDomainsForPath(pathname)).toBe(expected);
  });

  it('keeps the public domain list aligned with the field map', () => {
    expect(ALL_STATE_DOMAINS).toEqual(Object.keys(STATE_DOMAIN_FIELDS));
    expect(new Set(ALL_STATE_DOMAINS).size).toBe(ALL_STATE_DOMAINS.length);
  });
});
