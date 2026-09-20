import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { createOAuthService } from './aiAuth/service.mjs';
import { createApp } from './app.mjs';

async function fixture(
  t,
  {
    fail = false,
    timeoutMs = 10000,
    id = 'openai-codex',
    verificationUri = 'https://auth.openai.com/codex/device',
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'ai-oauth-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let finish;
  let refreshes = 0;
  const provider = createProvider({
    id,
    name: 'Test OAuth',
    auth: {
      oauth: {
        name: 'Test',
        async login(interaction) {
          assert.equal(
            await interaction.prompt({ type: 'select', options: [{ id: 'device_code' }] }),
            'device_code',
          );
          interaction.notify({
            type: 'device_code',
            userCode: 'TEST-CODE',
            verificationUri,
          });
          await new Promise((resolve, reject) => {
            finish = resolve;
            interaction.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          });
          if (fail) throw new Error('secret-token-must-not-leak');
          return { type: 'oauth', access: 'fake-access', refresh: 'fake-refresh', expires: 1 };
        },
        async refresh() {
          refreshes++;
          return {
            type: 'oauth',
            access: 'refreshed',
            refresh: 'rotated',
            expires: Date.now() + 3600000,
          };
        },
        async toAuth(credential) {
          return { apiKey: credential.access };
        },
      },
    },
    models: [
      {
        id: 'test-model',
        provider: id,
        api: 'openai-completions',
        baseUrl: 'https://example.invalid',
        name: 'Test',
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000,
        maxTokens: 100,
      },
    ],
    api: openAICompletionsApi(),
  });
  const path = join(dir, 'oauth.json');
  const service = createOAuthService({ path, providers: [provider], timeoutMs });
  t.after(() => service.cancel(id));
  return { service, path, provider, finish: () => finish(), refreshes: () => refreshes };
}
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('状态未完成');
}

test('OAuth 设备授权、持久化、并发刷新、重启恢复与退出', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.service.status('openai-codex')).connected, false);
  await assert.rejects(f.service.runtime('openai-codex', 'test-model'), /先在设置/);
  await f.service.start('openai-codex');
  await until(async () => (await f.service.status('openai-codex')).login?.userCode);
  await assert.rejects(f.service.start('openai-codex'), /进行中/);
  f.finish();
  await until(async () => (await f.service.status('openai-codex')).connected);
  assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(await f.service.list()), /fake-access|fake-refresh/);
  const runtimes = await Promise.all([
    f.service.runtime('openai-codex', 'test-model'),
    f.service.runtime('openai-codex', 'test-model'),
  ]);
  assert.equal(f.refreshes(), 1);
  assert.equal(runtimes[0].model.id, 'test-model');
  assert.match(await readFile(f.path, 'utf8'), /rotated/);
  const restarted = createOAuthService({ path: f.path, providers: [f.provider] });
  assert.equal((await restarted.status('openai-codex')).connected, true);
  await f.service.logout('openai-codex');
  assert.equal((await restarted.status('openai-codex')).connected, false);
  await assert.rejects(f.service.start('unknown'), /不支持/);
});

test('取消与超时不会保存授权，失败信息不泄露凭据', async (t) => {
  const f = await fixture(t, { fail: true });
  await f.service.start('openai-codex');
  await until(async () => (await f.service.status('openai-codex')).login?.userCode);
  await f.service.cancel('openai-codex');
  assert.equal((await f.service.status('openai-codex')).connected, false);
  assert.equal((await f.service.status('openai-codex')).login, null);
  await f.service.start('openai-codex');
  await until(async () => (await f.service.status('openai-codex')).login?.userCode);
  f.finish();
  await until(async () => (await f.service.status('openai-codex')).login?.state === 'failed');
  assert.doesNotMatch(JSON.stringify(await f.service.list()), /secret-token/);
  const timed = await fixture(t, { timeoutMs: 20 });
  await timed.service.start('openai-codex');
  await until(async () => (await timed.service.status('openai-codex')).login?.state === 'failed');
  assert.equal((await timed.service.status('openai-codex')).connected, false);
});

test('OAuth API 要求远程会话与同源操作，响应只包含公开授权状态', async (t) => {
  const f = await fixture(t);
  const app = createApp({ serveFrontend: false, oauth: f.service });
  assert.equal((await app.request('/api/ai/oauth/providers')).status, 200);
  assert.equal(
    (await app.request('/api/ai/oauth/openai-codex/login', { method: 'POST' })).status,
    403,
  );
  assert.equal(
    (
      await app.request('/api/ai/oauth/openai-codex/login', {
        method: 'POST',
        headers: { 'X-Learning-Center-OAuth': '1', Origin: 'https://evil.invalid' },
      })
    ).status,
    403,
  );
  const headers = { 'X-Learning-Center-OAuth': '1' };
  assert.equal(
    (await app.request('/api/ai/oauth/openai-codex/login', { method: 'POST', headers })).status,
    200,
  );
  assert.equal(
    (await app.request('/api/ai/oauth/openai-codex/login', { method: 'DELETE', headers })).status,
    200,
  );
  assert.equal(
    (await app.request('/api/ai/oauth/openai-codex', { method: 'DELETE', headers })).status,
    200,
  );
  const remote = createApp({
    mode: 'remote',
    serveFrontend: false,
    oauth: f.service,
    authFile: join(tmpdir(), 'unused-oauth-auth.json'),
  });
  assert.equal((await remote.request('/api/ai/oauth/providers')).status, 401);
});

test('Kimi 设备授权接受官方网页域名，拒绝不可信授权链接', async (t) => {
  const f = await fixture(t, {
    id: 'kimi-coding',
    verificationUri: 'https://www.kimi.com/code/authorize?user_code=TEST',
  });
  await f.service.start('kimi-coding');
  await until(async () => (await f.service.status('kimi-coding')).login?.userCode);
  f.finish();
  await until(async () => (await f.service.status('kimi-coding')).connected);
  const runtime = await f.service.runtime('kimi-coding', 'test-model');
  assert.equal(runtime.model.provider, 'kimi-coding');
  await f.service.logout('kimi-coding');
  const bad = await fixture(t, { verificationUri: 'https://evil.invalid/authorize' });
  await bad.service.start('openai-codex');
  await until(async () => (await bad.service.status('openai-codex')).login?.state === 'failed');
  assert.doesNotMatch(JSON.stringify(await bad.service.list()), /evil.invalid/);
});

test('损坏的凭据文件不会把内容放入错误消息', async (t) => {
  const f = await fixture(t);
  await writeFile(f.path, '{"secret-token-must-not-leak": broken', { mode: 0o600 });
  await assert.rejects(f.service.list(), (error) => {
    assert.doesNotMatch(error.message, /secret-token/);
    assert.equal(error.expose, true);
    return true;
  });
});
