import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearBilibiliWbiCache,
  fetchBilibiliUp,
  fetchBilibiliWeekly,
  parseBilibiliUpInput,
} from './bilibiliFeeds.mjs';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('B站 UP 主输入支持 UID 和空间地址', () => {
  assert.equal(parseBilibiliUpInput('946974'), '946974');
  assert.equal(parseBilibiliUpInput('https://space.bilibili.com/946974/video'), '946974');
  assert.throws(() => parseBilibiliUpInput('https://example.com/946974'));
});

test('B站每周必看会解析当前期次和视频列表', async () => {
  const responses = [
    { code: 0, data: [{ number: 321, name: '本周精选' }] },
    { code: 0, data: { list: [{ bvid: 'BV1xx411c7mD', title: '测试视频', author: '测试作者', pic: '//i.example.com/a.jpg', rcmd_reason: '本周推荐' }] } },
  ];
  const result = await fetchBilibiliWeekly({
    fetchImpl: async () => jsonResponse(responses.shift()),
    now: () => 200_000,
  });
  assert.equal(result.title, 'B站每周必看');
  assert.match(result.description, /321/);
  assert.equal(result.items[0].id, 'bilibili:BV1xx411c7mD');
  assert.equal(result.items[0].imageUrl, 'https://i.example.com/a.jpg');
  assert.equal(result.items[0].publishedAt, 200_000);
  assert.equal(result.items[0].publishedAtIsFallback, true);
});

test('B站 UP 主匿名请求触发风控后才使用保存的 Cookie', async () => {
  clearBilibiliWbiCache();
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), cookie: init.headers.Cookie || '' });
    if (String(url).includes('/nav')) {
      return jsonResponse({
        code: 0,
        data: {
          isLogin: Boolean(init.headers.Cookie),
          wbi_img: {
            img_url: 'https://i.example.com/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN.png',
            sub_url: 'https://i.example.com/NMLKJIHGFEDCBA9876543210zyxwvutsrqponmlkjihgfedcba.png',
          },
        },
      });
    }
    if (!init.headers.Cookie) return jsonResponse({ code: -352, message: '风控校验失败' });
    return jsonResponse({
      code: 0,
      data: { list: { vlist: [{ bvid: 'BV1xx411c7mD', title: '最新投稿', author: 'UP 测试', created: 100 }] } },
    });
  };
  const result = await fetchBilibiliUp('946974', {
    fetchImpl,
    getCookie: async () => 'SESSDATA=test',
    now: () => 200_000,
  });
  assert.equal(result.title, 'UP 测试');
  assert.equal(result.items.length, 1);
  assert.ok(requests.some((request) => !request.cookie));
  assert.ok(requests.some((request) => request.cookie === 'SESSDATA=test'));
});
