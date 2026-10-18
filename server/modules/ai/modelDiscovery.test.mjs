import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverModels } from './modelDiscovery.js';
import { createApp } from '../../app.js';

const baseUrl = 'https://provider.example/v1';
const apiKey = 'test-discovery-secret';

for (const suffix of ['', '/', '/models/', '/chat/completions/']) {
  test(`模型发现规范化地址 ${suffix || '版本路径'}、去重并忽略无效 ID`, async (t) => {
    const fetcher = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, `${baseUrl}/models`);
      assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({
        data: [{ id: 'model-a' }, { id: ' model-b ' }, { id: 'model-a' }, { id: '' }, {}, null],
      });
    });
    assert.deepEqual(await discoverModels({ baseUrl: ` ${baseUrl}${suffix} `, apiKey }), {
      baseUrl,
      models: ['model-a', 'model-b'],
    });
    assert.equal(fetcher.mock.callCount(), 1);
  });
}

test('仅填根地址时尝试同一供应商 /v1，返回可供对话使用的 Base URL', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    paths.push(url);
    assert.equal(options.headers.Authorization, undefined);
    return url.endsWith('/v1/models')
      ? Response.json({ data: [{ id: 'local-model' }] })
      : new Response(null, { status: 404 });
  });
  assert.deepEqual(await discoverModels({ baseUrl: 'http://127.0.0.1:11434/' }), {
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['local-model'],
  });
  assert.deepEqual(paths, ['http://127.0.0.1:11434/models', 'http://127.0.0.1:11434/v1/models']);
});

test('根地址返回网关 HTML 时仍会探测 /v1/models，保留自定义前缀', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    paths.push(url);
    return url.endsWith('/v1/models')
      ? Response.json({ data: [{ id: 'gateway-model' }] })
      : new Response('<html>gateway frontend</html>');
  });
  assert.deepEqual(await discoverModels({ baseUrl: 'https://gateway.example' }), {
    baseUrl: 'https://gateway.example/v1',
    models: ['gateway-model'],
  });
  assert.deepEqual(paths, ['https://gateway.example/models', 'https://gateway.example/v1/models']);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://gateway.example/custom/api/v1/models');
    return Response.json({ data: [{ id: 'custom-model' }] });
  });
  assert.equal(
    (await discoverModels({ baseUrl: 'https://gateway.example/custom/api/v1' })).baseUrl,
    'https://gateway.example/custom/api/v1',
  );
});

for (const value of [
  null,
  {},
  { baseUrl: 123 },
  { baseUrl: 'not-a-url' },
  { baseUrl: 'file:///etc/passwd' },
  { baseUrl: 'https://user:pass@provider.example/v1' },
  { baseUrl: `${baseUrl}?api_key=secret` },
  { baseUrl: `${baseUrl}#secret` },
  { baseUrl, apiKey: 'test\r\nInjected: value' },
]) {
  test(`拒绝无效的模型检测输入 ${JSON.stringify(value)}`, async (t) => {
    const fetcher = t.mock.method(globalThis, 'fetch', () => assert.fail('不得请求供应商'));
    await assert.rejects(discoverModels(value), { status: 400 });
    assert.equal(fetcher.mock.callCount(), 0);
  });
}

for (const status of [401, 403, 429, 500, 302, 404]) {
  test(`供应商 ${status} 返回可操作错误且不泄漏上游响应或触发应用重新登录`, async (t) => {
    const fetcher = t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(apiKey, { status, headers: { Location: 'https://other.example/models' } }),
    );
    const app = createApp({ mode: 'local', serveFrontend: false });
    const response = await app.request('/api/ai/models/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey }),
    });
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, new RegExp(apiKey));
    assert.match(
      body,
      status === 401 || status === 403
        ? /API Key/
        : status === 302
          ? /重定向/
          : status === 404
            ? /手动填写/
            : /检测模型失败/,
    );
    assert.equal(fetcher.mock.callCount(), 1);
  });
}

for (const body of ['<html>gateway</html>', '{}', '{"data":[]}', '{"data":[{"id":""}]}']) {
  test(`模型列表异常保持手动添加入口：${body}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(body));
    await assert.rejects(
      discoverModels({ baseUrl }),
      (error) => error.status === 502 && /手动填写/.test(error.message),
    );
  });
}

test('网络异常、超时和响应过大均不泄漏凭据', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error(apiKey);
  });
  await assert.rejects(discoverModels({ baseUrl, apiKey }), {
    status: 502,
    message: '无法连接供应商，请检查 API 地址和网络',
  });
  fetcher.mock.mockImplementation(
    async () =>
      new Response('small body', { headers: { 'content-length': String(3 * 1024 * 1024) } }),
  );
  await assert.rejects(discoverModels({ baseUrl }), /模型列表过大/);
  fetcher.mock.mockImplementation(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  await assert.rejects(discoverModels({ baseUrl }), /模型列表过大/);
  t.mock.method(AbortSignal, 'timeout', () =>
    AbortSignal.abort(new DOMException('timeout', 'TimeoutError')),
  );
  fetcher.mock.mockImplementation(async (_url, options) => {
    options.signal.throwIfAborted();
  });
  await assert.rejects(discoverModels({ baseUrl }), /检测模型超时/);
});

test('模型发现沿用远程认证，拒绝跨站与非 JSON 请求并限制请求体', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', () => assert.fail('不得访问供应商'));
  const remote = createApp({ mode: 'remote', serveFrontend: false });
  const local = createApp({ mode: 'local', serveFrontend: false });
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
  };
  assert.equal((await remote.request('/api/ai/models/discover', request)).status, 401);
  assert.equal(
    (
      await local.request('/api/ai/models/discover', {
        ...request,
        headers: { ...request.headers, Origin: 'https://outside.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await local.request('/api/ai/models/discover', {
        ...request,
        headers: { ...request.headers, 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await local.request('/api/ai/models/discover', {
        ...request,
        headers: { 'Content-Type': 'text/plain' },
      })
    ).status,
    415,
  );
  assert.equal(
    (await local.request('/api/ai/models/discover', { ...request, body: '{' })).status,
    400,
  );
  assert.equal(
    (await local.request('/api/ai/models/discover', { ...request, body: 'x'.repeat(25 * 1024) }))
      .status,
    413,
  );
  assert.equal((await local.request('/api/ai/models/discover')).status, 405);
  assert.equal(fetcher.mock.callCount(), 0);
});

test('发现接口返回统一供应商目录，凭据不包含在结果且不写入配置', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
  );
  const app = createApp({ mode: 'local', serveFrontend: false });
  const response = await app.request('/api/ai/models/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
    body: JSON.stringify({ baseUrl, apiKey }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { baseUrl, models: ['model-a', 'model-b'] });
});
