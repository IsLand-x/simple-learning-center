import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchRssArticle } from './rssArticle.mjs';

const validateUrl = async (value) => new URL(value);

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

test('RSS 原文读取支持 JSON-LD 文章正文', async () => {
  const body = '这是由结构化数据提供的文章正文。'.repeat(12);
  const result = await fetchRssArticle('https://example.com/structured', {
    validateUrl,
    fetchImpl: async () => htmlResponse(`<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'NewsArticle',
        headline: '结构化文章',
        author: { name: '测试作者' },
        articleBody: body,
      })}</script>
    </head><body><div id="root"></div></body></html>`),
  });

  assert.equal(result.title, '结构化文章');
  assert.equal(result.byline, '测试作者');
  assert.equal(result.contentText, body);
  assert.match(result.contentHtml, /结构化数据提供的文章正文/);
});

test('RSS 原文读取在 CSR 首包为空时回退到渲染后的网页', async () => {
  let renderedUrl = '';
  const result = await fetchRssArticle('https://example.com/client-rendered', {
    validateUrl,
    readerConfig: { provider: 'jina', apiKey: 'test-jina-key' },
    fetchImpl: async () => htmlResponse('<!doctype html><html><head><title>动态文章</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>'),
    readRenderedPage: async (_config, url) => {
      renderedUrl = url;
      return {
        title: '动态文章',
        content: `<!doctype html><html><body><article><h1>动态文章</h1><p>${'渲染后出现的完整正文。'.repeat(20)}</p></article></body></html>`,
      };
    },
  });

  assert.equal(renderedUrl, 'https://example.com/client-rendered');
  assert.match(result.contentText, /渲染后出现的完整正文/);
  assert.equal(result.url, 'https://example.com/client-rendered');
});

test('CSR 网页未配置 Reader 时返回可操作的提示', async () => {
  await assert.rejects(
    fetchRssArticle('https://example.com/client-rendered', {
      validateUrl,
      fetchImpl: async () => htmlResponse('<!doctype html><html><body><div id="root"></div></body></html>'),
    }),
    /页面可能依赖 JavaScript，请先在设置页配置 Jina Reader 后重试/,
  );
});
