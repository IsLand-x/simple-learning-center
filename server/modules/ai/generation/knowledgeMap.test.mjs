import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'knowledge-map-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { generateBookKnowledgeMap, passageBatches } = await import('./knowledgeMap.js');
const { generateCodexImage } = await import('./codexImage.js');
const { createApp } = await import('../../../app.js');
const { atomicWrite, knowledgeMapDirectoryPath } =
  await import('../../../infrastructure/fs/files.js');
const { permanentlyDeletePersistedBook } = await import('../../books/trash.js');
after(() => rm(directory, { recursive: true, force: true }));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const book = { id: 'book', title: '示例', fileSize: 42 };
const passages = [
  { id: 'p1', chapter: '首章', text: '首段' },
  { id: 'p2', chapter: '末章', text: '末段' },
];

test('长书分批不丢失正文，超限在模型请求前报错', () => {
  const text = '全文'.repeat(40_000);
  const batches = passageBatches([{ id: 'p', chapter: '章', text }]);
  assert.ok(batches.length > 1);
  assert.equal(batches.join(''), `\n[章节：章；段落：p]\n${text}\n`);
  assert.ok(batches.every((batch) => batch.length <= 18_000));
  assert.throws(() => passageBatches([{ text: '文'.repeat(18_000 * 129) }]), /上限/);
  assert.throws(() => passageBatches([]), /没有/);
});

test('全部批次分析和分层汇总后才生图，报告真实覆盖范围', async () => {
  const events = [];
  const input = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`,
    chapter: `章${i}`,
    text: `${i}正文`.repeat(6000),
  }));
  const expected = passageBatches(input);
  const calls = [];
  const result = await generateBookKnowledgeMap({
    book,
    runtime: {},
    load: async () => input,
    summarize: async (_runtime, text) => {
      calls.push(text);
      return `分析${calls.length}`;
    },
    generateImage: async ({ prompt }) => {
      assert.match(prompt, /分析/);
      events.push('image');
      return png;
    },
    save: async () => '/saved',
    onStage: (stage) => events.push(stage),
  });
  assert.deepEqual(calls.slice(0, expected.length), expected);
  assert.equal(result.passages, 12);
  assert.equal(result.batches, expected.length);
  assert.match(result.coverage, /扫描图片/);
  assert.equal(events.at(-1), 'image');
});

test('分析失败或取消不得调用生图或保存', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    if (cancel) controller.abort();
    await assert.rejects(
      generateBookKnowledgeMap({
        book,
        runtime: {},
        signal: controller.signal,
        load: async () => passages,
        summarize: async () => {
          throw new Error('analysis failed');
        },
        generateImage: async () => assert.fail('must not generate'),
        save: async () => assert.fail('must not save'),
      }),
    );
  }
});

const token = `header.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })).toString('base64url')}.signature`;
const runtime = {
  model: { id: 'selected-model' },
  models: { getAuth: async () => ({ auth: { apiKey: token } }) },
};
const done = {
  type: 'response.output_item.done',
  item: { type: 'image_generation_call', status: 'completed', result: png.toString('base64') },
};
function stream(events) {
  const bytes = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
  );
}

test('订阅生图正确解析分片 SSE、使用所选模型且只请求固定端点', async () => {
  const result = await generateCodexImage({
    runtime,
    prompt: '地图',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://chatgpt.com/backend-api/codex/responses');
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'selected-model');
      assert.equal(body.tools[0].type, 'image_generation');
      return stream([done, { type: 'response.completed' }]);
    },
  });
  assert.deepEqual(result, png);
});

test('缺图、截断、供应商错误、无效图片不成功且不泄露凭据', async () => {
  for (const events of [
    [done],
    [{ type: 'response.completed' }],
    [{ type: 'error', message: token }],
    [
      { ...done, item: { ...done.item, result: Buffer.from('not an image').toString('base64') } },
      { type: 'response.completed' },
    ],
  ]) {
    await assert.rejects(
      generateCodexImage({ runtime, prompt: '地图', fetchImpl: async () => stream(events) }),
      (error) => {
        assert.match(error.message, /订阅生图未成功/);
        assert.ok(!error.message.includes(token));
        return true;
      },
    );
  }
});

test('自定义或 Magpie 代理通过 Responses 端点成功生图', async () => {
  const proxyConfig = {
    baseUrl: 'http://127.0.0.1:3425/v1',
    apiKey: 'magpie-test-key',
    models: ['gpt-4o'],
  };
  const proxyRuntime = {
    model: { id: 'gpt-4o', baseUrl: 'http://127.0.0.1:3425/v1' },
    models: { getAuth: async () => undefined },
  };
  const result = await generateCodexImage({
    runtime: proxyRuntime,
    config: proxyConfig,
    prompt: '地图',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:3425/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer magpie-test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-4o');
      return stream([done, { type: 'response.completed' }]);
    },
  });
  assert.deepEqual(result, png);
});

test('代理不支持 Responses 时自动回退到 images/generations 生图', async () => {
  const proxyConfig = {
    baseUrl: 'https://proxy.example.com/v1',
    apiKey: 'sk-test',
    models: ['gpt-4o'],
  };
  const proxyRuntime = {
    model: { id: 'gpt-4o', baseUrl: 'https://proxy.example.com/v1' },
    models: { getAuth: async () => undefined },
  };
  const result = await generateCodexImage({
    runtime: proxyRuntime,
    config: proxyConfig,
    prompt: '地图',
    fetchImpl: async (url, options) => {
      if (url.endsWith('/responses')) {
        return new Response('Not Found', { status: 404 });
      }
      assert.equal(url, 'https://proxy.example.com/v1/images/generations');
      assert.equal(options.headers.Authorization, 'Bearer sk-test');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'dall-e-3');
      assert.equal(body.response_format, 'b64_json');
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.deepEqual(result, png);
});

test('图片权限、鉴权、路径校验、彻底删除清理与删除竞态', async () => {
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({ version: 33, state: { books: [book] } }),
  );
  const options = {
    book,
    runtime: {},
    load: async () => passages,
    summarize: async () => '核心观点',
    generateImage: async () => png,
  };
  const result = await generateBookKnowledgeMap(options);
  const id = result.imageUrl.split('/').at(-1);
  const path = join(knowledgeMapDirectoryPath(book.id), `${id}.png`);
  assert.deepEqual(await readFile(path), png);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const app = createApp({ mode: 'local', serveFrontend: false });
  const response = await app.request(result.imageUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  assert.equal((await app.request('/api/books/book/knowledge-maps/invalid')).status, 400);
  const remote = createApp({
    mode: 'remote',
    password: 'test-only-password',
    serveFrontend: false,
  });
  assert.equal((await remote.request(result.imageUrl)).status, 401);
  await permanentlyDeletePersistedBook(book.id);
  assert.equal((await app.request(result.imageUrl)).status, 404);
  await assert.rejects(generateBookKnowledgeMap(options), /书籍已删除/);
});

test('全景生图先保存本地原图再发布 COS，保留本地与云端链接', async () => {
  const events = [];
  const localUrl = '/api/books/book/knowledge-maps/11111111-1111-4111-8111-111111111111';
  const cosUrl = 'https://images.example.test/learning-center/2026-10-17/image.png';
  const result = await generateBookKnowledgeMap({
    book,
    runtime: {},
    load: async () => passages,
    summarize: async () => '内容稿',
    generateImage: async () => png,
    save: async () => {
      events.push('local');
      return localUrl;
    },
    publishImage: async (input) => {
      events.push('cos');
      assert.equal(input.imageUrl, localUrl);
      assert.equal(input.bookId, book.id);
      assert.deepEqual(input.png, png);
      return { cosUrl };
    },
  });
  assert.deepEqual(events, ['local', 'cos']);
  assert.equal(result.imageUrl, localUrl);
  assert.equal(result.cosUrl, cosUrl);
});
