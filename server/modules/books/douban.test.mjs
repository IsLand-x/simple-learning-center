import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DoubanBookLookup } from './douban.js';
const suggestions = [{ id: '1234', title: '示例书', author_name: '示例作者', type: 'b' }];
const html =
  '<span property="v:itemreviewed">示例书</span><meta property="book:author" content="示例作者"><strong property="v:average">8.6</strong><div id="link-report"><div class="intro"><p>原创简介，介绍这本书。</p></div></div><div class="review-list"><div class="review-item"><header class="main-hd"><a class="name">读者甲</a></header><div class="main-bd"><h2><a href="https://book.douban.com/review/5678/">关于思考的原创书评</a></h2></div></div><div class="review-item"><div class="main-bd"><h2><a href="javascript:alert(1)">危险链接</a></h2></div></div></div>';

test('书名和作者匹配，解析简介、评分和安全书评链接，缓存并发与过期', async () => {
  let calls = 0;
  let time = 100;
  const lookup = new DoubanBookLookup(
    async (url) => {
      calls++;
      assert.match(url, /^https:\/\/book\.douban\.com\//);
      return new Response(url.includes('subject_suggest') ? JSON.stringify(suggestions) : html);
    },
    () => time,
  );
  const results = await Promise.all([
    lookup.lookup('示例书', '示例作者'),
    lookup.lookup('示例书', '示例作者'),
  ]);
  assert.equal(calls, 2);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, 'matched');
  assert.equal(results[0].description, '原创简介，介绍这本书。');
  assert.equal(results[0].rating, 8.6);
  assert.equal(results[0].reviews.length, 1);
  assert.equal(results[0].reviews[0].url, 'https://book.douban.com/review/5678/');
  assert.equal(results[0].reviewsUrl, 'https://book.douban.com/subject/1234/reviews');
  await lookup.lookup('示例书', '示例作者');
  assert.equal(calls, 2);
  time += 24 * 60 * 60_000 + 1;
  await lookup.lookup('示例书', '示例作者');
  assert.equal(calls, 4);
});

test('同名不同作者、不正确页面、网络失败和未知作者不误匹配', async () => {
  const lookup = new DoubanBookLookup(async () => new Response(JSON.stringify(suggestions)));
  assert.equal((await lookup.lookup('示例书', '另一作者')).status, 'not_found');
  assert.equal((await lookup.lookup('示例书', '未知作者')).status, 'not_found');
  const blocked = new DoubanBookLookup(async () => {
    throw new Error('timeout');
  });
  assert.equal((await blocked.lookup('示例书', '示例作者')).status, 'unavailable');
  const wrongPage = new DoubanBookLookup(
    async (url) =>
      new Response(
        url.includes('subject_suggest')
          ? JSON.stringify(suggestions)
          : html.replace('v:itemreviewed">示例书', 'v:itemreviewed">另一本书'),
      ),
  );
  assert.equal((await wrongPage.lookup('示例书', '示例作者')).status, 'unavailable');
});

test('重定向、过大响应及恶意候选标识不能变成任意 URL 请求', async () => {
  const urls = [];
  const invalid = new DoubanBookLookup(async (url, options) => {
    urls.push(url);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify([{ ...suggestions[0], id: '../../private' }]));
  });
  assert.equal((await invalid.lookup('示例书', '示例作者')).status, 'unavailable');
  assert.equal(urls.length, 1);
  const oversized = new DoubanBookLookup(async () => new Response('x'.repeat(64_001)));
  assert.equal((await oversized.lookup('示例书', '示例作者')).status, 'unavailable');
});

test('长书名按 Unicode 字符截断，编码异常不影响分享接口', async () => {
  const urls = [];
  const lookup = new DoubanBookLookup(async (url) => {
    urls.push(new URL(url));
    return new Response('[]');
  });
  const result = await lookup.lookup('书'.repeat(199) + '📚尾', '作者');
  assert.equal(result.status, 'not_found');
  assert.equal(urls[0].searchParams.get('q'), '书'.repeat(199) + '📚');
  assert.equal((await lookup.lookup('书\ud800', '作者')).status, 'not_found');
});
