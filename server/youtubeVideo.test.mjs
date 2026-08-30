import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchYouTubeVideo,
  parseTimedTextJson,
  parseYouTubeVideoId,
} from './youtubeVideo.mjs';

test('识别常见 YouTube 链接并拒绝其他站点', () => {
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=30'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.throws(() => parseYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), /只支持 YouTube/);
});

test('解析 json3 格式时间轴字幕', () => {
  assert.deepEqual(parseTimedTextJson({
    events: [
      { tStartMs: 1_250, dDurationMs: 2_000, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] },
      { tStartMs: 3_500, dDurationMs: 1_000, segs: [{ utf8: '\n' }] },
    ],
  }), [{ startSeconds: 1.25, durationSeconds: 2, text: 'Hello world' }]);
});

test('导入视频元数据、原文字幕与简体中文翻译', async () => {
  const requestedLanguages = [];
  const payloadFor = (translated) => ({
    events: [{
      tStartMs: 0,
      dDurationMs: 2_000,
      segs: [{ utf8: translated ? '你好，世界' : 'Hello world' }],
    }],
  });
  const result = await fetchYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    getClient: async () => ({
      getBasicInfo: async () => ({
        basic_info: {
          title: '测试视频',
          duration: 120,
          short_description: '测试简介',
          channel: { id: 'channel-1', name: '测试频道' },
        },
        captions: {
          caption_tracks: [{
            base_url: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en',
            language_code: 'en',
            is_translatable: true,
            name: { toString: () => 'English' },
          }],
        },
      }),
    }),
    fetchImpl: async (url) => {
      const language = new URL(url).searchParams.get('tlang');
      requestedLanguages.push(language);
      return new Response(JSON.stringify(payloadFor(Boolean(language))), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(result.youtubeVideoId, 'dQw4w9WgXcQ');
  assert.equal(result.channelTitle, '测试频道');
  assert.equal(result.captions.original[0].text, 'Hello world');
  assert.equal(result.captions.chinese[0].text, '你好，世界');
  assert.deepEqual(requestedLanguages, [null, 'zh-Hans']);
});

test('元数据客户端不可用时按 MWEB、WEB 顺序回退', async () => {
  const clients = [];
  const result = await fetchYouTubeVideo('dQw4w9WgXcQ', {
    getClient: async () => ({
      getBasicInfo: async (_videoId, { client }) => {
        clients.push(client);
        if (client === 'MWEB') {
          return { playability_status: { status: 'UNPLAYABLE', reason: '客户端暂不可用' } };
        }
        return {
          basic_info: {
            title: '回退成功',
            duration: 30,
            channel: { id: 'channel-2', name: '测试频道' },
          },
        };
      },
    }),
  });
  assert.deepEqual(clients, ['MWEB', 'WEB']);
  assert.equal(result.title, '回退成功');
});

test('服务端连接 YouTube 超时时返回可操作的代理提示', async () => {
  const cause = Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
  await assert.rejects(
    fetchYouTubeVideo('dQw4w9WgXcQ', {
      getClient: async () => {
        throw new TypeError('fetch failed', { cause });
      },
    }),
    (error) => {
      assert.equal(error.status, 504);
      assert.equal(error.expose, true);
      assert.match(error.message, /LEARNING_CENTER_YOUTUBE_PROXY/);
      return true;
    },
  );
});
