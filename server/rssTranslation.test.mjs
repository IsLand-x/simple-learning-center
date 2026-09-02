import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completeRssTranslation,
  parseRssTranslationResponse,
  prepareRssTranslationSource,
  renderRssTranslation,
} from './rssTranslation.mjs';

function translatedSegments(source, translate = (segment) => `译：${segment.text}`) {
  return source.segments.map((segment) => ({
    id: segment.id,
    text: translate(segment),
  }));
}

test('RSS 翻译保留原始 HTML 结构、图片与不可翻译代码', () => {
  const source = prepareRssTranslationSource({
    contentHtml: [
      '<article>',
      '<h2>Headline</h2>',
      '<p>Hello <strong>world</strong>.</p>',
      '<figure><img src="/photo.jpg" alt="Original photo"><figcaption>Caption</figcaption></figure>',
      '<blockquote>Quoted idea</blockquote>',
      '<table><tbody><tr><th>Label</th><td>Value</td></tr></tbody></table>',
      '<pre><code>const answer = 42;</code></pre>',
      '</article>',
    ].join(''),
  });

  assert.deepEqual(
    source.segments.map((segment) => segment.text),
    ['Headline', 'Hello', 'world', '.', 'Caption', 'Quoted idea', 'Label', 'Value'],
  );
  assert.equal(source.segments.some((segment) => segment.text.includes('/photo.jpg')), false);
  assert.equal(source.segments.some((segment) => segment.text.includes('const answer')), false);

  const response = JSON.stringify({ version: 1, segments: translatedSegments(source) });
  const result = completeRssTranslation(response, source);
  assert.match(result.html, /<h2>译：Headline<\/h2>/);
  assert.match(result.html, /<p>译：Hello <strong>译：world<\/strong>译：\.<\/p>/);
  assert.match(result.html, /<img src="\/photo\.jpg" alt="Original photo">/);
  assert.match(result.html, /<figcaption>译：Caption<\/figcaption>/);
  assert.match(result.html, /<pre><code>const answer = 42;<\/code><\/pre>/);
});

test('RSS 翻译把模型文本作为纯文本回填，不能注入 HTML', () => {
  const source = prepareRssTranslationSource({ contentHtml: '<p>Unsafe text</p>' });
  const translations = new Map([[source.segments[0].id, '<script>alert(1)</script>']]);
  const result = renderRssTranslation(source, translations);
  assert.equal(result.html.includes('<script>'), false);
  assert.match(result.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('RSS 翻译拒绝缺失、重复或未知的片段 id', () => {
  const source = prepareRssTranslationSource({ contentHtml: '<p>First</p><p>Second</p>' });
  assert.throws(
    () => parseRssTranslationResponse(JSON.stringify({
      version: 1,
      segments: [{ id: source.segments[0].id, text: '第一' }],
    }), source),
    /翻译片段不完整/,
  );
  assert.throws(
    () => parseRssTranslationResponse(JSON.stringify({
      version: 1,
      segments: [
        { id: source.segments[0].id, text: '第一' },
        { id: source.segments[0].id, text: '重复' },
      ],
    }), source),
    /翻译片段不完整/,
  );
  assert.throws(
    () => parseRssTranslationResponse(JSON.stringify({
      version: 1,
      segments: translatedSegments(source).concat({ id: 'unknown', text: '未知' }),
    }), source),
    /翻译片段不完整/,
  );
});

test('RSS 翻译兼容模型返回的 JSON 代码围栏', () => {
  const source = prepareRssTranslationSource({ contentText: 'Plain text' });
  const translations = parseRssTranslationResponse(
    `\`\`\`json\n${JSON.stringify({ version: 1, segments: translatedSegments(source) })}\n\`\`\``,
    source,
  );
  assert.equal(translations.get('t1'), '译：Plain text');
});

test('RSS 翻译长文本分段不会拆开 Unicode 代理对', () => {
  const source = prepareRssTranslationSource({ contentText: `${'a'.repeat(3_999)}😀${'b'.repeat(20)}` });
  source.segments.forEach((segment) => {
    assert.equal(/[\uD800-\uDBFF]$/u.test(segment.text), false);
    assert.equal(/^[\uDC00-\uDFFF]/u.test(segment.text), false);
  });
  assert.equal(source.segments.map((segment) => segment.text).join(''), `${'a'.repeat(3_999)}😀${'b'.repeat(20)}`);
});
