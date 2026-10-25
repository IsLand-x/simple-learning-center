import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('TTS HTTP 配置不返回密钥、校验输入与试听错误，所有远程接口均需认证', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-tts-routes-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { createApp } = await import('../../../app.js');
  const app = createApp({ mode: 'local', serveFrontend: false });
  const put = (body) =>
    app.request('/api/settings/tts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await app.request('/api/settings/tts/test', { method: 'POST' })).status, 400);
  assert.equal((await put({ apiKey: 'fixture-private-key', voice: 'unknown-voice' })).status, 400);
  const saved = await put({ apiKey: 'fixture-private-key' });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal((await saved.text()).includes('fixture-private-key'), false);
  const status = await (await app.request('/api/settings/tts')).json();
  assert.equal(status.configured, true);
  assert.equal('apiKey' in status, false);
  const mock = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('private-upstream-body', { status: 401 }),
  );
  const failure = await app.request('/api/settings/tts/test', { method: 'POST' });
  assert.equal(failure.status, 502);
  const message = await failure.text();
  assert.match(message, /百炼试听失败/);
  assert.equal(message.includes('fixture-private-key'), false);
  assert.equal(message.includes('private-upstream-body'), false);
  mock.mock.restore();
  assert.equal((await app.request('/api/settings/tts', { method: 'POST' })).status, 405);
  assert.equal((await app.request('/api/settings/tts/test')).status, 405);
  const remote = createApp({
    mode: 'remote',
    serveFrontend: false,
    username: 'reader',
    password: 'fixture-password',
    authFile: join(directory, 'auth.json'),
  });
  for (const [path, method] of [
    ['/api/settings/tts', 'GET'],
    ['/api/settings/tts', 'PUT'],
    ['/api/settings/tts', 'DELETE'],
    ['/api/settings/tts/test', 'POST'],
  ])
    assert.equal((await remote.request(path, { method })).status, 401);
  assert.equal((await app.request('/api/settings/tts', { method: 'DELETE' })).status, 200);
  assert.equal((await (await app.request('/api/settings/tts')).json()).configured, false);
});
