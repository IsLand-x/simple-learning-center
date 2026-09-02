import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchYouTubeChannelFeed,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
} from './youtubeFeeds.mjs';

const channelId = 'UC1234567890123456789012';

test('YouTube 频道输入支持 channel ID、handle 和频道地址', () => {
  assert.equal(parseYouTubeChannelInput(channelId).channelId, channelId);
  assert.equal(parseYouTubeChannelInput('@openai').resolveUrl, 'https://www.youtube.com/@openai');
  assert.equal(parseYouTubeChannelInput(`https://www.youtube.com/channel/${channelId}`).channelId, channelId);
});

test('YouTube handle 会解析为稳定频道 ID', async () => {
  const result = await resolveYouTubeChannel('@openai', {
    getClient: async () => ({
      resolveURL: async () => ({ payload: { browseId: channelId } }),
    }),
  });
  assert.equal(result.channelId, channelId);
  assert.match(result.feedUrl, /feeds\/videos\.xml/);
});

test('YouTube 频道使用官方 Atom Feed 并生成稳定视频 ID', async () => {
  let requestedUrl = '';
  const result = await fetchYouTubeChannelFeed({
    kind: 'youtube-channel',
    channelId,
    feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  }, {
    fetchFeed: async (url) => {
      requestedUrl = url;
      return {
        title: 'OpenAI',
        description: '',
        siteUrl: 'https://www.youtube.com/@openai',
        feedUrl: url,
        fetchedAt: 100,
        items: [{ id: 'legacy', title: '视频', link: 'https://www.youtube.com/watch?v=abcdefghijk' }],
      };
    },
  });
  assert.match(requestedUrl, new RegExp(channelId));
  assert.equal(result.items[0].id, 'youtube:abcdefghijk');
  assert.equal(result.feedUrl, `https://www.youtube.com/channel/${channelId}`);
});
