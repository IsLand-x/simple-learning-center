import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectServerRssState } from './rssScheduler.mjs';
import { fetchRssSource, resolveRssSource, sourceMinimumIntervalMs } from './rssSources.mjs';

const fetched = { title: '源', feedUrl: 'https://example.com/feed.xml', items: [] };
const channelId = 'UC1234567890123456789012';

test('统一内容源解析器返回可持久化的判别联合', async () => {
  const weekly = await resolveRssSource({ kind: 'bilibili-weekly' }, {
    bilibiliWeeklyFetcher: async () => fetched,
  });
  assert.deepEqual(weekly.source, { kind: 'bilibili-weekly' });

  const up = await resolveRssSource({ kind: 'bilibili-up', input: 'https://space.bilibili.com/946974' }, {
    bilibiliUpFetcher: async () => fetched,
  });
  assert.deepEqual(up.source, { kind: 'bilibili-up', uid: '946974' });

  const youtube = await resolveRssSource({ kind: 'youtube-channel', input: '@openai' }, {
    youtubeResolver: async () => ({ channelId, feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` }),
    youtubeChannelFetcher: async () => fetched,
  });
  assert.equal(youtube.source.channelId, channelId);
});

test('统一抓取分发器按来源调用对应适配器', async () => {
  let cookieRead = false;
  const result = await fetchRssSource({ kind: 'bilibili-up', uid: '946974' }, {
    bilibiliUpFetcher: async (uid, options) => {
      assert.equal(uid, '946974');
      assert.equal(await options.getCookie(), 'SESSDATA=test');
      return fetched;
    },
    secrets: { getBilibiliCookie: async () => { cookieRead = true; return 'SESSDATA=test'; } },
  });
  assert.equal(result, fetched);
  assert.equal(cookieRead, true);
  assert.equal(sourceMinimumIntervalMs({ kind: 'bilibili-weekly' }), 6 * 60 * 60 * 1_000);
});

test('23 版来源描述不会被旧浏览器快照覆盖', () => {
  const current = {
    version: 23,
    state: {
      rssFeeds: [{ id: 'weekly', source: { kind: 'bilibili-weekly' }, lastFetchedAt: 200 }],
      rssItems: [],
      rssDailyDigests: [],
      rssDigestSettings: {},
      rssDigestRuns: [],
    },
  };
  const incoming = {
    version: 20,
    state: {
      rssFeeds: [{ id: 'weekly', lastFetchedAt: 100 }],
      rssItems: [],
      rssDailyDigests: [],
      rssDigestSettings: {},
    },
  };
  const protectedState = protectServerRssState(incoming, current);
  assert.equal(protectedState.version, 23);
  assert.deepEqual(protectedState.state.rssFeeds[0].source, { kind: 'bilibili-weekly' });
});
